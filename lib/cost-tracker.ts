import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

interface CostRecord {
  input_tokens: number;
  output_tokens: number;
  cost_yen: number;
  request_count: number;
}

export interface DailyCost {
  date: string;
  cost_yen: number;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
}

const INPUT_USD_PER_1M = 0.25;
const OUTPUT_USD_PER_1M = 1.25;
const USD_JPY = 150;
const TABLE_NAME = process.env.ACTIVITY_TABLE_NAME || 'sekokan-quiz-logs';
const MONTHLY_LIMIT_YEN = Number(process.env.BEDROCK_MONTHLY_LIMIT_YEN || '5000');

let cache: CostRecord = { input_tokens: 0, output_tokens: 0, cost_yen: 0, request_count: 0 };

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

function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_USD_PER_1M * USD_JPY;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_USD_PER_1M * USD_JPY;
  return inputCost + outputCost;
}

async function readMonthlyRecord(): Promise<CostRecord & { month: string }> {
  const month = monthKey();
  try {
    const result = await createClient().send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `COST#${month}`, sk: 'monthly' },
    }));
    const item = result.Item || {};
    return {
      month,
      input_tokens: Number(item.input_tokens || 0),
      output_tokens: Number(item.output_tokens || 0),
      cost_yen: Number(item.cost_yen || 0),
      request_count: Number(item.request_count || 0),
    };
  } catch {
    return { month, input_tokens: 0, output_tokens: 0, cost_yen: 0, request_count: 0 };
  }
}

export function checkBudget(): { ok: boolean; remaining_yen: number; used_yen: number; limit_yen: number } {
  const remaining = MONTHLY_LIMIT_YEN - cache.cost_yen;
  return {
    ok: remaining > 0,
    remaining_yen: Math.max(0, Math.round(remaining)),
    used_yen: Math.round(cache.cost_yen),
    limit_yen: MONTHLY_LIMIT_YEN,
  };
}

export async function checkBudgetAsync(): Promise<{ ok: boolean; remaining_yen: number; used_yen: number; limit_yen: number }> {
  const record = await readMonthlyRecord();
  cache = record;
  return checkBudget();
}

export async function recordUsage(inputTokens: number, outputTokens: number): Promise<{ cost_yen: number }> {
  const costYen = calculateCost(inputTokens, outputTokens);
  const month = monthKey();
  const day = dayKey();
  const additions = {
    ':inputTokens': inputTokens,
    ':outputTokens': outputTokens,
    ':costYen': costYen,
    ':requestCount': 1,
  };

  try {
    await Promise.all([
      createClient().send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `COST#${month}`, sk: 'monthly' },
        UpdateExpression: 'ADD input_tokens :inputTokens, output_tokens :outputTokens, cost_yen :costYen, request_count :requestCount',
        ExpressionAttributeValues: additions,
      })),
      createClient().send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `COST#${month}`, sk: `daily#${day}` },
        UpdateExpression: 'ADD input_tokens :inputTokens, output_tokens :outputTokens, cost_yen :costYen, request_count :requestCount',
        ExpressionAttributeValues: additions,
      })),
    ]);
  } catch {
    // Cost tracking is best-effort; API responses should not fail because metering failed.
  }

  cache = {
    input_tokens: cache.input_tokens + inputTokens,
    output_tokens: cache.output_tokens + outputTokens,
    cost_yen: cache.cost_yen + costYen,
    request_count: cache.request_count + 1,
  };

  return { cost_yen: costYen };
}

export async function getMonthlyStats() {
  const record = await readMonthlyRecord();
  cache = record;
  return {
    month: record.month,
    input_tokens: record.input_tokens,
    output_tokens: record.output_tokens,
    cost_yen: Math.round(record.cost_yen),
    request_count: record.request_count,
    limit_yen: MONTHLY_LIMIT_YEN,
    remaining_yen: Math.max(0, Math.round(MONTHLY_LIMIT_YEN - record.cost_yen)),
  };
}

export async function getDailyCosts(): Promise<DailyCost[]> {
  const month = monthKey();
  try {
    const result = await createClient().send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `COST#${month}`,
        ':prefix': 'daily#',
      },
    }));

    return (result.Items || [])
      .map((item) => ({
        date: String(item.sk || '').replace('daily#', ''),
        cost_yen: Math.round(Number(item.cost_yen || 0)),
        request_count: Number(item.request_count || 0),
        input_tokens: Number(item.input_tokens || 0),
        output_tokens: Number(item.output_tokens || 0),
      }))
      .sort((left, right) => left.date.localeCompare(right.date));
  } catch {
    return [];
  }
}
