import { NextRequest } from 'next/server';
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type ContentBlock,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { checkBudgetAsync, recordUsage } from '@/lib/cost-tracker';
import { logChat, logOperation } from '@/lib/activity-logger';
import { serverEvents } from '@/lib/event-emitter';

type ChatRole = 'user' | 'assistant';
type IncomingContent = string | { text?: string; image?: string };
type IncomingMessage = { role: ChatRole; content: IncomingContent };
type QuizContext = {
  level?: string;
  year?: string;
  no?: number;
  subject?: string;
  theme?: string;
  question?: string;
  choices?: string[];
  correctAnswer?: number;
  userSelection?: number;
  explanation?: string;
};

const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 4000;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

const requestBuckets = new Map<string, { count: number; resetAt: number }>();

const BASE_PROMPT = `あなたは「電気工事施工管理技士 試験対策の家庭教師」です。
受験生 (樽石さん、および同部署のメンバー) が過去問を解く際の解説・補足説明・関連知識の整理を担当します。

## あなたの役割
- 問題の正答とその根拠を、初学者にも分かるように噛み砕いて説明する
- 誤答選択肢がなぜ間違いなのかを具体的に説明する
- 似た問題が出たときの覚え方・解き方のコツを提示する
- 受験生が「丸暗記すべき」か「理解が必要」かを明確にする
- 公式や法令の根拠条文があれば併記する

## ⚠️ 最重要 — 設問の極性を見極めること
この試験は **「不適当なものはどれか」「誤っているものはどれか」「定められていないものはどれか」** の形式が約70%を占めます。
正答番号 = **誤った文・該当しない文** の番号 です。

**必ず処理する順序:**
1. 設問文を読み、「適当」「正しい」を選ぶ問題か、「不適当」「誤り」「定められていない」を選ぶ問題かを判定
2. 正答番号の選択肢を読む
3. **不適当系の問題なら、正答=「事実と異なる文」なので、正答の文の内容を真実として扱わないこと**
4. 正しい知識を別途記述する (例: 選択肢1の「○○が減少する」は誤り。**正しくは「○○は増加する」**)

語呂合わせや暗記カードを作る時も、**正答 = 誤った選択肢の内容 (不適当系問題の場合)** を絶対に「事実」として暗記させてはいけない。必ず「実際は○○」と訂正した上で、訂正した事実を覚えさせる。

## 解説フォーマット (初回解説時)
以下の見出し構造で出力してください。スマホでも読みやすいよう簡潔に：

**✅ 正答: X番 (理由を1〜2行で)**

**❌ 誤答の理由**
- 1番: …
- 2番: …
- (正答以外のみ)

**🔑 覚え方 / 解くコツ**
キーフレーズ・語呂・公式 (該当する場合のみ)

**📚 分類**
丸暗記 / 理解必須 / 公式一発 / 問答暗記 のいずれか + 一行解説

2回目以降の追加質問は、上記フォーマットに縛られず自然に答えて構いません。

## 会話ルール
- 必ず日本語で答える
- 全体で 400-600字 を目安 (長文は避ける、スマホで読める長さに)
- 計算問題は途中式を書く (LaTeX 不使用、プレーンテキストで)
- 法規問題は出典 (建設業法◯条、電気事業法◯条等) を明示
- 選択肢を参照する時は「選択肢1」のように番号で
- 公式解説 (kakomonn由来) があれば最優先で参照し、矛盾があれば公式に従う
- AIの推測には「※推測ですが」と明示する
`;

const QUIZ_CONTEXT_PROMPT = (ctx: QuizContext): string => {
  if (!ctx || !ctx.question) return '';
  const parts = [
    `\n## 現在の問題コンテキスト`,
    `- 級: ${ctx.level || '不明'}`,
    `- 年度: ${ctx.year || '不明'}`,
    `- 問題No: ${ctx.no ?? '不明'}`,
    `- 科目: ${ctx.subject || '不明'}`,
    ctx.theme ? `- テーマ: ${ctx.theme}` : '',
    `\n### 問題本文\n${ctx.question}`,
    ctx.choices && ctx.choices.length > 0
      ? `\n### 選択肢\n${ctx.choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : '',
    ctx.correctAnswer ? `\n### 正答\n${ctx.correctAnswer}番\n(注意: この問題が「不適当」「誤り」「定められていない」を選ぶ問題なら、正答番号の選択肢の文は **事実と異なる** ことを意味します。事実を述べるときは必ず訂正後の正しい知識を書いてください。)` : '',
    ctx.userSelection ? `\n### 受験生の選択\n${ctx.userSelection}番` : '',
    ctx.explanation ? `\n### 公式解説 (kakomonn由来、優先情報源)\n${ctx.explanation}` : '',
  ].filter(Boolean);
  return parts.join('\n');
};

function throttle(ip: string): boolean {
  const now = Date.now();
  const bucket = requestBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT_MAX;
}

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function textOf(content: IncomingContent): string {
  return typeof content === 'string' ? content : content?.text || '';
}

