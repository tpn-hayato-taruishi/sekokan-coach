// 試験レジストリ — 試験ごとの差分をここに集約する。
// 新しい資格を追加する手順:
//   1. public/data/quiz_{id}.json を用意する (パイプライン: scripts/ 配下)
//   2. 下の EXAMS に 1 エントリ追加し available: true にする
//   3. 試験日は lib/exam-schedule.ts (サーバ側) に追加する
// UI 側 (app/page.tsx) には試験名のハードコード分岐を書かないこと。

export type ExamId = 'denki' | 'denkitsushin' | 'denken' | 'denko' | 'enekan' | 'ap' | 'fe';

export type ExamGroup = {
  name: string;
  subject: string;
  no: string;
  out: number;
  must: number;
  type: '必須' | '選択' | '必須(50%以上)' | '選択中心';
};

export type ExamEra = {
  era: string;
  applies: string;
  total: number;
  answer: number;
  pass: number;
  note: string;
  groups: ExamGroup[];
};

export type PdfUrlMap = { answer?: Record<string, string>; problem?: Record<string, string> };

/** 外部リンク生成に渡す問題のコンテキスト */
export type LinkCtx = {
  level: string;
  year: string;
  season?: string;
  page?: number;
  source: string;
  source_pdf?: string;
  pdfUrls: PdfUrlMap;
};

/** URL が引けなかった場合は message に理由を入れて返す (呼び出し側が alert して解説サイトへ誘導) */
export type LinkResult = { url: string; message?: undefined } | { url: null; message: string };

/** 級 × 検定区分。第二次検定が無い試験は phase: '1次' のみを並べる */
export type ExamTypeOption = {
  v: string;
  level: string;
  phase: '1次' | '2次';
  label: string;
  desc: string;
  icon: string;
};

export type ExamConfig = {
  id: ExamId;
  icon: string;
  /** ヘッダー等の短い表示名 (例: 電気工事) */
  shortLabel: string;
  /** 正式名称 (例: 電気工事施工管理技士) */
  fullLabel: string;
  /** ランディングのカード説明 */
  landingNote: string;
  /** public/data 配下の演習データ。available: false の間は未生成でよい */
  quizJsonUrl: string;
  /** quiz.json が用意できているか。false ならランディングで「準備中」表示 */
  available: boolean;
  levels: string[];
  defaultLevel: string;
  examTypes: ExamTypeOption[];
  subjects: { name: string; hint: string }[];
  examStructures: Record<string, ExamEra[]>;
  /** data/reports 配下の HTML レポート名の接頭辞。未整備なら null */
  reportPrefix: string | null;
  features: {
    /** 第二次検定 (記述式) を持つか */
    secondExam: boolean;
    /** 経験記述ジェネレーターを出すか */
    keiken: boolean;
    /** 合格ロードマップ (7ステップ) を出すか */
    roadmap: boolean;
  };
  /** 解説サイト */
  explanationUrl?: (c: LinkCtx) => string;
  problemPdfUrl?: (c: LinkCtx) => LinkResult;
  answerPdfUrl?: (c: LinkCtx) => LinkResult;
};

// ---------------------------------------------------------------------------
// 電気工事施工管理技士
// ---------------------------------------------------------------------------

const KAKOMON_MAP_2: Record<string, string> = {
  'R7_PM': '73016', 'R7_AM': '73015', 'R6_PM': '73014', 'R6_AM': '73013',
  'R5_PM': '73012', 'R5_AM': '73011', 'R4_PM': '73010', 'R4_AM': '73009',
  'R3_PM': '73008', 'R3_AM': '73007', 'R2_PM': '73006',
  'R1_PM': '73005', 'R1_AM': '73004', 'H30_PM': '73003', 'H29_': '73001',
};
const KAKOMON_MAP_1: Record<string, string> = {
  'R7_': '86008', 'R6_': '86007', 'R5_': '86006', 'R4_': '86005',
  'R3_': '86004', 'R2_': '86003', 'R1_': '86002', 'H30_': '86001',
};

const denkiLevelTag = (level: string) => (level === '1級' ? '1denki' : '2denki');

