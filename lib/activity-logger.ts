import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

type LogType = 'ACCESS' | 'OP' | 'CHATS';

const TABLE_NAME = process.env.ACTIVITY_TABLE_NAME || 'sekokan-quiz-logs';
const LOG_TTL_SECONDS = 90 * 24 * 60 * 60;

function createClient(): DynamoDBDocumentClient {
  const config: ConstructorParameters<typeof DynamoDBClient>[0] = {
    region: process.env.AWS_REGION || 'ap-northeast-1',
  };
  if (process.env.AWS_ACCESS_KEY_ID) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    };
  }
  return DynamoDBDocumentClient.from(new DynamoDBClient(config));
}

function ttl(): number {
  return Math.floor(Date.now() / 1000) + LOG_TTL_SECONDS;
}

function jstDate(date = new Date()): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function jstDateTime(date: Date): string {
  return date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function idSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}

export async function logAccess(params: {
  ip: string;
  path: string;
  method: string;
  userAgent?: string;
}): Promise<void> {
  const now = new Date();
  try {
    await createClient().send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `ACCESS#${jstDate(now)}`,
        sk: `${now.toISOString()}#${idSuffix()}`,
        ip: params.ip,
        path: params.path,
        method: params.method,
        userAgent: params.userAgent || '',
        timestamp: now.toISOString(),
        timestampJST: jstDateTime(now),
        ttl: ttl(),
      },
    }));
  } catch {
    // Logging is best-effort.
  }
}

export async function logOperation(params: {
  ip: string;
  operation: 'chat' | 'diagnose' | 'report' | 'cost';
  details?: Record<string, unknown>;
}): Promise<void> {
  const now = new Date();
  try {
    await createClient().send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `OP#${jstDate(now)}`,
        sk: `${now.toISOString()}#${idSuffix()}`,
        ip: params.ip,
        operation: params.operation,
        details: params.details || {},
        timestamp: now.toISOString(),
        timestampJST: jstDateTime(now),
        ttl: ttl(),
      },
    }));
  } catch {
    // Logging is best-effort.
  }
}

export async function logChat(params: {
  sessionId: string;
  ip: string;
  messages: Array<{ role: string; content: string }>;
  userAgent?: string;
}): Promise<void> {
  const now = new Date();
  const date = jstDate(now);
  const messages = params.messages.map((message) => ({
    role: message.role,
    content: message.content.slice(0, 5000),
  }));
  const preview = (params.messages.find((message) => message.role === 'user')?.content || '').slice(0, 100);

  try {
    const client = createClient();
    await client.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `CHAT#${params.sessionId}`,
        sk: 'latest',
        ip: params.ip,
        userAgent: params.userAgent || '',
        messages,
        messageCount: messages.length,
        preview,
        date,
        updatedAt: now.toISOString(),
        updatedAtJST: jstDateTime(now),
        ttl: ttl(),
      },
    }));

    await client.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `CHATS#${date}`, sk: params.sessionId },
      UpdateExpression: 'SET ip = :ip, preview = :preview, messageCount = :messageCount, updatedAt = :updatedAt, updatedAtJST = :updatedAtJST, #ttl = :ttl',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':ip': params.ip,
        ':preview': preview,
        ':messageCount': messages.length,
        ':updatedAt': now.toISOString(),
        ':updatedAtJST': jstDateTime(now),
        ':ttl': ttl(),
      },
    }));
  } catch {
    // Logging is best-effort.
  }
}

export async function queryLogs(type: LogType, date: string, limit = 100) {
  const result = await createClient().send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `${type}#${date}` },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return result.Items || [];
}

export async function countLogs(type: LogType, date: string): Promise<number> {
  const result = await createClient().send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `${type}#${date}` },
    Select: 'COUNT',
  }));
  return result.Count ?? 0;
}

export async function getChatSession(sessionId: string) {
  const result = await createClient().send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND sk = :sk',
    ExpressionAttributeValues: {
      ':pk': `CHAT#${sessionId}`,
      ':sk': 'latest',
    },
  }));
  return result.Items?.[0] || null;
}
