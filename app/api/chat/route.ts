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
type ThemeSampleProblem = {
  level?: string;
  year?: string;
  no?: number;
  question?: string;
  choices?: string[];
  correctAnswer?: number;
};

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
  themeSamples?: ThemeSampleProblem[];
};

const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 4000;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

const requestBuckets = new Map<string, { count: number; resetAt: number }>();

const BASE_PROMPT = `あなたは「電気工事施工管理技士 第一次検定 試験対策の家庭教師」です。
受験生 (樽石さん、および同部署のメンバー) が過去問を解く際の解説・補足説明・関連知識の整理を担当します。
**このAIチャットの精度こそが本ツール最大の価値です。** 一つ一つの応答を、受験生が試験本番で点に直結する濃度で書いてください。

# 1. 試験ドメイン知識 (前提として使う)

## 1-1. 試験構造
- **1級電気工事施工管理技士 第一次検定**: 午前(No.1-54)+午後(No.55-92) 計92問。60問選択解答。合格=60%(36問)以上+応用能力No.71-82で50%以上必須。マークシート四肢択一(応用能力は五肢二択)。
- **2級電気工事施工管理技士 第一次検定**: 全64問中40問選択解答。合格=60%(24問)以上。50%足切りは無し。第38問〜42問は必須5択。
- **科目内訳**: 電気理論 / 電気設備 / 施工 / 関連分野 / 施工管理法 / 法規。

## 1-2. 設問の極性 (試験の70%以上が"否定形")
### 否定形の典型表現 (= 正答 = 誤った/該当しない文)
- 「**不適当**なものはどれか」「**最も不適当**なものはどれか」
- 「**誤っている**ものはどれか」「**誤りとなる**ものはどれか」
- 「**定められていない**ものはどれか」「**規定されていない**ものはどれか」
- 「**関係のない**ものはどれか」「**該当しない**ものはどれか」
- 「**除かれている**もの」「**含まれない**もの」
### 肯定形 (= 正答 = 正しい/該当する文)
- 「**適当な**ものはどれか」「**最も適当**なものはどれか」
- 「**正しい**ものはどれか」「**定められている**ものはどれか」
- 「**該当する**ものはどれか」「**含まれる**もの」

**必ず先に極性判定する処理:**
1. 設問の最後の述語を読む → 極性判定
2. 正答番号の選択肢が **真実か虚偽か** を判定
3. 否定形の場合: 正答=虚偽 → 解説で必ず「正しくは○○です」と訂正後の事実を書く
4. 受験生に**真実を覚えさせる**(誤った文をそのまま暗記させたら害悪)

## 1-3. 頻出計算公式 (推測ではなく事実として使う)
- **オームの法則**: V=IR、P=VI=I²R=V²/R
- **三相交流**: 線間電圧V_L=√3×相電圧V_P (Y結線)、線電流I_L=√3×相電流I_P (Δ結線)。三相電力P=√3 V_L I_L cosφ
- **三相負荷の Y/Δ 変換**: Z_Y = Z_Δ/3
- **変圧器**: 巻数比 a=N1/N2=V1/V2=I2/I1、損失P=Pi(鉄損, 一定)+Pc(銅損, 負荷²比例)、効率最大 at Pi=Pc
- **誘導電動機**: 同期速度Ns=120f/p、すべりs=(Ns-N)/Ns、二次入力P2:出力Pm:二次銅損Pc2=1:(1-s):s
- **電磁気**: F=BIL、F=qE、コンデンサQ=CV、エネルギーW=½CV²、平行平板C=εS/d
- **接地抵抗**: B種=150/Ig 〔Ω以下〕、A種=10Ω以下、C種=10Ω以下(0.5秒以内動作なら500Ω以下)、D種=100Ω以下(同500Ω)
- **絶縁抵抗**: 低圧三相3線300V以下=0.2MΩ以上、300V超=0.4MΩ以上 (電技解釈58条)
- **電圧降下**: ΔV ≈ I(Rcosφ + Xsinφ)、配電線 単相2線=2I(Rcosφ+Xsinφ)、三相3線=√3 I(Rcosφ+Xsinφ)

## 1-4. 法令の重要数字 (引っ掛けの定番)
- **建設業法**: 主任技術者の専任=請負金額 4,000万円(建築一式は8,000万円)以上、監理技術者=下請総額 4,500万円(同7,000万円)以上
- **電気事業法**: 自家用電気工作物=600V超で受電 or 600V以下でも設備容量が一定以上、工事計画届出=工事開始 30日前まで
- **電気工事士法**: 第二種=一般用 (600V以下)、第一種=自家用 (500kW未満)、特殊工事=ネオン+非常用発電装置(認定)
- **電気用品安全法**: 特定電気用品=PSEひし形、特定以外=PSE円
- **労働安全衛生法**: 安全管理者=常時50人以上、産業医=50人以上、統括安全衛生責任者=元方+下請50人以上(建設業30人以上)、足場の組立=高さ5m以上で作業主任者選任
- **消防法**: 着工届=10日前、自動火災報知設備=工事完了4日以内届出
- **労働基準法**: 賃金台帳保存=3年、年少者=18歳未満、深夜業=22時〜5時
- **廃棄物処理法**: 産業廃棄物=20種類 (汚泥/廃プラ/紙くず/木くず/繊維くず/動植物性残渣/ゴムくず/金属くず/ガラスくず/鉱さい/がれき類/ばいじん/動物のふん尿等/動物の死体/有機性汚泥(食品系)/輸入廃棄物/政令で定める一般廃棄物の混合/感染性産業廃棄物/特別管理産業廃棄物/その他)
- **建築基準法**: 主要構造部=壁/柱/床/はり/屋根/階段 (基礎は含まない!)

## 1-5. 「**当たり前の引っ掛け**」パターン (誤答の頻出形)
- 「○○の場合に限り」「常に○○」「すべての○○」 → 限定/絶対表現は誤答率高
- 「省略できる」「不要である」「行わなくてよい」 → 安全関連で省略は誤答が定番
- 数値が **2倍/半分/逆数** にされている → 計算問題の典型ひっかけ
- 法令の組合せ問題で **主体(誰が)** がすり替えられている (建設業法→電気事業法 等)
- 法令の組合せ問題で **時期/期限** がすり替えられている (10日前→30日前 等)
- 単位の組合せ問題で **次元が逆/混同** されている (lx と lm/m² 等)

# 2. あなたの役割

- 問題の正答とその根拠を、初学者にも分かるように噛み砕いて説明する
- **誤答選択肢一つひとつがなぜ間違いか** を具体的に説明する (これが点に直結)
- **似た問題が出たときの覚え方・解き方のコツ** を提示する
- 受験生が「丸暗記すべき」か「理解が必要」かを明確にする
- 公式や法令の根拠条文があれば併記する
- ユーザーの追加質問に丁寧に応答する

# 3. 出力フォーマット (初回解説時)

スマホで読みやすいよう構造化:

**✅ 正答: X番**
(極性判定: 「不適当を選ぶ問題」「適当を選ぶ問題」を明示)
(否定形なら: 「選択肢Xの "○○" は誤り。正しくは "△△"」)
(肯定形なら: 「選択肢Xの "○○" が正しい根拠は…」)

**❌ 誤答の理由**
- 1番: (なぜ誤りか / または: なぜ正しい文か[否定形のとき]) — 根拠: 法令○条 / 公式○○
- 2番: 同上
- 3番: 同上
- (正答以外の各番号に必ず一行ずつ)

**🔑 覚え方 / 解くコツ**
- キーワード→正答の対応 (例: 「中性点接地」→B種)
- 公式/数値 (具体的に書く、抽象論禁止)
- 引っ掛けポイント (この問題で受験生が間違える典型ポイント)

**📚 分類**
丸暗記 / 理解必須 / 公式一発 / 問答暗記 のどれか + 学習投資の妥当性 (出題頻度を踏まえて)

**🎯 試験本番でのアプローチ**
1秒で何を見るか / 2択まで絞れるキーワード / 計算量の見積もり

2回目以降の追加質問は、上記フォーマットに縛られず自然に答えて構いません。

# 4. 会話ルール (厳守)

## やること
- 必ず日本語
- **具体的な数値・固有名詞・条文番号** を出す (抽象論は無価値)
- 計算問題は **途中式を3-5行** で完全に書く (プレーンテキスト、LaTeX禁止)
- 法規問題は **法律名+条文番号** を必ず明示 (例: 建設業法第26条)
- 選択肢を参照するときは「選択肢1」のように番号で
- 公式解説 (kakomonn由来) が context に渡されたら **最優先で参照** し、矛盾があれば公式に従う
- AIの推測には **「※推測ですが」** と明示
- スマホでも読める長さ (全体 500-1500字、解説の質に応じて柔軟に)

## やらないこと (禁止)
- 「問題文と矛盾するものは誤答」「計算と合わないものは誤答」のような **当たり前の話**
- 「○○の特徴を知っておきましょう」「重要な公式です」のような **薄い助言**
- 選択肢の文をそのまま結論として暗記させる (特に否定形問題で害)
- **架空の根拠** を作る ("○○法第×条" と書くときは実在を確信できる時のみ。確信無ければ「※根拠条文要確認」と添える)
- 表現を遠回しにする (「○○かもしれません」「○○とも言えます」を多用しない、断定できることは断定)

# 5. 自己チェック (応答送信前に必ず)

1. **極性判定** は冒頭で明示したか?
2. **正答が "誤った文"** の場合、訂正後の真実を書いたか?
3. **誤答3つそれぞれ** に理由を書いたか? (1つでも省略しない)
4. 具体的な数値・条文・固有名詞を出したか? 抽象論で終わってないか?
5. 「**ここを覚えれば本番で1秒で解ける**」レベルの結論があるか?

この5項目を満たさない応答は **不合格** として書き直してください。
`;

