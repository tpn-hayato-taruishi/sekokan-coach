// 経験記述ジェネレーター / C票(実務経験証明書) 出力 / 適合チェック 共通設定
// page.tsx (client) と api/keiken/route.ts (server) の双方から import する。

export type KeikenMode = 'colleague' | 'ctable' | 'essay' | 'check';
export const KEIKEN_MODES: KeikenMode[] = ['colleague', 'ctable', 'essay', 'check'];

export type ExamId =
  | 'denki_1'
  | 'denki_2'
  | 'tsushin_1'
  | 'tsushin_2';

export type ExamConfig = {
  id: ExamId;
  label: string;        // 表示名
  short: string;        // 短縮ラベル
  koushu: string;       // C票の工事種別
  contentExamples: string[]; // 工事内容の具体例 (入力ガイド)
  essayThemes: string[];     // 2次検定 経験記述で問われる管理テーマ
};

export const EXAMS: Record<ExamId, ExamConfig> = {
  denki_1: {
    id: 'denki_1',
    label: '1級 電気工事施工管理技士',
    short: '電気 1級',
    koushu: '電気工事',
    contentExamples: [
      '受変電設備工事（キュービクル・変圧器）',
      '幹線・動力設備工事',
      '構内配電線路・電灯コンセント設備工事',
      '自家発電・無停電電源（UPS）設備工事',
      '通信・防災（自火報）設備工事',
      '太陽光発電・蓄電池設備工事',
    ],
    essayThemes: ['安全管理', '工程管理', '品質管理'],
  },
  denki_2: {
    id: 'denki_2',
    label: '2級 電気工事施工管理技士',
    short: '電気 2級',
    koushu: '電気工事',
    contentExamples: [
      '電灯・コンセント設備工事',
      '動力設備工事',
      '受変電設備工事',
      '構内配線・幹線工事',
      '外構・屋外電気設備工事',
    ],
    essayThemes: ['安全管理', '工程管理', '品質管理'],
  },
  tsushin_1: {
    id: 'tsushin_1',
    label: '1級 電気通信工事施工管理技士',
    short: '通信 1級',
    koushu: '電気通信工事',
    contentExamples: [
      '構内情報通信網（LAN）設備工事',
      '通信線路（メタル・光ファイバ）工事',
      '移動通信・携帯基地局設備工事',
      '放送機械設備（テレビ共同受信等）工事',
      '監視カメラ・防犯・入退室設備工事',
      'データセンター通信設備工事',
    ],
    essayThemes: ['安全管理', '工程管理', '品質管理'],
  },
  tsushin_2: {
    id: 'tsushin_2',
    label: '2級 電気通信工事施工管理技士',
    short: '通信 2級',
    koushu: '電気通信工事',
    contentExamples: [
      '構内情報通信網（LAN）設備工事',
      '通信線路工事',
      '放送受信設備工事',
      '監視カメラ・インターホン設備工事',
    ],
    essayThemes: ['安全管理', '工程管理', '品質管理'],
  },
};

export const EXAM_LIST: ExamConfig[] = [
  EXAMS.denki_1, EXAMS.denki_2, EXAMS.tsushin_1, EXAMS.tsushin_2,
];

// 共通入力フィールド (C票・経験記述の双方の素材になる、本人の実際の工事情報)
export type KeikenField = {
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
  multiline?: boolean;
  required?: boolean;
};

export const KEIKEN_FIELDS: KeikenField[] = [
  { key: 'projectName', label: '工事名', placeholder: '例）○○ビル新築電気設備工事', hint: '実際の工事名。契約書・仕様書の名称に合わせる', required: true },
  { key: 'colleagueName', label: '確認相手（同僚）', placeholder: '例）田中さん（当時の現場所長）', hint: '同僚確認メッセージ生成で使用。宛名と関係' },
  { key: 'client', label: '発注者・注文者', placeholder: '例）株式会社○○（元請の場合は施主、下請の場合は元請会社）', required: true },
  { key: 'location', label: '施工場所', placeholder: '例）東京都千代田区○○', required: true },
  { key: 'period', label: '工期（従事期間）', placeholder: '例）2023年4月〜2023年11月', hint: '着工〜完了の年月。実務経験年数の算定根拠', required: true },
  { key: 'contractPrice', label: '請負代金額', placeholder: '例）約8,500万円', hint: 'C票・経験記述の工事概要で使用' },
  { key: 'role', label: 'あなたの立場・役職', placeholder: '例）現場代理人 / 施工管理担当 / 主任技術者', hint: '「施工管理」を行った立場であること', required: true },
  { key: 'workType', label: '担当した工事の内容', placeholder: '例）受変電設備・幹線・電灯コンセント設備の施工管理', hint: '担当した電気(通信)工事の具体的内容', required: true },
  { key: 'scale', label: '工事の規模', placeholder: '例）延床5,000㎡、受電6.6kV、契約電力450kW、作業員最大12名/日' },
  { key: 'challenge', label: '直面した課題（テーマ別）', placeholder: '例）工程管理：先行工事の遅延で電気工事期間が3週間短縮された 等', hint: '経験記述で使う。安全/工程/品質で実際にあった課題', multiline: true, required: true },
  { key: 'action', label: '実施した対策と結果', placeholder: '例）施工図の事前調整と多能工化で並行作業を可能にし、工期内完了。手戻り0件', multiline: true },
];

// 全モード共通の順守事項（整合性ガードレール）
export const INTEGRITY_RULE = `【厳守】これは受験者本人が実際に従事した工事に基づく作成支援である。
- 存在しない工事・従事していない立場・虚偽の期間や金額を創作してはならない。
- 入力が不足している場合は、埋め合わせに事実を捏造せず「未入力（要記入）」と明示し、何を追記すべきか指摘する。
- C票（実務経験証明書）は受験資格を左右する公式書類であり、虚偽記載は受験停止・合格取消の対象になる旨を出力末尾に必ず注記する。
- 実務経験年数の要件は制度改正があるため、具体的な必要年数は断定せず「受験年度の公式受験案内で確認」と促す。`;

// 制度改正の注意（受験資格年数を断定しないための共通注記）
export const SEIDO_NOTE = '※ 令和6年度以降、施工管理技士は制度改正により受験資格・実務経験要件が変更されています。必要年数や指導監督的実務経験の要否は、必ず受験年度の公式「受験の手引」で確認してください。本ツールは要件充足を保証しません。';