const DENKI: ExamConfig = {
  id: 'denki',
  icon: '⚡',
  shortLabel: '電気工事',
  fullLabel: '電気工事施工管理技士',
  landingNote: '3,906問 (H20〜R8前期) — Bedrock Claude AI解説付',
  quizJsonUrl: '/data/quiz.json',
  available: true,
  levels: ['1級', '2級'],
  defaultLevel: '2級',
  examTypes: [
    { v: '2級_1次', level: '2級', phase: '1次', label: '2級 第一次検定', desc: '四肢択一64問', icon: '🟢' },
    { v: '2級_2次', level: '2級', phase: '2次', label: '2級 第二次検定', desc: '記述+選択', icon: '🟡' },
    { v: '1級_1次', level: '1級', phase: '1次', label: '1級 第一次検定', desc: '四肢択一94問', icon: '🔵' },
    { v: '1級_2次', level: '1級', phase: '2次', label: '1級 第二次検定', desc: '記述+応用', icon: '🟣' },
  ],
  subjects: [
    { name: '電気理論', hint: 'オームの法則・三相交流・電磁気。大学/高校で電気工学・物理を学んだなら強。文系なら弱。' },
    { name: '電気設備', hint: '発電/送電/受変電/照明など。電気現場経験者なら強、未経験なら中。' },
    { name: '施工', hint: '配線/接地/絶縁/試験/検査の手順。現場経験者なら強。' },
    { name: '施工管理法', hint: '工程/品質/安全管理・PERT。建設・製造業の管理経験者なら強。' },
    { name: '法規', hint: '電気事業法・工事士法・建設業法・労働安全衛生法。実務で接していないと弱。' },
  ],
  // 出典: 一般財団法人 建設業振興基金 試験案内 (R3 で制度改正)
  examStructures: {
    '2級': [
      {
        era: 'R3～現行', applies: '令和3年度以降',
        total: 64, answer: 40, pass: 60,
        note: '第一次検定に名称変更。No.38-42は5択全問必須 (足切り無し、合格基準60%のみ)。1級と違い応用能力50%足切りは無し。',
        groups: [
          { name: '電気工学', subject: '電気理論', no: 'No.1～12', out: 12, must: 8, type: '選択' },
          { name: '電気応用・電気設備', subject: '電気設備', no: 'No.13～32', out: 20, must: 12, type: '選択' },
          { name: '関連分野', subject: '電気設備', no: 'No.33～37', out: 5, must: 5, type: '必須' },
          { name: '施工管理法 (5択問題)', subject: '施工管理法', no: 'No.38～42', out: 5, must: 5, type: '必須' },
          { name: '施工管理法', subject: '施工管理法', no: 'No.43～52', out: 10, must: 10, type: '必須' },
          { name: '法規', subject: '法規', no: 'No.53～64', out: 12, must: 10, type: '選択' },
        ],
      },
      {
        era: 'H29～R2', applies: '平成29～令和2年度',
        total: 64, answer: 40, pass: 60,
        note: '「学科試験」と呼称。応用能力問題なし。出題数同じだが応用能力の足切りなくシンプル。',
        groups: [
          { name: '電気工学', subject: '電気理論', no: 'No.1～12', out: 12, must: 8, type: '選択' },
          { name: '電気応用・電気設備', subject: '電気設備', no: 'No.13～32', out: 20, must: 12, type: '選択' },
          { name: '関連分野', subject: '電気設備', no: 'No.33～37', out: 5, must: 5, type: '必須' },
          { name: '施工管理法', subject: '施工管理法', no: 'No.38～52', out: 15, must: 15, type: '必須' },
          { name: '法規', subject: '法規', no: 'No.53～64', out: 12, must: 10, type: '選択' },
        ],
      },
    ],
    '1級': [
      {
        era: 'R3～現行', applies: '令和3年度以降',
        total: 94, answer: 62, pass: 60,
        note: '第一次検定に名称変更。応用能力問題(No.71-82)が新設され独立して50%以上必要に。',
        groups: [
          { name: '電気工学', subject: '電気理論', no: 'No.1～15', out: 15, must: 10, type: '選択' },
          { name: '電気応用・電気設備', subject: '電気設備', no: 'No.16～47', out: 32, must: 14, type: '選択' },
          { name: '関連分野', subject: '電気設備', no: 'No.48～52', out: 5, must: 5, type: '必須' },
          { name: '設計図書・契約', subject: '施工管理法', no: 'No.53～55', out: 3, must: 1, type: '選択' },
          { name: '施工管理法', subject: '施工管理法', no: 'No.56～70', out: 15, must: 12, type: '選択' },
          { name: '施工管理法 (応用能力)', subject: '施工管理法', no: 'No.71～82', out: 12, must: 12, type: '必須(50%以上)' },
          { name: '法規', subject: '法規', no: 'No.83～94', out: 12, must: 8, type: '選択' },
        ],
      },
      {
        era: 'H29～R2', applies: '平成29～令和2年度',
        total: 92, answer: 60, pass: 60,
        note: '「学科試験」と呼称。応用能力問題なし。',
        groups: [
          { name: '電気工学', subject: '電気理論', no: 'No.1～15', out: 15, must: 10, type: '選択' },
          { name: '電気応用・電気設備', subject: '電気設備', no: 'No.16～47', out: 32, must: 14, type: '選択' },
          { name: '関連分野', subject: '電気設備', no: 'No.48～52', out: 5, must: 5, type: '必須' },
          { name: '設計図書・契約', subject: '施工管理法', no: 'No.53～55', out: 3, must: 1, type: '選択' },
          { name: '施工管理法', subject: '施工管理法', no: 'No.56～80', out: 25, must: 22, type: '選択中心' },
          { name: '法規', subject: '法規', no: 'No.81～92', out: 12, must: 8, type: '選択' },
        ],
      },
    ],
  },
  reportPrefix: '施工管理',
  features: { secondExam: true, keiken: true, roadmap: true },
  explanationUrl: ({ level, year, season }) => {
    const map = level === '1級' ? KAKOMON_MAP_1 : KAKOMON_MAP_2;
    const host = level === '1級' ? 'denkisekou1' : 'denkisekou2';
    const id = map[`${year}_${season || ''}`] || map[`${year}_`];
    return id ? `https://${host}.kakomonn.com/list1/${id}` : `https://${host}.kakomonn.com/`;
  },
  problemPdfUrl: ({ level, year, page, source, source_pdf, pdfUrls }) => {
    const pdfName = source_pdf || source.replace(/\.txt$/, '.pdf');
    const url = pdfUrls.problem?.[`${level}_第一次/${pdfName}`];
    // 安全チェック: 1級の問題が 2denki を指していないか (逆も同様)
    const wrongTag = denkiLevelTag(level === '1級' ? '2級' : '1級');
    if (url && url.includes(wrongTag)) {
      return { url: null, message: `URL不整合検出: ${level} ${year} の問題PDFが ${denkiLevelTag(level)} を含みません。kakomonn 解説サイトを開きます。` };
    }
    if (!url) {
      return { url: null, message: `${level} ${year} の問題PDFは外部サイトに直リンク無し。kakomonn 解説サイトを開きます。` };
    }
    return { url: `${url}#page=${page || 1}` };
  },
  answerPdfUrl: ({ level, year, season, pdfUrls }) => {
    const denki = denkiLevelTag(level);
    // 1級は AM/PM (午前/午後)、2級は 前期=AM=early / 後期=PM=late
    let suffix = '';
    if (level === '1級' && season === 'AM') suffix = '_am';
    else if (level === '1級' && season === 'PM') suffix = '_pm';
    else if (level === '2級' && season === 'AM') suffix = '_early';
    else if (level === '2級' && season === 'PM') suffix = '_late';
    let url = pdfUrls.answer?.[`${level}_第一次/${year}_${denki}_01${suffix}_kaitou.pdf`];
    // フォールバック1: suffix なしのキー(古い年度)
    if (!url) url = pdfUrls.answer?.[`${level}_第一次/${year}_${denki}_01_kaitou.pdf`];
    // フォールバック2: 全 answer キーから level/year/season で正規表現検索
    if (!url) {
      const seasonTag = season === 'AM' ? '(早|前|am|AM)' : season === 'PM' ? '(後|遅|pm|PM|late)' : '';
      const re = new RegExp(`${level}.*${year}.*${seasonTag}`);
      const matchKey = Object.keys(pdfUrls.answer || {}).find((k) => re.test(k));
      if (matchKey) url = pdfUrls.answer![matchKey];
    }
    const wrongTag = denkiLevelTag(level === '1級' ? '2級' : '1級');
    if (url && url.includes(wrongTag)) {
      return { url: null, message: `URL不整合検出: ${level} ${year} の解答PDFが ${denki} を含みません。kakomonn 解説サイトを開きます。` };
    }
    if (!url) {
      return { url: null, message: `${level} ${year}${season ? ' ' + season : ''} の解答PDFは外部URL未登録。kakomonn 解説サイトを開きます。` };
    }
    return { url };
  },
};

