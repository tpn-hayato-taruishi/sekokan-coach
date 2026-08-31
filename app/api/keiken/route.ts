import { NextRequest } from 'next/server';
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { checkBudgetAsync, recordUsage } from '@/lib/cost-tracker';
import { logOperation } from '@/lib/activity-logger';
import { serverEvents } from '@/lib/event-emitter';
import {
  EXAMS,
  KEIKEN_MODES,
  KEIKEN_FIELDS,
  INTEGRITY_RULE,
  SEIDO_NOTE,
  getExamReference,
  type ExamId,
  type KeikenMode,
} from '@/lib/keiken';

const RATE_LIMIT_MAX = 12;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_FIELD_LENGTH = 2000;

const requestBuckets = new Map<string, { count: number; resetAt: number }>();

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

function createBedrockClient() {
  const config: ConstructorParameters<typeof BedrockRuntimeClient>[0] = {
    region: process.env.AWS_REGION || 'ap-northeast-1',
  };
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    config.requestHandler = new NodeHttpHandler({ httpsAgent: agent, httpAgent: agent });
  }
  return new BedrockRuntimeClient(config);
}

const COMMON_HEAD = `あなたは施工管理技士 第二次検定・受験申込の作成支援を行う専門家です。
${INTEGRITY_RULE}
出力は日本語。Markdown で見出し・箇条書きを使い、そのまま清書・転記に使える具体度で書く。`;

function modePrompt(mode: KeikenMode, examLabel: string, koushu: string, themes: string[]): string {
  switch (mode) {
    case 'colleague':
      return `# タスク: 同僚への「工事内容 確認メッセージ」を作成
受験者が過去に関わった工事の事実を、当時を知る同僚に確認するための丁寧で簡潔なビジネスメッセージ（チャット/メール可）を作る。
- 目的を一文で説明（${examLabel}の受験申込・経験記述のため当時の工事内容を確認したい）。
- 相手が答えやすいよう、確認したい項目を箇条書きの質問リストにする: 工事名の正式名称 / 発注者 / 施工場所 / 工期(着工〜完了の年月) / 請負代金額の概算 / 受験者本人の立場・担当範囲 / 工事の規模(延床・受電電圧・契約電力・作業員数など) / 安全・工程・品質で印象的だった課題と対応。
- 相手の負担を減らす一言（分かる範囲で/後日でOK）を添える。
- 入力済みの情報は「これで合っていますか？」の確認形にし、未入力は質問形にする。
- 冒頭に件名候補、本文、の順。`;
    case 'ctable':
      return `# タスク: 実務経験証明書（C票）の記載内容を作成
${examLabel}（工事種別: ${koushu}）の受検申込に添付するC票の「電気工事施工管理に関する実務経験」欄の記載内容を、公式様式の欄立てに沿って整形して出力する。
下記「公式参照データ」のC票様式ルール・工事種別（表Ⅰ）・立場（表Ⅱ）に厳密に従うこと。
出力構成:
1. 【C票 記入欄】次を「欄名: 記載内容」で埋める。入力に無い欄は「未入力（要確認）」と書き、何を確認すべきか一言添える。
   - 勤務先名称・所在地（※現場ではなく在籍会社）
   - 所属部署
   - 主な工事種別（表Ⅰの区分から選ぶ）
   - 工事内容（表Ⅰの例に沿った具体的な内容。${koushu}と分かるように）
   - 従事した立場（表Ⅱ：施工管理/設計監理/施工監督 のいずれか）
   - 在籍期間（R◯年◯月〜◯年◯月）
   - 実務経験年数（在籍期間中の受検種目に関する年数）
2. 【証明者欄】に記入すべき項目（会社名・所在地・役職・氏名・受検者との関係）を案内。自己証明なら関係欄「本人」＋建設業許可通知書等の添付が必要と明記。
3. 【注意】工事名・請負金額はC票の欄ではない旨、記入単位は勤務先・部署・立場ごとに改行する旨を明記。
入力の工事内容が表Ⅰに該当するか確認し、該当しない/曖昧なら指摘する（勝手に該当扱いにしない）。
${SEIDO_NOTE}`;
    case 'essay':
      return `# タスク: 第二次検定 経験記述のドラフト作成
${examLabel}の第二次検定・経験記述の型に沿って、入力された実際の工事情報からドラフトを作る。
## 【工事概要】(そのまま記入できる形で)
工事名 / 施工場所 / 工期 / 請負代金額 / あなたの立場 / あなたが担当した${koushu}の内容
## 【あなたが実施した施工管理】
出題テーマ（${themes.join(' / ')}）ごとに、次の3点構成で各150〜250字程度のドラフト:
1. 技術的課題（現場で実際に直面した具体的状況・数値）
2. 検討・実施した対策（なぜそうしたか、具体的な手段）
3. 結果（対策の効果。可能なら定量的に）
- 一般論を避け、入力の固有情報を最大限使う。入力に無い数値は【要記入: ○○】と明示（勝手に作らない）。
- これは下書きであり、本人が実体験に即して加筆・修正する前提であることを冒頭に明記。`;
    case 'check':
      return `# タスク: 実務経験の「適合チェック（受検資格・C票の観点）」
入力された工事情報が、${examLabel}の受検資格およびC票の実務経験として認められるかを、下記「公式参照データ」の基準に厳密に照らして判定する。
各項目を ○（満たす）/ △（要確認・要改善）/ ×（認められない/不足）で判定し、×・△には根拠（参照データのどの規定か）と改善指示を付ける:
1. 工事種別の適合：入力の工事内容が表Ⅰの電気工事に該当するか。表Ⅰ外・除外工事（電気通信/管/機械器具設置/消防/建築一式 等）に該当しないか。※信号・計装・LAN等の例外にも注意。
2. 立場の適合：従事した立場が表Ⅱ（施工管理/設計監理/施工監督）に該当するか。設計のみ・保守点検・積算・営業・雑役務・研修期間などの「認められない業務」でないか。
3. 受検資格：前提資格（一次合格・電工免状等）の有無と、学歴に応じた必要実務経験年数（基準日 R8.7.31）を満たすか。第一種電工士免状があれば実務不問・C票不要である点も判定に反映。
4. C票記載の妥当性：勤務先・所属・立場・在籍期間・工事種別・年数が矛盾なく書けるか。工事名/金額をC票に書こうとしていないか。
5. 不認定・却下リスク：虚偽記載リスク、期間重複の二重計上、他業種との混同など。
最後に「認定可否の見立て（あくまで自己確認用）」と「最優先で確認・修正すべき3点」を挙げる。合否・受検可否を保証する表現はしない。判断に迷う点は公式手引の該当ページ確認を促す。
${SEIDO_NOTE}`;
  }
}