function validateMessages(value: unknown): { ok: true; messages: IncomingMessage[] } | { ok: false; status: number; error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, status: 400, error: 'メッセージが空です。' };
  }
  if (value.length > MAX_MESSAGES) {
    return { ok: false, status: 400, error: `メッセージ数が上限（${MAX_MESSAGES}件）を超えています。` };
  }

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return { ok: false, status: 400, error: 'メッセージの形式が不正です。' };
    }
    const message = item as Partial<IncomingMessage>;
    if (message.role !== 'user' && message.role !== 'assistant') {
      return { ok: false, status: 400, error: 'roleはuserまたはassistantのみ許可されます。' };
    }
    const contentText = textOf(message.content ?? '');
    if (contentText.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, status: 400, error: `メッセージが長すぎます（上限${MAX_MESSAGE_LENGTH}文字）。` };
    }
  }

  return { ok: true, messages: value as IncomingMessage[] };
}

function createBedrockClient() {
  const config: ConstructorParameters<typeof BedrockRuntimeClient>[0] = {
    region: process.env.AWS_REGION || 'ap-northeast-1',
  };
  if (process.env.AWS_ACCESS_KEY_ID) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    };
  }

  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    config.requestHandler = new NodeHttpHandler({ httpsAgent: agent, httpAgent: agent });
  }

  return new BedrockRuntimeClient(config);
}

function toContentBlocks(content: IncomingContent): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const contentText = textOf(content);
  if (contentText) blocks.push({ text: contentText } as ContentBlock);

  if (typeof content === 'object' && content.image) {
    const match = content.image.match(/^data:image\/(jpeg|jpg|png|gif|webp);base64,(.+)$/);
    if (match) {
      const format = match[1] === 'jpg' ? 'jpeg' : match[1];
      const bytes = Uint8Array.from(Buffer.from(match[2], 'base64'));
      if (bytes.length <= 5 * 1024 * 1024) {
        blocks.push({ image: { format, source: { bytes } } } as ContentBlock);
      }
    }
  }

  return blocks;
}

function toBedrockMessages(messages: IncomingMessage[]): Message[] {
  return messages.map((message) => ({
    role: message.role,
    content: toContentBlocks(message.content),
  })) as Message[];
}

export async function POST(req: NextRequest) {
  const ip = getIp(req);
  if (!throttle(ip)) {
    return Response.json({ error: 'リクエストが多すぎます。少し待ってから再度お試しください。' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const validated = validateMessages(body.messages);
    if (!validated.ok) {
      return Response.json({ error: validated.error }, { status: validated.status });
    }

    // AWS 認証情報は env / ~/.aws/credentials / IAM role いずれでも OK
    // (SDK の標準クレデンシャル探索チェーンに任せる)

    const budget = await checkBudgetAsync();
    if (!budget.ok) {
      return Response.json(
        { error: `今月のAPI利用上限（約${budget.limit_yen.toLocaleString()}円）に達しました。来月までお待ちください。` },
        { status: 429 },
      );
    }

    const quizContext: QuizContext = body.quizContext || {};
    const systemPrompt = `${BASE_PROMPT}${QUIZ_CONTEXT_PROMPT(quizContext)}`;
    const modelId = process.env.BEDROCK_MODEL_ID || 'apac.anthropic.claude-3-haiku-20240307-v1:0';
    const client = createBedrockClient();
    const response = await client.send(new ConverseStreamCommand({
      modelId,
      system: [{ text: systemPrompt }],
      messages: toBedrockMessages(validated.messages),
      inferenceConfig: { maxTokens: 1200, temperature: 0.3 },
    }));

    const encoder = new TextEncoder();
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : crypto.randomUUID();
    const inputEstimate = Math.ceil((systemPrompt.length + validated.messages.map((message) => textOf(message.content)).join('').length) / 2);
    let outputEstimate = 0;
    let fullResponse = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (response.stream) {
            for await (const event of response.stream) {
              const delta = event.contentBlockDelta?.delta?.text;
              if (delta) {
                fullResponse += delta;
                outputEstimate += Math.ceil(delta.length / 2);
                controller.enqueue(encoder.encode(delta));
              }
              const usage = event.metadata?.usage;
              if (usage) {
                recordUsage(usage.inputTokens || inputEstimate, usage.outputTokens || outputEstimate).catch(() => {});
              }
            }
          }

          controller.close();
          const plainMessages = validated.messages.map((message) => ({ role: message.role, content: textOf(message.content) }));
          plainMessages.push({ role: 'assistant', content: fullResponse });
          logChat({ sessionId, ip, messages: plainMessages, userAgent: req.headers.get('user-agent') || '' }).catch(() => {});
          logOperation({ ip, operation: 'chat', details: { sessionId, messageCount: plainMessages.length, quizNo: quizContext.no } }).catch(() => {});
          serverEvents.emit({ type: 'chat', timestamp: Date.now(), data: { sessionId, messageCount: plainMessages.length, ip } });
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return Response.json({ error: 'チャットの処理中にエラーが発生しました。' }, { status: 500 });
  }
}