// ---------------------------------------------------------------------------
// 電気通信工事施工管理技士
// ---------------------------------------------------------------------------

// dobokujira は年度ごとに WP の uploads パスが違うので map で持つ
const DENTSU_YM_1: Record<string, string> = {
  R7: '2025/10', R6: '2024/09', R5: '2024/09', R4: '2024/09',
  R3: '2024/09', R2: '2024/09', R1: '2024/09',
};
const DENTSU_YM_2: Record<string, Record<string, string>> = {
  R8: { 前期: '2026/06' },
  R7: { 前期: '2025/06', 後期: '2026/01' },
  R6: { 前期: '2024/09', 後期: '2025/06' },
  R5: { 前期: '2024/09', 後期: '2024/09' },
  R4: { 前期: '2024/09', 後期: '2025/11' },
  R3: { 前期: '2024/09', 後期: '2024/09' },
  R2: { 前期: '2024/09', 後期: '2024/09' },
  R1: { 前期: '2024/09', 後期: '2024/09' },
};

function dentsuPdf(level: string, year: string, season: string, kind: 'mondai' | 'kaitou'): string | null {
  if (level === '1級') {
    const ym = DENTSU_YM_1[year];
    if (!ym) return null;
    if (kind === 'kaitou') return `https://dobokujira.com/wp-content/uploads/${ym}/${year}_1denkitsushin_01_kaitou.pdf`;
    // 問題: AM=mondaiA / PM=mondaiB
    return `https://dobokujira.com/wp-content/uploads/${ym}/${year}_1denkitsushin_01_mondai${season === 'PM' ? 'B' : 'A'}.pdf`;
  }
  const periodKey = season === 'PM' || season === '後期' ? '後期' : '前期';
  const ym = DENTSU_YM_2[year]?.[periodKey];
  if (!ym) return null;
  const filePeriod = periodKey === '前期' ? 'early' : 'late';
  return `https://dobokujira.com/wp-content/uploads/${ym}/${year}_2denkitsushin_01_${filePeriod}_${kind}.pdf`;
}