function buildUserContent(inputs: Record<string, string>): string {
  const lines = KEIKEN_FIELDS
    .map((f) => {
      const v = (inputs[f.key] || '').trim();
      return `- ${f.label}: ${v ? v.slice(0, MAX_FIELD_LENGTH) : '（未入力）'}`;
    });
  return `## 受験者が入力した実際の工事情報\n${lines.join('\n')}`;
}

export async function POST(req: NextRequest) {
  const ip = getIp(req);
  if (!throttle(ip)) {
    return Response.json({ error: 'リクエストが多すぎます。少し待ってから再度お試しください。' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const mode = body.mode as KeikenMode;
    const examId = body.exam as ExamId;
    const inputs = (body.inputs && typeof body.inputs === 'object' ? body.inputs : {}) as Record<string, string>;

    if (!KEIKEN_MODES.includes(mode)) {
      return Response.json({ error: 'モードが不正です。' }, { status: 400 });
    }
    const exam = EXAMS[examId];
    if (!exam) {
      return Response.json({ error: '試験区分が不正です。' }, { status: 400 });
    }

    const budget = await checkBudgetAsync();
    if (!budget.ok) {
      return Response.json(
        { error: `今月のAPI利用上限（約${budget.limit_yen.toLocaleString()}円）に達しました。来月までお待ちください。` },
        { status: 429 },
      );
    }

    const systemPrompt = `${COMMON_HEAD}\n\n${modePrompt(mode, exam.label, exam.koushu, exam.essayThemes)}\n\n# 公式参照データ（受検の手引 由来。この範囲・区分を厳守）\n${getExamReference(examId)}`;
    const userContent = buildUserContent(inputs);

    const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
    const client = createBedrockClient();
    const response = await client.send(new ConverseStreamCommand({
      modelId,
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: userContent }] }],
      inferenceConfig: { maxTokens: 2600, temperature: 0.4 },
    }));

    const encoder = new TextEncoder();
    const inputEstimate = Math.ceil((systemPrompt.length + userContent.length) / 2);
    let outputEstimate = 0;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (response.stream) {
            for await (const event of response.stream) {
              const delta = event.contentBlockDelta?.delta?.text;
              if (delta) {
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
          logOperation({ ip, operation: 'keiken', details: { mode, exam: examId } }).catch(() => {});
          serverEvents.emit({ type: 'chat', timestamp: Date.now(), data: { mode, exam: examId, ip } });
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
    return Response.json({ error: '生成処理中にエラーが発生しました。' }, { status: 500 });
  }
}