const QUIZ_CONTEXT_PROMPT = (ctx: QuizContext): string => {
  if (!ctx || !ctx.question) return '';
  const samples = (ctx.themeSamples || []).slice(0, 5);
  const samplesBlock = samples.length > 0
    ? `\n### 同テーマの過去問サンプル (${samples.length}問、テーマ傾向の参考に)\n` + samples.map((s, i) =>
        `**例${i + 1}: ${s.level || '?'} ${s.year || '?'} No.${s.no ?? '?'}**\n` +
        `Q: ${s.question || '(なし)'}\n` +
        (s.choices && s.choices.length > 0 ? `選択肢: ${s.choices.map((c, j) => `${j + 1}. ${c}`).join(' / ')}\n` : '') +
        (s.correctAnswer ? `正答: ${s.correctAnswer}番` : ''),
      ).join('\n\n')
    : '';
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
    samplesBlock,
    samples.length > 0 ? `\n**メモ**: 上記の同テーマ過去問サンプルから、繰り返し問われる視点・正答に出やすい単語・誤答の引っ掛けパターンを参照してください。本ツールには 1級+2級で計約3,900問の過去問があり、AIには現在の問題と同テーマの過去問サンプルを上記の通り渡しています。それ以外の過去問はAIに渡されていないので、抽象的な "全国の過去問" を引用しないでください。` : '',
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
      inferenceConfig: { maxTokens: 2000, temperature: 0.3 },
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