const DENKITSUSHIN: ExamConfig = {
  ...DENKI,
  id: 'denkitsushin',
  icon: '📡',
  shortLabel: '電気通信工事',
  fullLabel: '電気通信工事施工管理技士',
  landingNote: '1,514問 (R1〜R8前期) — 新試験 (R元年〜)',
  quizJsonUrl: '/data/quiz_denkitsushin.json',
  reportPrefix: '電気通信工事施工管理技士',
  // kakomonn は電気工事のみなので dobokujira の一覧ページへ
  explanationUrl: ({ level }) => `https://dobokujira.com/${level === '1級' ? '1' : '2'}denkitsushin-pastproblems/`,
  problemPdfUrl: ({ level, year, season }) => {
    const url = dentsuPdf(level, year, season || '', 'mondai');
    return url ? { url } : { url: null, message: `${level} ${year}${season ? ' ' + season : ''} の問題PDFは外部URL未登録。` };
  },
  answerPdfUrl: ({ level, year, season }) => {
    const url = dentsuPdf(level, year, season || '', 'kaitou');
    return url ? { url } : { url: null, message: `${level} ${year}${season ? ' ' + season : ''} の解答PDFは外部URL未登録。` };
  },
};

// ---------------------------------------------------------------------------
// 未整備の試験 (quiz.json 生成待ち)
// examStructures / landingNote の問題数は演習データ投入時に公式試験案内から埋める。
// 推測値を置くと UI がそのまま嘘を表示するので、確認できるまで空にしておく。
// ---------------------------------------------------------------------------

const DENKEN: ExamConfig = {
  id: 'denken',
  icon: '🔌',
  shortLabel: '電験三種',
  fullLabel: '第三種電気主任技術者',
  landingNote: '演習データ準備中 — 理論/電力/機械/法規の4科目',
  quizJsonUrl: '/data/quiz_denken3.json',
  available: false,
  levels: ['三種'],
  defaultLevel: '三種',
  examTypes: [
    { v: '三種_1次', level: '三種', phase: '1次', label: '第三種 (CBT/筆記)', desc: '4科目・科目合格制', icon: '🔌' },
  ],
  subjects: [
    { name: '理論', hint: '電磁気・電気回路・電子回路・電気計測。計算中心で最も理論的。' },
    { name: '電力', hint: '発電・変電・送配電・電気材料。設備の構造と系統の理解。' },
    { name: '機械', hint: '回転機・変圧器・パワエレ・照明・自動制御・情報。範囲が最も広い。' },
    { name: '法規', hint: '電気事業法・電技解釈・施設管理。計算(B問題)も出る。' },
  ],
  examStructures: {},
  reportPrefix: null,
  features: { secondExam: false, keiken: false, roadmap: false },
};

const DENKO: ExamConfig = {
  id: 'denko',
  icon: '🔧',
  shortLabel: '電気工事士',
  fullLabel: '電気工事士 (第一種・第二種)',
  landingNote: '演習データ準備中 — 学科試験 (筆記/CBT)',
  quizJsonUrl: '/data/quiz_denko.json',
  available: false,
  levels: ['第一種', '第二種'],
  defaultLevel: '第二種',
  examTypes: [
    { v: '第二種_1次', level: '第二種', phase: '1次', label: '第二種 学科試験', desc: '四肢択一', icon: '🟢' },
    { v: '第一種_1次', level: '第一種', phase: '1次', label: '第一種 学科試験', desc: '四肢択一', icon: '🔵' },
  ],
  subjects: [
    { name: '電気理論', hint: 'オームの法則・交流回路・電力計算。' },
    { name: '配電理論・配線設計', hint: '電圧降下・幹線と分岐回路・許容電流。' },
    { name: '電気機器・材料・工具', hint: '器具の名称と用途。写真鑑別が中心で暗記勝負。' },
    { name: '施工方法', hint: '工事の種類ごとの施工条件・造営材への取付。' },
    { name: '検査方法', hint: '絶縁抵抗・接地抵抗の測定と基準値。' },
    { name: '法令', hint: '電気工事士法・電気設備技術基準・電気用品安全法。' },
    { name: '配線図', hint: '複線図と図記号。第二種は後半20問を占める最大配点。' },
  ],
  examStructures: {},
  reportPrefix: null,
  features: { secondExam: false, keiken: false, roadmap: false },
};

const ENEKAN: ExamConfig = {
  id: 'enekan',
  icon: '🔋',
  shortLabel: 'エネ管',
  fullLabel: 'エネルギー管理士 (電気分野)',
  landingNote: '演習データ準備中 — 課目I〜IVの4課目',
  quizJsonUrl: '/data/quiz_enekan.json',
  available: false,
  levels: ['電気分野'],
  defaultLevel: '電気分野',
  examTypes: [
    { v: '電気分野_1次', level: '電気分野', phase: '1次', label: 'エネルギー管理士 電気分野', desc: '4課目・課目合格制', icon: '🔋' },
  ],
  subjects: [
    { name: '課目I エネルギー総合管理及び法規', hint: '省エネ法・エネルギー情勢・管理手法。全分野共通課目。' },
    { name: '課目II 電気の基礎', hint: '電気回路・電気計測・自動制御と情報処理。' },
    { name: '課目III 電気設備及び機器', hint: '工場配電・電気機器 (変圧器・電動機)。' },
    { name: '課目IV 電力応用', hint: '電動力応用・電気加熱・電気化学・照明・空調から選択。' },
  ],
  examStructures: {},
  reportPrefix: null,
  features: { secondExam: false, keiken: false, roadmap: false },
};

// IPA 情報処理技術者試験。科目分類は共通キャリア・スキルフレームワークの大分類9つで
// FE/AP 共通なので、両者で同じ配列を使う。
const IPA_SUBJECTS: { name: string; hint: string }[] = [
  { name: '基礎理論', hint: '離散数学・応用数学・情報理論・アルゴリズム。計算問題が中心で数学が得意なら強み。' },
  { name: 'コンピュータシステム', hint: 'プロセッサ・メモリ・システム構成・OS。性能計算 (稼働率・応答時間) が頻出。' },
  { name: '技術要素', hint: 'DB・ネットワーク・セキュリティ・UI。出題数が最も多く、特にセキュリティは必須。' },
  { name: '開発技術', hint: 'システム開発手法・設計・テスト・保守。実務で開発経験があれば強み。' },
  { name: 'プロジェクトマネジメント', hint: 'スコープ/コスト/工程管理・EVM・アローダイアグラム。計算問題は得点源。' },
  { name: 'サービスマネジメント', hint: 'ITIL・SLA・運用・ファシリティ。暗記中心で対策しやすい。' },
  { name: 'システム戦略', hint: '情報システム戦略・業務プロセス・ソリューション。用語暗記が中心。' },
  { name: '経営戦略', hint: '経営戦略手法・マーケティング・ビジネスインダストリ。文系知識で得点しやすい。' },
  { name: '企業と法務', hint: '企業活動・会計財務・知的財産権・労働法規。計算 (損益分岐点等) と法令暗記。' },
];

// 級の概念が無いため levels は出題区分 (AP=午前/午後, FE=科目A/科目B) を入れている。
// quiz.json の level フィールドと一致させること (パイプライン実装時に最終確定)。
const AP: ExamConfig = {
  id: 'ap',
  icon: '💻',
  shortLabel: '応用情報',
  fullLabel: '応用情報技術者試験 (AP)',
  landingNote: '演習データ準備中 — 午前 四肢択一80問 / 午後 記述式11問中5問選択',
  quizJsonUrl: '/data/quiz_ap.json',
  available: false,
  levels: ['午前', '午後'],
  defaultLevel: '午前',
  examTypes: [
    { v: '午前_1次', level: '午前', phase: '1次', label: '午前 (四肢択一)', desc: '80問全問必須・150分・60点合格', icon: '📝' },
    { v: '午後_2次', level: '午後', phase: '2次', label: '午後 (記述式)', desc: '11問中5問選択 (問1セキュリティ必須)・150分', icon: '✍' },
  ],
  subjects: IPA_SUBJECTS,
  examStructures: {},
  reportPrefix: null,
  features: { secondExam: true, keiken: false, roadmap: false },
};

const FE: ExamConfig = {
  id: 'fe',
  icon: '🖥',
  shortLabel: '基本情報',
  fullLabel: '基本情報技術者試験 (FE)',
  // R5(2023)4月から通年CBT化 + 科目A/科目Bに再編。CBT移行後の本試験問題は非公開で、
  // 公開されているのは IPA のサンプル問題・公開問題のみ。過去問PDFは R3(2021)まで。
  landingNote: '演習データ準備中 — 科目A 60問 / 科目B 20問 (R5〜通年CBT)',
  quizJsonUrl: '/data/quiz_fe.json',
  available: false,
  levels: ['科目A', '科目B'],
  defaultLevel: '科目A',
  examTypes: [
    { v: '科目A_1次', level: '科目A', phase: '1次', label: '科目A (四肢択一)', desc: '60問・90分・IRTスコア600以上', icon: '📝' },
    { v: '科目B_2次', level: '科目B', phase: '2次', label: '科目B (アルゴリズム/セキュリティ)', desc: '20問・100分・IRTスコア600以上', icon: '🧩' },
  ],
  subjects: IPA_SUBJECTS,
  examStructures: {},
  reportPrefix: null,
  features: { secondExam: true, keiken: false, roadmap: false },
};

export const EXAMS: Record<ExamId, ExamConfig> = {
  denki: DENKI,
  denkitsushin: DENKITSUSHIN,
  denken: DENKEN,
  denko: DENKO,
  enekan: ENEKAN,
  ap: AP,
  fe: FE,
};

export const EXAM_IDS = Object.keys(EXAMS) as ExamId[];
export const AVAILABLE_EXAM_IDS = EXAM_IDS.filter((id) => EXAMS[id].available);
export const DEFAULT_EXAM_ID: ExamId = 'denki';

export function isExamId(v: unknown): v is ExamId {
  return typeof v === 'string' && v in EXAMS;
}

export function getExam(id: string | null | undefined): ExamConfig {
  return isExamId(id) && EXAMS[id].available ? EXAMS[id] : EXAMS[DEFAULT_EXAM_ID];
}
