'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChatUI, { type ChatUIHandle } from '@/components/ChatUI';

interface Problem {
  id: string;
  level: '1級' | '2級';
  year: string;
  season?: string;
  no: number;
  subject: string;
  theme?: string;
  question: string;
  choices: string[];
  source: string;
  source_pdf?: string;
  page?: number;
  has_figure?: boolean;
  figure_url?: string;
  page_url?: string;
  category?: string;
  category_color?: string;
  correct_answer?: number;
  explanation?: string;
  choice_eval?: string[];
  similarity_score?: number;
  similarity_category?: string;
  similar_to?: string;
}

interface QuizData {
  version: string;
  n_total: number;
  n_with_4choices: number;
  by_level: Record<string, number>;
  by_subject: Record<string, number>;
  problems: Problem[];
}

const CATEGORY_ICON: Record<string, string> = {
  '丸暗記': '🔴',
  '問答暗記': '📝',
  '秒殺テク': '⚡',
  '理解必須': '🔵',
};

const SIM_COLOR: Record<string, string> = {
  '過去問と同じ': '#059669',
  'ほぼ同じ': '#10b981',
  '一部違う': '#d97706',
  '大幅違う': '#ea580c',
  '過去問と全然違う': '#7c3aed',
};

const SIM_ICON: Record<string, string> = {
  '過去問と同じ': '♻️',
  'ほぼ同じ': '↻',
  '一部違う': '🔀',
  '大幅違う': '⤵',
  '過去問と全然違う': '🆕',
};

// 試験の出題構成 — 年度ごとに変遷 (R3で制度改正)
// 出典: 一般財団法人 建設業振興基金 試験案内
type ExamGroup = { name: string; subject: string; no: string; out: number; must: number; type: '必須' | '選択' | '必須(50%以上)' | '選択中心' };
type ExamEra = { era: string; applies: string; total: number; answer: number; pass: number; note: string; groups: ExamGroup[] };
const EXAM_STRUCTURES: Record<string, ExamEra[]> = {
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
};

const CATEGORY_DEF: Record<string, string> = {
  '丸暗記': '法令の条文・規格値・用語の定義など、原理を理解しなくても暗記すれば確実に得点できる問題。試験直前に詰め込みやすい',
  '問答暗記': '穴埋め問題・選択肢の組合せで「問題と選択肢のセット」をパターンとして覚えれば解ける問題',
  '秒殺テク': 'V=IR・P=VI・三相電力=√3VI など公式一発で答えが出る計算問題。公式の暗記+代入の練習で得点源にできる',
  '理解必須': '回路の動作・電磁気学・現象の原理を理解しないと解けない応用問題。時間をかけて理解する必要がある',
};

const SIM_DEF: Record<string, string> = {
  '過去問と同じ': '問題文・選択肢ともに過去問とほぼ完全一致 (再出題)。1問解けば過去複数年分が解ける高効率問題',
  'ほぼ同じ': '問題文は同じ、選択肢の言い回しが年度で微妙に違う程度。出題ターゲットは同じなので確実に押さえたい',
  '一部違う': '同じテーマだが選択肢の一部が差し替えられた、または表現がやや変わる。コア知識は同じ',
  '大幅違う': '主題 (テーマ) は同じだが、問題の構成や聞き方が大きく異なる派生問題。応用力が必要',
  '過去問と全然違う': '新規テーマ または過去問にない聞き方。最近の出題傾向で要注意',
};

type PdfUrlMap = { answer?: Record<string, string>; problem?: Record<string, string> };

export default function QuizPage() {
  const [data, setData] = useState<QuizData | null>(null);
  const [pdfUrls, setPdfUrls] = useState<PdfUrlMap>({});
  // ダッシュボードストリップの折りたたみ
  const [dashboardCollapsed, setDashboardCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sekokan-dashboard-collapsed') === '1';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('sekokan-filter-level') || '';
  });
  const [filterSubject, setFilterSubject] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('sekokan-filter-subject') || '';
  });
  const [filterTheme, setFilterTheme] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('sekokan-filter-theme') || '';
  });
  const [filterSim, setFilterSim] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('sekokan-filter-sim') || '';
  });
  const [filterFreq, setFilterFreq] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('sekokan-filter-freq') || '';
  });
  // 学習モード: normal | weak | bookmark
  const [studyMode, setStudyMode] = useState<'normal' | 'weak' | 'bookmark' | 'browse'>(() => {
    if (typeof window === 'undefined') return 'normal';
    const v = localStorage.getItem('sekokan-mode');
    return (v === 'weak' || v === 'bookmark' || v === 'browse') ? v : 'normal';
  });
  // 間違えた問題の ID 集合 (弱点モード用 + SRS用に最終正解日時記録)
  const [wrongIds, setWrongIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem('sekokan-wrong') || '[]')); } catch { return new Set(); }
  });
  // ブックマーク (試験直前に見返す)
  const [bookmarkIds, setBookmarkIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem('sekokan-bookmark') || '[]')); } catch { return new Set(); }
  });
  // 試験日 — 1級/2級それぞれの日付を保持 (公式取得 + ユーザー上書き対応)
  const [examDates, setExamDates] = useState<{ '1級': string; '2級': string }>(() => {
    if (typeof window === 'undefined') return { '1級': '', '2級': '' };
    try { return JSON.parse(localStorage.getItem('sekokan-exam-dates') || '{}') as { '1級': string; '2級': string }; }
    catch { return { '1級': '', '2級': '' }; }
  });
  const [examDateSources, setExamDateSources] = useState<{ '1級': 'auto' | 'manual' | 'fallback' | 'unset'; '2級': 'auto' | 'manual' | 'fallback' | 'unset' }>(() => {
    if (typeof window === 'undefined') return { '1級': 'unset', '2級': 'unset' };
    try { return JSON.parse(localStorage.getItem('sekokan-exam-date-srcs') || '{}'); }
    catch { return { '1級': 'unset', '2級': 'unset' }; }
  });
  const [examDateFetching, setExamDateFetching] = useState<{ '1級': boolean; '2級': boolean }>({ '1級': false, '2級': false });
  const [examDateDebug, setExamDateDebug] = useState<{ '1級': string; '2級': string }>({ '1級': '', '2級': '' });
  // 試験スケジュール詳細 (受付期間・合格発表日)
  type ScheduleInfo = { examName: string; applyStart: string; applyEnd: string; resultDate: string; note?: string };
  const [examSchedule, setExamSchedule] = useState<{ '1級': ScheduleInfo | null; '2級': ScheduleInfo | null }>({ '1級': null, '2級': null });
  // 日別回答数 (継続率管理)
  const [dailyLog, setDailyLog] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('sekokan-daily') || '{}'); } catch { return {}; }
  });
  const [current, setCurrent] = useState<Problem | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [judged, setJudged] = useState(false);
  const [redoMode, setRedoMode] = useState(false);
  // 眺めモード用: 表示履歴 (前へ戻る用、直近 50 問)
  const [history, setHistory] = useState<Problem[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [stats, setStats] = useState(() => {
    if (typeof window === 'undefined') return { total: 0, correct: 0, wrong: 0, skipped: 0 };
    try {
      return JSON.parse(localStorage.getItem('sekokan-stats') || '{"total":0,"correct":0,"wrong":0,"skipped":0}');
    } catch {
      return { total: 0, correct: 0, wrong: 0, skipped: 0 };
    }
  });
  // 科目別正答率トラッキング (合格判定用)
  const [subjStats, setSubjStats] = useState<Record<string, { correct: number; total: number }>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('sekokan-subj') || '{}'); } catch { return {}; }
  });
  const [showReport, setShowReport] = useState(false);
  // TOP画面: 合格ロードマップを常に先頭表示 (アクセス毎)
  const [showWorkflow, setShowWorkflow] = useState(true);
  // ワークフロー対象: 級×検定 (4パターン)
  type ExamType = '1級_1次' | '1級_2次' | '2級_1次' | '2級_2次';
  const [examType, setExamType] = useState<ExamType>(() => {
    if (typeof window === 'undefined') return '2級_1次';
    const v = localStorage.getItem('sekokan-exam-type') as ExamType | null;
    if (v === '1級_1次' || v === '1級_2次' || v === '2級_1次' || v === '2級_2次') return v;
    return '2級_1次';
  });
  // 学習プロフィール: 科目別の自己評価 ('strong' = ほぼ無勉強でOK / 'medium' = 普通 / 'weak' = 苦手)
  // バックグラウンド (大学で電気習ったか・実務経験など) を反映した戦略立案に使う
  type Skill = 'strong' | 'medium' | 'weak';
  const [profile, setProfile] = useState<Record<string, Skill>>(() => {
    const def: Record<string, Skill> = { '電気理論': 'medium', '電気設備': 'medium', '施工': 'medium', '施工管理法': 'medium', '法規': 'medium' };
    if (typeof window === 'undefined') return def;
    try { return { ...def, ...JSON.parse(localStorage.getItem('sekokan-profile') || '{}') }; }
    catch { return def; }
  });
  const [showProfile, setShowProfile] = useState(false);
  // 「強み科目を演習から除外する」トグル: プロフィールの実際のメリット
  const [excludeStrong, setExcludeStrong] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sekokan-exclude-strong') === '1';
  });
  // 第二次検定 経験記述ジェネレーター
  const [showExperience, setShowExperience] = useState(false);
  type ExperienceSurvey = {
    projectName: string; location: string; client: string; startDate: string; endDate: string;
    budget: string; buildingType: string; overview: string; role: string; specialPoints: string;
    mySkills: string;
  };
  const [experienceSurvey, setExperienceSurvey] = useState<ExperienceSurvey>(() => {
    const def: ExperienceSurvey = {
      projectName: '', location: '', client: '', startDate: '', endDate: '',
      budget: '', buildingType: '', overview: '', role: '', specialPoints: '',
      mySkills: '',
    };
    if (typeof window === 'undefined') return def;
    try { return { ...def, ...JSON.parse(localStorage.getItem('sekokan-experience') || '{}') } as ExperienceSurvey; }
    catch { return def; }
  });
  const [experienceOutputs, setExperienceOutputs] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('sekokan-experience-outputs') || '{}'); }
    catch { return {}; }
  });
  const [experienceLoading, setExperienceLoading] = useState<string>('');
  const chatRef = useRef<ChatUIHandle>(null);

  useEffect(() => {
    try { localStorage.setItem('sekokan-stats', JSON.stringify(stats)); } catch {}
  }, [stats]);
  useEffect(() => {
    try { localStorage.setItem('sekokan-subj', JSON.stringify(subjStats)); } catch {}
  }, [subjStats]);
  useEffect(() => { try { localStorage.setItem('sekokan-filter-level', filterLevel); } catch {} }, [filterLevel]);
  useEffect(() => { try { localStorage.setItem('sekokan-filter-subject', filterSubject); } catch {} }, [filterSubject]);
  useEffect(() => { try { localStorage.setItem('sekokan-filter-theme', filterTheme); } catch {} }, [filterTheme]);
  useEffect(() => { try { localStorage.setItem('sekokan-filter-sim', filterSim); } catch {} }, [filterSim]);
  useEffect(() => { try { localStorage.setItem('sekokan-filter-freq', filterFreq); } catch {} }, [filterFreq]);
  useEffect(() => { try { localStorage.setItem('sekokan-mode', studyMode); } catch {} }, [studyMode]);
  useEffect(() => { try { localStorage.setItem('sekokan-wrong', JSON.stringify([...wrongIds])); } catch {} }, [wrongIds]);
  useEffect(() => { try { localStorage.setItem('sekokan-bookmark', JSON.stringify([...bookmarkIds])); } catch {} }, [bookmarkIds]);
  useEffect(() => { try { localStorage.setItem('sekokan-exam-dates', JSON.stringify(examDates)); } catch {} }, [examDates]);
  useEffect(() => { try { localStorage.setItem('sekokan-exam-date-srcs', JSON.stringify(examDateSources)); } catch {} }, [examDateSources]);

  // 自動取得: manual で上書き済みでなければ起動時に fetch
  const fetchExamDate = useCallback(async (level: '1級' | '2級') => {
    setExamDateFetching((f) => ({ ...f, [level]: true }));
    try {
      const r = await fetch(`/api/exam-date?level=${encodeURIComponent(level)}`);
      const d = await r.json();
      setExamDateDebug((dbg) => ({ ...dbg, [level]: `source=${d.source} / ${d.debug || ''} / 取得=${d.examDate || '未公表'}` }));
      if (d.examDate) {
        setExamDates((dates) => ({ ...dates, [level]: d.examDate }));
        setExamDateSources((s) => ({ ...s, [level]: d.source === 'fallback' ? 'fallback' : 'auto' }));
        setExamSchedule((sch) => ({
          ...sch,
          [level]: {
            examName: d.examName || '',
            applyStart: d.applyStart || '',
            applyEnd: d.applyEnd || '',
            resultDate: d.resultDate || '',
            note: d.note || '',
          },
        }));
      } else {
        setExamDates((dates) => ({ ...dates, [level]: '' }));
        setExamDateSources((s) => ({ ...s, [level]: 'auto' }));
        setExamSchedule((sch) => ({ ...sch, [level]: null }));
      }
    } catch (e) {
      setExamDateDebug((dbg) => ({ ...dbg, [level]: `取得失敗: ${(e as Error).message}` }));
    } finally {
      setExamDateFetching((f) => ({ ...f, [level]: false }));
    }
  }, []);

  // 起動時: 1級+2級 両方を取得 (manualで上書き済みでないもののみ)
  useEffect(() => {
    if (examDateSources['1級'] !== 'manual') fetchExamDate('1級');
    if (examDateSources['2級'] !== 'manual') fetchExamDate('2級');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 現在のフィルタ級に対応する試験日 (フィルタなしなら 2級 を主表示)
  const activeLevel: '1級' | '2級' = (filterLevel === '1級' || filterLevel === '2級') ? filterLevel : '2級';
  const examDate = examDates[activeLevel];
  const examDateSource = examDateSources[activeLevel];
  useEffect(() => { try { localStorage.setItem('sekokan-daily', JSON.stringify(dailyLog)); } catch {} }, [dailyLog]);
  useEffect(() => { try { localStorage.setItem('sekokan-profile', JSON.stringify(profile)); } catch {} }, [profile]);
  useEffect(() => { try { localStorage.setItem('sekokan-exclude-strong', excludeStrong ? '1' : '0'); } catch {} }, [excludeStrong]);
  useEffect(() => { try { localStorage.setItem('sekokan-experience', JSON.stringify(experienceSurvey)); } catch {} }, [experienceSurvey]);
  useEffect(() => { try { localStorage.setItem('sekokan-experience-outputs', JSON.stringify(experienceOutputs)); } catch {} }, [experienceOutputs]);
  useEffect(() => { try { localStorage.setItem('sekokan-dashboard-collapsed', dashboardCollapsed ? '1' : '0'); } catch {} }, [dashboardCollapsed]);
  useEffect(() => { try { localStorage.setItem('sekokan-exam-type', examType); } catch {} }, [examType]);

  // 経験記述AI生成: テーマごとにBedrockへ
  const generateExperience = useCallback(async (theme: string) => {
    setExperienceLoading(theme);
    try {
      const e = experienceSurvey;
      const prompt = `以下の実務経験情報を元に、電気工事施工管理技士 第二次検定 経験記述問題のテーマ「${theme}」用の解答例を作成してください。

【工事概要】
- 工事名: ${e.projectName || '(未入力)'}
- 工事場所: ${e.location || '(未入力)'}
- 発注者: ${e.client || '(未入力)'}
- 工期: ${e.startDate || '?'} ～ ${e.endDate || '?'}
- 施工金額: ${e.budget || '(未入力)'}
- 建物用途・規模: ${e.buildingType || '(未入力)'}
- 工事概要 (電気設備内容): ${e.overview || '(未入力)'}
- あなたの立場: ${e.role || '(未入力)'}
- 特記事項・苦労した点: ${e.specialPoints || '(未入力)'}
- あなたの強み/得意: ${e.mySkills || '(未入力)'}

【テーマ】 ${theme}

【出力フォーマット】 (試験の採点基準に合わせる)
■ 工事概要 (箇条書き5行)
  - 工事名
  - 工事場所
  - 発注者
  - 工期
  - 施工金額
  - 電気工事の概要
  - あなたの立場

■ ${theme}の経験記述 (350～400字)
  (1) 特に留意した技術的な課題 (1～2文)
  (2) 検討した内容と理由 (3～4文)
  (3) 対応処置とその評価 (3～4文)

採点者が高評価する具体性のある記述にしてください:
- 数字 (○m, ○V, ○A, ○日, ○%) を必ず盛り込む
- 法令名・規格名 (電気設備技術基準・JIS・労働安全衛生規則 等) を引用する
- 実際にやった作業として読める具体的な行動 (検討→協議→実施→検証)
- 「結果として~~を達成した」評価で締める`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let content = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        content += decoder.decode(value, { stream: true });
        setExperienceOutputs((o) => ({ ...o, [theme]: content }));
      }
    } catch (err) {
      setExperienceOutputs((o) => ({ ...o, [theme]: `⚠ エラー: ${(err as Error).message}` }));
    } finally {
      setExperienceLoading('');
    }
  }, [experienceSurvey]);

  const clearFilters = useCallback(() => {
    setFilterLevel('');
    setFilterSubject('');
    setFilterTheme('');
    setFilterSim('');
    setFilterFreq('');
  }, []);

  useEffect(() => {
    fetch('/data/quiz.json')
      .then((r) => r.json())
      .then((d: QuizData) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError((e as Error).message);
        setLoading(false);
      });
    // PDF外部URLマッピング (AWSにPDFを保存せず外部サイト直リンクで開く)
    fetch('/data/pdf-urls.json')
      .then((r) => r.json())
      .then((m: PdfUrlMap) => setPdfUrls(m))
      .catch(() => {});
  }, []);

  // 頻出度フィルタ判定 (再宣言を避けるため先に置く)
  const themeRanksAll = useMemo(() => {
    if (!data) return new Map<string, number>();
    const counts: Record<string, number> = {};
    for (const p of data.problems) {
      if (p.choices.length !== 4) continue;
      if (filterLevel && p.level !== filterLevel) continue;
      const t = p.theme || '';
      if (!t) continue;
      counts[t] = (counts[t] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const ranks = new Map<string, number>();
    sorted.forEach(([t], i) => ranks.set(t, i + 1));
    return ranks;
  }, [data, filterLevel]);

  const inFreq = useCallback((theme: string | undefined, key: string): boolean => {
    if (!key) return true;
    if (!theme) return key === 'rare';
    const r = themeRanksAll.get(theme);
    if (r === undefined) return key === 'rare';
    if (key === 'top10') return r <= 10;
    if (key === 'top30') return r <= 30;
    if (key === 'top60') return r <= 60;
    if (key === 'rare') return r > 60;
    return true;
  }, [themeRanksAll]);

  // 共通マッチャ: 指定フィルタを skip して判定
  const matches = useCallback((
    p: Problem,
    skip: { lvl?: boolean; subj?: boolean; theme?: boolean; sim?: boolean; freq?: boolean; mode?: boolean; profile?: boolean } = {},
  ): boolean => {
    if (p.choices.length !== 4) return false;
    // 解答PDFなし問題は除外 (やるだけ無駄)
    if (!p.correct_answer) return false;
    if (!skip.lvl && filterLevel && p.level !== filterLevel) return false;
    if (!skip.subj && filterSubject && p.subject !== filterSubject) return false;
    if (!skip.theme && filterTheme && p.theme !== filterTheme) return false;
    if (!skip.sim && filterSim && p.similarity_category !== filterSim) return false;
    if (!skip.freq && filterFreq && !inFreq(p.theme, filterFreq)) return false;
    if (!skip.mode) {
      if (studyMode === 'weak' && !wrongIds.has(p.id)) return false;
      if (studyMode === 'bookmark' && !bookmarkIds.has(p.id)) return false;
    }
    // プロフィール反映: 強み科目を除外 (大学で電気習った人の電気理論を捨てる等)
    if (!skip.profile && excludeStrong && profile[p.subject] === 'strong') return false;
    return true;
  }, [filterLevel, filterSubject, filterTheme, filterSim, filterFreq, inFreq, studyMode, wrongIds, bookmarkIds, excludeStrong, profile]);

  // 各科目の facet count (subject 以外を反映)
  const subjectCounts = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    const c: Record<string, number> = {};
    for (const p of data.problems) {
      if (!matches(p, { subj: true })) continue;
      c[p.subject] = (c[p.subject] || 0) + 1;
    }
    return c;
  }, [data, matches]);

  const themeOptions = useMemo(() => {
    if (!data) return [];
    const counts: Record<string, number> = {};
    for (const p of data.problems) {
      if (!matches(p, { theme: true })) continue;
      const t = p.theme || '';
      if (!t) continue;
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data, matches]);

  const themeRanks = themeRanksAll; // alias (既存参照を維持)

  // 頻出度別の問題数 (freq 以外の全フィルタを反映)
  const freqCounts = useMemo(() => {
    if (!data) return { top10: 0, top30: 0, top60: 0, rare: 0 };
    const c = { top10: 0, top30: 0, top60: 0, rare: 0 };
    for (const p of data.problems) {
      if (!matches(p, { freq: true })) continue;
      if (inFreq(p.theme, 'top10')) c.top10++;
      if (inFreq(p.theme, 'top30')) c.top30++;
      if (inFreq(p.theme, 'top60')) c.top60++;
      if (inFreq(p.theme, 'rare')) c.rare++;
    }
    return c;
  }, [data, matches, inFreq]);

  // 問題を current にセットし、browse モードなら正解を最初から表示する
  const displayProblem = useCallback((p: Problem) => {
    setCurrent(p);
    if (studyMode === 'browse') {
      setSelected(p.correct_answer ? p.correct_answer - 1 : null);
      setJudged(true);
    } else {
      setSelected(null);
      setJudged(false);
    }
  }, [studyMode]);

  const pickNext = useCallback(() => {
    if (!data) return;
    // 履歴の途中にいる場合 (前へ戻った後の「次へ」) は履歴を前進
    if (historyIdx >= 0 && historyIdx < history.length - 1) {
      const next = history[historyIdx + 1];
      setHistoryIdx(historyIdx + 1);
      displayProblem(next);
      return;
    }
    const pool = data.problems.filter((p) => matches(p));
    if (pool.length === 0) {
      setCurrent(null);
      return;
    }
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    setHistory((h) => {
      const newH = [...h.slice(-49), chosen];
      setHistoryIdx(newH.length - 1);
      return newH;
    });
    displayProblem(chosen);
  }, [data, matches, history, historyIdx, displayProblem]);

  // 履歴を遡って前の問題に戻る
  const goPrev = useCallback(() => {
    if (historyIdx <= 0) return;
    const newIdx = historyIdx - 1;
    const prev = history[newIdx];
    if (prev) {
      setHistoryIdx(newIdx);
      displayProblem(prev);
    }
  }, [history, historyIdx, displayProblem]);

  // 類似度別の facet count (sim 以外の全フィルタを反映)
  const simCounts = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const p of data.problems) {
      if (!matches(p, { sim: true })) continue;
      const c = p.similarity_category || '';
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [data, matches]);

  // 級別 facet count
  const levelCounts = useMemo(() => {
    if (!data) return { '1級': 0, '2級': 0 };
    const c: Record<string, number> = { '1級': 0, '2級': 0 };
    for (const p of data.problems) {
      if (!matches(p, { lvl: true })) continue;
      c[p.level] = (c[p.level] || 0) + 1;
    }
    return c;
  }, [data, matches]);

  // 現在のプール総数
  const poolTotal = useMemo(() => {
    if (!data) return 0;
    return data.problems.reduce((n, p) => n + (matches(p) ? 1 : 0), 0);
  }, [data, matches]);

  const judge = useCallback((idx: number) => {
    if (!current || judged) return;
    // 眺めモードでは判定しない (回答済み扱いだが統計不更新)
    if (studyMode === 'browse') return;
    setSelected(idx);
    setJudged(true);
    // 統計更新 (REDO_MODE中は加算しない)
    if (!redoMode && current.correct_answer) {
      const correct = (idx + 1) === current.correct_answer;
      setStats((s: { total: number; correct: number; wrong: number; skipped: number }) => ({
        ...s,
        total: s.total + 1,
        correct: s.correct + (correct ? 1 : 0),
        wrong: s.wrong + (correct ? 0 : 1),
      }));
      const subj = current.subject || 'その他';
      setSubjStats((s) => {
        const prev = s[subj] || { correct: 0, total: 0 };
        return { ...s, [subj]: { correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 } };
      });
      // 弱点トラッキング: 不正解→追加、正解→除外 (SRS的)
      const pid = current.id;
      if (correct) {
        if (wrongIds.has(pid)) {
          setWrongIds((prev) => { const n = new Set(prev); n.delete(pid); return n; });
        }
      } else {
        if (!wrongIds.has(pid)) {
          setWrongIds((prev) => new Set(prev).add(pid));
        }
      }
      // 日別ログ (YYYY-MM-DD) — 継続率/ペース表示用
      const today = new Date().toISOString().slice(0, 10);
      setDailyLog((d) => ({ ...d, [today]: (d[today] || 0) + 1 }));
    }
  }, [current, judged, redoMode, wrongIds, studyMode]);

  // Space キーで次の問題 / ← で前へ (眺めモード用ナビゲーション)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // テキスト入力中は無視
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (studyMode !== 'browse') return;
      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        pickNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [studyMode, pickNext, goPrev]);

  // 試験日までの残日数 + 1日あたり推奨問題数
  const examInfo = useMemo((): { days: number | null; dailyTarget: number; todayCount: number; totalTarget: number; remaining: number; pace: string } => {
    if (!examDate) return { days: null, dailyTarget: 0, todayCount: 0, totalTarget: 0, remaining: 0, pace: '未設定' };
    const target = new Date(examDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.floor((target.getTime() - today.getTime()) / 86400000);
    const todayCount = dailyLog[new Date().toISOString().slice(0, 10)] || 0;
    const totalTarget = Math.max(300, Math.floor(poolTotal * 0.5));
    const remaining = Math.max(0, totalTarget - stats.total);
    const dailyTarget = days > 0 ? Math.ceil(remaining / days) : remaining;
    return { days, dailyTarget, todayCount, totalTarget, remaining, pace: days <= 0 ? '試験日経過' : days < 30 ? '直前期' : days < 90 ? '集中期' : '基礎固め期' };
  }, [examDate, dailyLog, poolTotal, stats.total]);

  const toggleBookmark = useCallback(() => {
    if (!current) return;
    const pid = current.id;
    setBookmarkIds((prev) => {
      const n = new Set(prev);
      if (n.has(pid)) n.delete(pid); else n.add(pid);
      return n;
    });
  }, [current]);

  const next = useCallback(() => {
    setRedoMode(false);
    setShowReport(false);
    pickNext();
  }, [pickNext]);

  const skipUnanswered = useCallback(() => {
    setStats((s: { total: number; correct: number; wrong: number; skipped: number }) => ({ ...s, skipped: s.skipped + 1 }));
    next();
  }, [next]);

  const redo = useCallback(() => {
    setRedoMode(true);
    setSelected(null);
    setJudged(false);
    chatRef.current?.clear();
  }, []);

  const resetStats = useCallback(() => {
    if (!confirm('統計をリセットしますか？')) return;
    setStats({ total: 0, correct: 0, wrong: 0, skipped: 0 });
    setSubjStats({});
  }, []);

  const openKakomon = useCallback(() => {
    if (!current) return;
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
    const map = current.level === '1級' ? KAKOMON_MAP_1 : KAKOMON_MAP_2;
    const host = current.level === '1級' ? 'denkisekou1' : 'denkisekou2';
    const key = `${current.year}_${current.season || ''}`;
    const id = map[key] || map[`${current.year}_`];
    if (id) {
      window.open(`https://${host}.kakomonn.com/list1/${id}`, '_blank');
    } else {
      window.open(`https://${host}.kakomonn.com/`, '_blank');
    }
  }, [current]);

  const openProblemPdf = useCallback(() => {
    if (!current) return;
    const pdfName = current.source_pdf || current.source.replace(/\.txt$/, '.pdf');
    const key = `${current.level}_第一次/${pdfName}`;
    const url = pdfUrls.problem?.[key];
    // 安全チェック: 必ず 2級 problem -> 2級 URL になっているか
    const levelTag = current.level === '1級' ? '1denki' : '2denki';
    const isLevelMismatch = url && url.includes(current.level === '1級' ? '2denki' : '1denki');
    if (url && !isLevelMismatch) {
      window.open(`${url}#page=${current.page || 1}`, '_blank', 'noopener,noreferrer');
    } else {
      if (isLevelMismatch) {
        alert(`URL不整合検出: ${current.level} ${current.year} の問題PDFが ${levelTag} を含みません。kakomonn 解説サイトを開きます。`);
      } else {
        alert(`${current.level} ${current.year} の問題PDFは外部サイトに直リンク無し。kakomonn 解説サイトを開きます。`);
      }
      openKakomon();
    }
  }, [current, pdfUrls, openKakomon]);

  const openAnswerPdf = useCallback(() => {
    if (!current) return;
    const denki = current.level === '1級' ? '1denki' : '2denki';
    // 1級は AM/PM (午前/午後)、2級は 前期=AM=early / 後期=PM=late
    let suffix = '';
    if (current.level === '1級' && current.season === 'AM') suffix = '_am';
    else if (current.level === '1級' && current.season === 'PM') suffix = '_pm';
    else if (current.level === '2級' && current.season === 'AM') suffix = '_early';
    else if (current.level === '2級' && current.season === 'PM') suffix = '_late';
    const ansName = `${current.year}_${denki}_01${suffix}_kaitou.pdf`;
    const primaryKey = `${current.level}_第一次/${ansName}`;
    let url = pdfUrls.answer?.[primaryKey];
    // フォールバック: suffix なしのキー(古い年度) も試す
    if (!url) {
      const fallbackName = `${current.year}_${denki}_01_kaitou.pdf`;
      url = pdfUrls.answer?.[`${current.level}_第一次/${fallbackName}`];
    }
    // フォールバック2: pdf-urls.json の全 answer キーから level/year/season で検索
    if (!url) {
      const answerKeys = Object.keys(pdfUrls.answer || {});
      const yearTag = current.year;
      const seasonTag = current.season === 'AM' ? '(早|前|am|AM)' : current.season === 'PM' ? '(後|遅|pm|PM|late)' : '';
      const re = new RegExp(`${current.level}.*${yearTag}.*${seasonTag}`);
      const matchKey = answerKeys.find((k) => re.test(k));
      if (matchKey) url = pdfUrls.answer![matchKey];
    }
    // 安全チェック: URL が正しい級を指しているか
    const isLevelMismatch = url && url.includes(current.level === '1級' ? '2denki' : '1denki');
    if (url && !isLevelMismatch) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      if (isLevelMismatch) {
        alert(`URL不整合検出: ${current.level} ${current.year} の解答PDFが ${denki} を含みません。kakomonn 解説サイトを開きます。`);
      } else {
        alert(`${current.level} ${current.year}${current.season ? ' ' + current.season : ''} の解答PDFは外部URL未登録。kakomonn 解説サイトを開きます。`);
      }
      openKakomon();
    }
  }, [current, pdfUrls, openKakomon]);

  const askAi = useCallback(() => {
    if (!current) return;
    const isNeg = /不適当|誤って|誤った|定められていない|該当しない|関係のない|含まれない|除かれて/.test(current.question);
    const hasExp = !!current.explanation;
    const isLaw = /法|条|令|規程|JIS|定められ|届出|記載|許可|該当する/.test(current.question || '');
    const numChoices = (current.choices || []).length;
    const is5Choice = numChoices === 5;
    const isOuyou = is5Choice && current.level === '1級' && (current.no || 0) >= 71 && (current.no || 0) <= 82;
    const hasFigureRef = /図に示す|図の|示す図|図のような|バーチャート|工程表/.test(current.question || '');
    chatRef.current?.sendMessage(
      `この問題を **試験本番で点を取る** ために必要な知識を全部出してください。

${hasFigureRef ? `## ⚠️ 図表参照問題の特別ルール
- この問題は **図/グラフ/バーチャート/工程表** を参照しています。AIはその図を直接見られません。
- 図の内容を推定して説明する場合は **「※図と整合的と仮定」** または **「※図の数値を確認してください」** と明示してください。
- 図の数値を断定的に書かない (例: 「9月末で約20%」は問題文に書かれていない限り推測)。

` : ''}${isOuyou ? `## 🎯 応用能力問題の特別ルール (1級 No.71-82)
- この問題は **応用能力 (5択必須回答)** です。1級1次の合格には「全体60%以上 + 応用能力 No.71-82 で50%以上必須」(足切り条件)。
- 5択なので 1択あたり 20% の確率 → 正答以外の4つの誤り理由を **全て** 解説してください (4択時より重要)。
- 図表/工程表/グラフを読み取って判断する問題が多いので、図情報の読み取りパターンも併記。

` : is5Choice ? `## 📐 5択問題の特別ルール
- この問題は5択。正答以外の4つの誤り理由を **全て** 解説してください (省略禁止)。

` : ''}${isLaw ? `## ⚠️ 法令問題の特別ルール (Haiku モデル向けの幻覚防止)
1. 条文番号 (例: 第7条第1項第2号) を書くときは **確信のあるもののみ**。確信できない場合は「○○法に規定 (条項番号要確認)」と書く。
2. 「○○は同法第X条で定められている」と書く前に、その事実を本問の正答番号と矛盾しないか必ず再チェック。
3. 否定形問題 (=定められていないものを選ぶ) では、**正答以外の${numChoices - 1}つは全て "定められている" もの** です。誤って正答以外を「定められていない」と説明してはいけません。

` : ''}` + `

## 必須プロセス
1. **極性判定**: この問題は「${isNeg ? '**不適当/誤り/該当しない** を選ぶ問題 → 正答番号の選択肢は虚偽' : '**適当/正しい** を選ぶ問題 → 正答番号の選択肢が真実'}」です。これを冒頭で確認してから書き始めてください。
2. **${hasExp ? '公式解説 (kakomonn由来) が context にあります。これを最優先の事実根拠とし、矛盾があれば公式に従う。' : '公式解説はありません。一次資料 (法令条文/JIS規格/教科書) に基づいて根拠を書く。根拠不明なら "※根拠要確認" と添える。'}**
3. 必ず **正答の根拠** と **誤答3つそれぞれの誤り理由** を書く。誤答理由を省略するのは禁止。
4. **覚え方** を具体的に書く (キーワード→正答の対応、公式、語呂、引っ掛けパターン)。
5. **1秒で解くアプローチ** を最後に書く (本番で何を見ればよいか)。

## 出力構造 (この見出しで書く)

**✅ 正答: ${current.correct_answer || '?'}番**
${isNeg
  ? `この問題は「${current.question.match(/不適当|誤って|誤った|定められていない|該当しない|関係のない/)?.[0] || '不適当'}」を選ぶ問題。
**選択肢${current.correct_answer}の "${(current.choices?.[Number(current.correct_answer) - 1] || '').slice(0, 60)}" は誤った文。**
正しくは: (訂正後の事実をここで明示)。
根拠: (法令条文/公式/原理)`
  : `**選択肢${current.correct_answer}の "${(current.choices?.[Number(current.correct_answer) - 1] || '').slice(0, 60)}" が正しい文。**
根拠: (法令条文/公式/原理を明示)`}

**${isNeg ? '🟢 正答以外の3つ = "実際に定められている / 正しい" 文の解説' : '❌ 誤答3つの解説'}**
${isNeg
  ? `正答以外の3つは **すべて「実際に定められている / 真実」** です。「定められていない」「誤り」と書いては絶対にいけません (これは Haiku の典型的なミス)。

以下の形式で必ず3つ全て書く:
${(current.choices || []).map((_, i) => (i + 1) === current.correct_answer ? '' : `- 選択肢${i + 1}: **これは ${(/定められていない|定められて/.test(current.question || '')) ? '法令で定められている' : '正しい'} 事実** 。根拠: (条文/公式) 。これが正しい理由: 〜〜`).filter(Boolean).join('\n')}`
  : `正答以外の3つはすべて誤りです。以下の形式で必ず3つ全て書く:
${(current.choices || []).map((_, i) => (i + 1) === current.correct_answer ? '' : `- 選択肢${i + 1}: **これは誤り** 。根拠: (条文/公式) 。正しくは: 〜〜`).filter(Boolean).join('\n')}`}

**🔑 暗記/解法のコツ**
- このテーマで覚えるべき **キーワード→正答** 対応 (3-5個、具体的に)
- 関連する **公式/数値** を全列挙
- **引っ掛けパターン** (この問題で受験生が間違える典型)

**📚 学習カテゴリ**
- 丸暗記 / 理解必須 / 公式一発 / 問答暗記 のどれか
- 出題頻度の推定 (毎年/隔年/稀)
- 学習投資の優先度 (HIGH/MID/LOW) と理由

**🎯 試験本番での1秒判定法**
- 設問で見るべきキーワード
- 2択まで絞るためのフレーズ判別
- 計算問題なら計算量の見積もり (何秒で解けるか)

**📝 関連知識 (発展)**
このテーマで他に問われそうな知識 (3-5個、箇条書き)

スマホで読める範囲で、内容は妥協なく書いてください (1000-1800字目安)。`,
    );
  }, [current]);

  // 機能①: 4択全ての正誤理由を一括解説 (1問→4問分の学習密度)
  const explainAllChoices = useCallback(() => {
    if (!current) return;
    const isNeg = /不適当|誤って|誤った|定められていない|該当しない|関係のない|含まれない|除かれて/.test(current.question);
    const choicesEnumerated = (current.choices || []).map((c, i) => {
      const isAns = (i + 1) === current.correct_answer;
      const truthLabel = isNeg
        ? (isAns ? '✗ 虚偽の文 (=正答=設問の "誤り" に該当)' : '✓ 真実の文 (=誤答=実際は法令や原理で正しい)')
        : (isAns ? '✓ 真実の文 (=正答)' : '✗ 虚偽の文 (=誤答)');
      return `### 選択肢${i + 1} [${truthLabel}]\n本文: ${c}`;
    }).join('\n\n');
    chatRef.current?.sendMessage(
      `この問題で **1問分の時間で4問分の知識** を身につける解説を作ってください。

## 設問の極性
この問題は ${isNeg ? '**不適当/誤り/該当しない を選ぶ問題**。正答=虚偽の文、誤答3つ=真実の文。' : '**適当/正しい を選ぶ問題**。正答=真実の文、誤答3つ=虚偽の文。'}

## 選択肢一覧 (極性ラベル付き)
${choicesEnumerated}

## ⚠️ 出力時の絶対ルール
**各選択肢の見出しの "[✓ or ✗]" は上記の事実真偽ラベルをそのまま使うこと。**
- ✓ は "真実の文/法令で定められている/公式で正しい" を表す
- ✗ は "虚偽の文/法令で定められていない/公式で誤り" を表す
- ${isNeg ? '正答 (=設問が "誤り" を要求するので) は ✗、誤答3つは ✓ になります。' : '正答は ✓、誤答3つは ✗ になります。'}
- これらの記号と "判定" の内容は絶対に矛盾させないこと。

## 必須プロセス
各選択肢について以下を漏れなく書く:
1. **判定**: ✓(真実=法令通り) or ✗(虚偽=法令違反/計算誤り)
2. **根拠**: 法令条文/JIS規格/公式/物理原理を具体的に明示 (抽象論禁止)
3. **覚えるべき固有値/キーワード**: この選択肢から覚えるべき数値・固有名詞・条文番号
4. **引っ掛けへの書き換え**: ${isNeg ? '(真実の文→誤りにするには)' : '(誤りの文→真実にするには)'} どこを書き換えれば極性反転するか
5. **横展開**: この選択肢の知識から派生する関連問題で問われそうなポイント (1-2個)

## 出力フォーマット

**🔍 設問の極性**: ${isNeg ? '不適当系 (正答=虚偽の文を選ぶ問題)' : '肯定系 (正答=真実の文を選ぶ問題)'}

**📋 全選択肢の詳細解説**
(上記 "選択肢一覧" のラベルをそのまま見出しに使う)

例:
### 選択肢1 [${isNeg ? '✓ 真実の文 (=誤答=実際は法令や原理で正しい)' : '✓ 真実の文 (=正答)'}]
- 判定: ✓ (真実=法令通り)
- 根拠: ...
- ${isNeg ? '実際の事実: ' : 'なぜ正しいか: '}〜〜
- 覚えるキーワード/数値: 〜〜
- 引っ掛けの書き換え: 〜〜
- 関連で問われる: 〜〜

(選択肢2,3,4も同様に必ず書く)

**字数目安**: 各選択肢 100〜180字程度。冗長にせず、根拠と覚え方に絞る。max_tokens を超えると途中切れになるので、全選択肢を **均等な分量で** 書く。

**🧠 この問題で身につく4知識まとめ**
本問の選択肢から派生する4つの覚えるべき事実を箇条書き

**🎯 試験本番の1秒判定**
4択を見たとき、何のキーワード/数値を見れば瞬時に正答が分かるか
${isNeg ? '誤答パターン (= 正答候補) の見分け方' : '正答パターンの見分け方'}

具体性が命です。一般論は無価値。条文番号・固有名詞・数値を必ず書く。`,
    );
  }, [current]);

  // 機能②: 数値だけ変えた類題を生成 (計算問題の解法パターン定着)
  const generateSimilar = useCallback(() => {
    if (!current) return;
    chatRef.current?.sendMessage(
      `この問題と **同じ解法パターン** で **類題を2問** 作ってください。解法パターンを身につけることが目的です。

## 難易度の設計指針 (重要)
- **類題1 (易)**: 原問題と **同じ条件構造**、**数値だけ変更**。手順をそのまま追えば解ける。受験生が解けるか確認するチェック用。
- **類題2 (難=応用)**: 原問題の **解法を一部応用** する形に変更。例えば:
  - 計算問題: 結線種別をΔ→Yに変える / 求める量を相電流→線電流に変える / 1段階多い計算を必要にする
  - 法令問題: 関連条文や類似制度に問いを変える
  - 図記号問題: 類似だが見分けが難しい記号同士の比較
  - 目的: 「公式を覚えただけ」では解けず、**解法の応用力** が試される
- 易と難の難易度差は明確に。安易に数値変更だけの "難" は禁止。

## 原問題
${current.question.slice(0, 350)}
選択肢:
${(current.choices || []).map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
正答: ${current.correct_answer || '?'}番

## 必須プロセス

### ステップ1: 原問題の解法パターンを抽出
原問題を解くために使った **公式/手順/思考プロセス** を **言語化** してください。
- 使った公式: (例: P=√3 VIcosφ)
- 解法の流れ: (例: ①与えられた電圧と抵抗からインピーダンスZ計算 → ②オームの法則でI = V/Z)
- 注意点: (例: Δ結線では線電流=√3×相電流)

### ステップ2: 類題2問の作成
類題は **同じ解法パターン** で **数値だけ・条件の組合せだけ変えた問題**。問題タイプも極性 (適当/不適当) も原問題と同じに揃えてください。

各類題は以下のフォーマットで:

---
**【類題N】(難易度: 易/中/難)**

問題文: (原問題と同じ構造、数値だけ変更。文の長さも近づける)

選択肢:
1. (現実的な値、計算ミスでありがちな値)
2. ...
3. ...
4. ...

**【正答】** N番

**【解法】** (公式の当てはめ→計算→答え、3-6行で完結)

**【引っ掛け】** 誤答選択肢のうち、どれが「典型的な計算ミスの結果」になっているか、誤答に誘導するロジック (例: √3を掛け忘れる、Y/Δ変換を忘れる、単位を間違える等)

**【パターン定着のチェックポイント】** この問題が解けたら身についた、解けなかったら原問題の何処を見直すべきか
---

### ステップ3: 解法パターンのまとめ
類題2問の後に「この解法は **○○を見たら→××を計算する** という流れで、本番でこのパターンを見たら30秒以内に解ける」と総括してください。

## 守るべきこと
- 数値は試験で実際に出る現実的な範囲 (例: 電圧は100/200/400/3000/6000V, 抵抗は1-1000Ω, 電力は数百W-数MW)
- 類題2問のうち、片方は **原問題よりやや易しく**、もう片方は **やや難しく** (難易度バリエーション)
- 誤答選択肢は **計算ミスで実際にたどり着く値** にする (ランダム数字は禁止)
- 計算問題でない場合 (法規/用語選択など) は、同じ "知識の問い方" で語句だけ変えた類題を作る`,
    );
  }, [current]);

  // 機能④: テーマ別「瞬殺テク集」生成 — 選択肢を絞り込むためのパターン辞典
  const generateInstantTricks = useCallback(() => {
    if (!current || !current.theme) return;
    const allProblems = data?.problems || [];
    const sameTheme = allProblems.filter((p) => p.theme === current.theme && p.id !== current.id);
    // 計算テーマかどうかを多数決で判定 (精度向上版)
    const isCalcProblem = (p: typeof current) => {
      const ch = p.choices || [];
      const q = p.question || '';
      const isLawNumeric = /法|条|令|規程|JIS|技術基準|定められ|許可|届出/.test(q);
      if (isLawNumeric) return false;
      const isPurelyNumeric = (c: string) => /^\s*[\d.√/\-+()×]+\s*(Ω|V|A|W|J|Hz|kV|kW|mA|MΩ|kΩ|kVA|cosφ|%|分|秒|時間|m|cm|mm|kg|MPa)?\s*$/.test(c);
      const purelyNum = ch.filter(isPurelyNumeric).length;
      const hasFormulaLang = /求めよ|の値として|何[\[V Ω]|を求める|表す式|算出|計算式/.test(q);
      return purelyNum >= 4 || (hasFormulaLang && purelyNum >= 2);
    };
    const calcCount = sameTheme.filter(isCalcProblem).length + (isCalcProblem(current) ? 1 : 0);
    const isCalcTheme = calcCount >= Math.max(2, Math.floor((sameTheme.length + 1) * 0.5));
    const sampleN = Math.min(sameTheme.length, 8);
    const examplesBlock = sampleN > 0
      ? `\n## 同テーマの過去問サンプル (${sampleN}問。これらの選択肢と正答を見比べて傾向を抽出してください)\n` + sameTheme.slice(0, 8).map((p, i) =>
          `### 例${i + 1}: ${p.level} ${p.year}${p.season ? ' ' + p.season : ''} No.${p.no}\n` +
          `Q: ${p.question.slice(0, 280)}\n` +
          `選択肢:\n${(p.choices || []).map((c, j) => `  ${j + 1}. ${c.slice(0, 110)}`).join('\n')}\n` +
          (p.correct_answer ? `**正答: ${p.correct_answer}番**` : ''),
        ).join('\n\n')
      : '';

    // 計算テーマなら「公式と解法パターン」フォーマットに切り替え
    if (isCalcTheme) {
      chatRef.current?.sendMessage(
        `テーマ「${current.theme}」(${current.subject}) は **計算問題が中心** のテーマです。「選択肢から絞り込む」よりも、**公式と典型解法パターン** で素早く解く方が確実です。

## 現在の問題
${current.question.slice(0, 300)}
選択肢:
${(current.choices || []).map((c, i) => `  ${i + 1}. ${c.slice(0, 100)}`).join('\n')}
正答: ${current.correct_answer || '?'}番
${examplesBlock}

## 必須プロセス

### ステップ1: このテーマで頻出する公式を厳選
過去問サンプルを見て、繰り返し使われている **公式・物理法則** をリストアップ (3-5個)。

### ステップ2: 典型解法パターン
このテーマの問題を解くための **標準手順** を1セット書く (3-5ステップ)。

### ステップ3: 引っ掛けの数値パターン
誤答選択肢に出やすい "計算ミスの結果" の傾向 (√3 を掛け忘れる、Y/Δ 変換忘れる等)。

### ステップ4: 1秒判定法
問題文を見た瞬間に「これは公式X」と即決するキーワード。

## 出力フォーマット

【📐 このテーマで必須の公式 (3-5個)】
- 公式1: 数式 — 使う場面
- 公式2: 数式 — 使う場面

【🔍 4選択肢の数値関係を観察】 (必須)
本問の4選択肢の数値を見比べて、**等比/整数倍/√3 倍** 等の関係を抽出する。例:
- 「5/√3, 5, 5√3, 15」 → 5 の 1/√3 倍, 1倍, √3倍, 3倍 (典型: Y/Δ判定や √3 掛け忘れの引っ掛け)
- 4選択肢が等比数列なら、誤答は計算ミスでたどり着く値

【🔢 典型解法パターン】
1. 問題文から○○を読み取る
2. ○○を使って△△を計算
3. 最終的に××を求める

【⚠ 誤答に多い計算ミス】 (3-4個、上記の数値関係を踏まえて)
- 「○○を△△と混同」(例: 相電流と線電流の混同)
- 「○○を掛け忘れる」(例: √3 を掛け忘れる)

【🎯 問題文を見て1秒で公式を当てる】
- 問題文に「○○」 → 公式X
- 問題文に「△△」 → 公式Y

【💡 ありがちな引っ掛け選択肢の特徴】
- 正答の √3 倍 や 1/√3 倍 の値が誤答に並ぶ
- 単位が間違っているもの (mA vs A)

【まとめ】
このテーマは [公式適用で確実に解ける/問題ごとに条件解析が必要]。

簡潔に。Haikuモデルでも追従できるよう、過度に複雑な指示は避ける。`,
      );
      return;
    }
    chatRef.current?.sendMessage(
      `テーマ「${current.theme}」(${current.subject}) の過去問4択を **選択肢を見ただけで正答に絞り込む** ためのパターン辞典を作ってください。本番で迷ったときに見るチートシートを目指します。

## 受験生の要望
- 「正解の根拠を完全に理解する」のではなく「**選択肢を見て、これは違う・これは怪しい** と判別して絞り込みたい」
- 試験本番で迷ったときに、選択肢の語句だけ見て確率の高い答えに賭けたい

## 現在の問題
${current.question.slice(0, 300)}
選択肢:
${(current.choices || []).map((c, i) => `  ${i + 1}. ${c.slice(0, 100)}`).join('\n')}
${current.correct_answer ? `正答: ${current.correct_answer}番` : ''}
${examplesBlock}

## ⚠️ 致命的注意 — 正答位置 と 事実真偽 を絶対に区別すること

このテーマ (および電気工事施工管理試験全般) は **肯定形 (定められているもの) と 否定形 (定められていないもの) が混在** します。
- 肯定形問題の正答 = **法令に定められている文** (=真)
- 否定形問題の正答 = **法令に定められていない文** (=虚偽)

**従って「正答に出現」「誤答に出現」という言い方は禁止です**。
代わりに **「[事実] = 法令で定められている/物理法則で真」** か **「[誤事実] = 法令で定められていない/物理法則で偽」** で分類してください。

### ステップ1 (絶対実行): 各サンプル問題の極性を分類
各サンプル (例1〜N) について以下の表をまず作成:
| 例 | 極性 | 正答番号 | 正答選択肢の文 | この文は真実か虚偽か |
|---|---|---|---|---|
| 例1 | 否定形 | 4 | 営業所の所在地 | **虚偽** (実際は定められている) |
| 例2 | 肯定形 | 1 | 第一種電気工事士 | **真実** (実際に定められている) |
| ... | ... | ... | ... | ... |

(注: 否定形=「不適当/誤り/定められていない/該当しない/関係のない/含まれない/除かれて」のいずれかを設問末尾に含む問題)

### ステップ2: 「事実」ベースで頻出パターンを抽出
- **法令で実際に定められている事項** (= 肯定形の正答位置に出現 OR 否定形の誤答位置に出現): これを「定石(真)」リストに集約
- **法令で実際に定められていない事項** (= 否定形の正答位置に出現 OR 肯定形の誤答位置に出現): これを「定石(偽=引っ掛け)」リストに集約

### ステップ3: 出力 (極性に依存しない「事実」表記)

## 絶対のルール

**A. 各パターンには必ず根拠を併記:**
1. 過去問サンプル何問で同じ事実が現れたか (例: 「例1,例3,例5 の3問で "B種接地=変圧器中性点" が真と確定」)
2. 物理法則・法令の絶対基準なのか
3. 上記のいずれも示せない場合は **書かない**

**B. 3種類のラベル付け:**
- 🌐 **普遍**: 物理法則・法令の絶対基準。問題に依らず必ず成立 (例: 三相交流に√3、B種接地は150/Ig、絶縁抵抗0.1MΩ)
- 📊 **頻出**: 同テーマ過去問サンプルの **3問以上** で繰り返し同じ事実が確認できる (具体的に「例X,例Y,例Z」と明示、各例の極性を考慮した上での真偽を併記)
- ⚠ **今回固有**: 現在の問題1問だけの固有値 → **これは書くな**

**C. 禁止事項 (1つでも違反したら全文書き直し):**
- ❌ 「正答に出現」「誤答に出現」「正答位置」「誤答位置」という言い方 (位置と事実を混同するので絶対禁止、代わりに「**法令で定められている事実**」「**法令で定められていない事実**」と書く)
- ❌ 1問の選択肢の数値からテーマ一般のルールを引き出す
- ❌ 「問題文と矛盾するものは誤答」のような当たり前の話
- ❌ 現在の問題の正答番号の選択肢の文を **そのまま** "事実" として書く (否定形ならその文は虚偽だから、訂正して書く)
- ❌ 抽出できるパターンが無いのに無理やりひねり出す

**根拠記法**: 「例X(肯定形)」「例Y(否定形)」+ その例で「真の事実」or「偽の事実」かを明記。"正答に" "誤答に" は使うな。

## 出力フォーマット

【📋 サンプル極性分析】
| 例 | 極性 | 正答 | 正答選択肢の事実真偽 |
|---|---|---|---|
| 本問 | (否定形/肯定形) | N | (真/偽) |
| 例1 | ... | ... | ... |
| ... | (8問全部) | | |

【✅ 法令/原理で定められている定石 (=真の事実)】 (最大5個、根拠付き)
・[ラベル] 「○○は△△」 — 根拠: 例X(肯定形)・例Y(否定形でこの事実は真)
※「正答に」「誤答に」の語は **使わず**、「この事実は真」「この事実は偽」と書く。

例の書き方:
[📊頻出] 「主任電気工事士=第一種電気工事士」 — 根拠: 例3,例4,例7(全て肯定形でこの事実が真として登場)

【⚠ 引っ掛けで出る "実際は違う" 定石 (=偽の事実)】 (最大4個、根拠付き)
・[ラベル] 「○○ではない (真実は○○)」 — 根拠: 例X(否定形でこの事実が偽として正答化), 例Y(肯定形でこの事実が偽として誤答化)
※「正答位置」「誤答位置」の語は使わない。「この事実は偽だが正答化された」「この事実は偽として誤答化された」と書く。

例: [📊頻出] 「主任電気工事士に "一級電気工事施工管理技士" は含まれない」 — 根拠: 例3,例6 (肯定形でこの事実が偽として誤答化), 本問 (否定形でこの事実が偽として正答化)

【🔑 試験本番の2択判定法】 (1-2個)
迷ったときの最終判断基準。極性に応じた使い分けも書く。
例: 「肯定形の問題で第一種電気工事士があれば正答候補、否定形の問題で1級電気工事施工管理技士があれば正答候補(=実際は含まれない)」

【📌 暗記必須の "事実" リスト】 (3-5個、極性に依存しない表現)
- 「主任電気工事士に任命できる者=第一種電気工事士のみ (第二種・認定電工従事者・主任技術者・施工管理技士は不可)」
- 「標識記載事項=氏名/代表者/登録番号/登録年月日/主任電気工事士氏名/営業所所在地 (営業所の業務 や 開始年月日 は含まない)」

【まとめ】
1行で「このテーマは [パターンで絞れる/問題ごとの計算が必要] 」と総括。

# 自己チェック (送信前)
1. サンプル極性分析の表を出力に含めたか?
2. 「正答に出現」「誤答に出現」という表現を使っていないか?
3. 各パターンが極性をまたいで一貫性ある事実として書けているか?
4. 否定形問題の正答の文を "事実" として書いていないか? (訂正してから書く)
5. 同じ事実を 肯定形=正答位置、否定形=誤答位置 で確認しているか?

簡潔に。「事実 + 根拠 (極性込み)」のセットで書く。`,
    );
  }, [current, data]);

  // 機能③: 暗記支援 (問題タイプを判定して最適な技法を選択)
  const generateMnemonic = useCallback(() => {
    if (!current) return;
    const q = current.question || '';
    const choices = current.choices || [];
    const isNegative = /不適当|誤って|誤った|定められていない|該当しない|関係のない|含まれない|除かれて/.test(q);
    // 問題タイプを自動判定 (精度重視)
    // 法令暗記キーワード (これらがあれば calc 判定から外す)
    const isLawNumeric = /法|条|令|規程|JIS|技術基準|定められ|上、定められ|許可|届出/.test(q);
    // calc: 「計算問題」明示か、選択肢が "数値だけ" + 法令暗記でない
    const isPurelyNumeric = (c: string) => /^\s*[\d.√/\-+()×]+\s*(Ω|V|A|W|J|Hz|kV|kW|mA|MΩ|kΩ|kVA|cosφ|%|分|秒|時間|m|cm|mm|kg|MPa)?\s*$/.test(c);
    const purelyNumericChoices = choices.filter(isPurelyNumeric).length;
    const hasFormulaLang = /求めよ|の値として|何[\[V Ω]|を求める|表す式|算出|計算式|として、正しい/.test(q) && !isLawNumeric;
    // 計算問題と判定: 法令でない + (4つ全て数値 or 計算言語+2つ以上数値)
    const hasFormula = !isLawNumeric && (purelyNumericChoices >= 4 || (hasFormulaLang && purelyNumericChoices >= 2));
    // figure: 図参照 (calcより優先しない)
    const hasFigure = (/図に示す|示す図|図のような|図のように|図の(うち|中で|よう)/.test(q) || (current.has_figure ?? false)) && !hasFormula;
    // law: 法令名 + 「上」「に基づき」など。単独の「法」は除外 (「測定法」「工法」誤検出回避)
    const isLaw = /電気設備の技術基準|電気事業法|電気工事士法|建設業法|建築基準法|労働安全衛生法|消防法|労働基準法|電気用品安全法|電気工事業の業務|廃棄物の処理|大気汚染防止法|騒音規制法|JIS.{0,8}(上|では|に|規定)|日本産業規格|日本工業規格|定められ|届出|記載事項|許可を受け/.test(q);
    // pair: 「組合せ」 OR 選択肢が「○○ — △△」形式 (両側に対応関係)
    const choicesArePairs = choices.filter((c) => /[—／/＿\t]| {2,}/.test(c)).length >= 3;
    const isPair = /組合せ|の単位|の名称|の記号|に該当する用語/.test(q) || choicesArePairs;
    const problemType: 'calc' | 'figure' | 'law' | 'pair' | 'fact' =
      hasFormula ? 'calc'
      : hasFigure ? 'figure'
      : isPair ? 'pair'
      : isLaw ? 'law'
      : 'fact';
    chatRef.current?.sendMessage(
      `この問題の **暗記支援** を作ってください。問題タイプに応じた最適な技法を使います。

## 判定済みの問題タイプ: **${problemType}**
${
  problemType === 'law'
    ? '→ **法令暗記タイプ**: 「定石カード」(該当する/しないをリスト化) を使う。語呂合わせは無効なので作らない。'
    : problemType === 'figure'
    ? '→ **図記号/視覚タイプ**: 「特徴比較表」を作る。語呂合わせは無効。'
    : problemType === 'calc'
    ? '→ **計算タイプ**: 「公式カード」+ 計算手順の暗記を作る。語呂合わせは無効。'
    : problemType === 'pair'
    ? '→ **対応関係タイプ (単位・名称)**: 「対応表 + 語呂合わせ」両方使う。'
    : '→ **事実暗記タイプ**: 「定石カード」を中心に、数値部分のみ語呂合わせ。'
}

## 設問極性
${isNegative ? '**否定形 (定められていない/誤りを選ぶ)** — 正答番号の文は虚偽。暗記対象は訂正後の真実。' : '**肯定形 (正しい/定められているを選ぶ)** — 正答番号の文が真実。これを暗記。'}

## 現在の問題
${q.slice(0, 300)}
選択肢:
${(current.choices || []).map((c, i) => `  ${i + 1}. ${c.slice(0, 100)}${current.correct_answer === i + 1 ? (isNegative ? ' ← 正答 = 虚偽の文 (訂正必要)' : ' ← 正答 = 真実の文') : ''}`).join('\n')}

---

## タイプ別の出力指示

${
  problemType === 'law' || problemType === 'fact'
    ? `### 法令/事実 暗記タイプ — 「定石カード」を出力

**【📋 定石カード: ○○の○○】**
件名 (例: 「みなし登録電気工事業者の届出事項」)

**該当する (= 法令で定められている):**
- ✅ 項目A (本問の誤答位置にある選択肢、または過去問サンプルから抽出)
- ✅ 項目B
- ✅ 項目C
- ✅ 項目D

**該当しない (= 引っ掛け、定められていない):**
本問の正答の文 (否定形問題なら) を1個 + 過去問サンプルで実際に "誤答" として登場した語を最大2個まで:
- ❌ 項目E (= 本問の正答の選択肢の文)
- ❌ 項目F (= 過去問の類題で見られた引っ掛け語、無ければ書かない)

⚠ 推測で "該当しない例" を増やすのは禁止。実在する選択肢由来のみ列挙。

**【🔑 覚え方】**
1-2行で「該当する/しないを区別するキーポイント」を書く
例: 「届出書には事業の "実態" を書く。資格は **主任電気工事士のみ**、施工管理技士は別資格なので含まない」

**【🃏 一問一答カード】**
表→裏 形式で5枚程度:
- 表: ○○の○○ / 裏: A, B, C, D
- 表: ○○に含まれない代表的な引っ掛け / 裏: 1級電気工事施工管理技士、認定電工従事者 等

**【⚠ 混同しやすい類似制度との違い】**
類似する別制度 (例: 「主任技術者 (建設業法)」vs「主任電気工事士 (電気工事業法)」) との違いを1-2行ずつ。`
    : problemType === 'figure'
    ? `### 図記号/視覚タイプ — 「特徴比較表」を出力

**【📊 特徴比較表】**

| 選択肢 | 形/特徴 | 対応する用途/値 | 覚え方 |
|---|---|---|---|
| 1 | (形/特徴) | (用途/値) | (短い覚え方) |
| 2 | ... | ... | ... |
| 3 | ... | ... | ... |
| 4 | ... | ... | ... |

**【🃏 暗記カード】** 表→裏 (3-4枚)
試験で問われる対応関係を簡潔に。

**【⚠ 混同しやすいペア】**
類似する図記号や形と、その決定的な違い。

語呂合わせは作らない (図形は音より視覚で覚える方が確実なので)。`
    : problemType === 'calc'
    ? `### 計算タイプ — 「公式カード」を出力

**【📐 公式カード】**
この問題を解くのに使った公式を厳選 (最大3個):
- 公式1: ○○ = ○○ × ○○ (用途: ○○を求めるとき)
- 公式2: ...

**【🔢 計算手順 (3-5ステップ)】**
1. ステップ1: 何を計算する
2. ステップ2: ...
3. 最終: 答え

**【🃏 関連数値カード】** 表→裏 (3-4枚、計算に使う具体的な数字や係数)
- 表: 三相交流の線電流 / 裏: I_L = √3 × I_P (Δ結線)
- 表: 三相電力 / 裏: P = √3 V_L I_L cosφ

**【⚠ ありがちな計算ミス】**
受験生が間違える典型パターン (例: √3 を掛け忘れる、Y/Δ 変換を忘れる)。

語呂合わせは作らない (公式の暗記が本質)。`
    : problemType === 'pair'
    ? `### 対応関係タイプ — 「対応表 + 語呂合わせ」を出力

**【📋 対応表】**
| 用語 | 単位/記号 | 物理的意味 |
|---|---|---|
| 光度 | cd (カンデラ) | 点光源の光の強さ |
| 光束 | lm (ルーメン) | 単位時間の光エネルギー量 |
| 照度 | lx (ルクス) | 受光面の明るさ |
| 輝度 | cd/m² | 発光面の明るさ |

**【🎵 語呂合わせ (音/イメージで暗記)】**
英字略号や用語を **音変換** で覚える。3-5個。

良い例:
- 光度=cd: 「光は **コード**(code=cd) で決まる」
- 光束=lm: 「光を **ルーム**(lm) に **束**ねる」

ダメな例 (書かない):
- 「光度はcd」← ただの言い換え
- 「コウドはシーディー」← カタカナ読み

**【🃏 一問一答カード】**
表→裏 (5枚程度、対応関係を直接)

**【⚠ 混同しやすいペア】**
- 光度(cd) vs 光束(lm): cd=点、lm=面全体に届く量`
    : `### 事実暗記タイプ — 「定石カード + 暗記カード」を出力

**【📋 定石カード】**
本問の核心事実を3-5項目に箇条書き

**【🃏 暗記カード】** 表→裏 (5枚程度)

**【🎵 数値があれば語呂合わせ】**
具体的な数値 (期限、距離、容量等) があれば 1-2 個だけ音変換で語呂を作る。
無理に作らない、数値が無ければスキップ。

**【⚠ 引っ掛けパターン】**`
}

---

## 全タイプ共通の禁止事項
❌ 「質問の単語をカタカナで読んだだけ」(例: 「シュミン・デンキ・ワークス」「ニーマルのニーマル」) — 絶対書かない
❌ 「○○は△△」を言い換えただけのトートロジー
❌ 無意味な精神論やスローガン
❌ 元の選択肢文をそのまま転記
❌ 否定形問題の正答 (=虚偽の文) を真実として暗記カードに書く

## 自己チェック
1. 問題タイプ判定 (${problemType}) に応じた正しい出力フォーマットを使っているか?
2. 該当タイプで「無理に語呂を作る」を回避できているか?
3. 暗記カードの内容が本番で実際に問われる対応関係か?
4. 禁止事項に該当する出力がないか?

簡潔に、本番直前に見返せる密度で。`,
    );
  }, [current]);
  if (loading) return <div className="p-8 text-slate-600">読み込み中...</div>;
  if (error) return <div className="p-8 text-red-600">エラー: {error}</div>;
  if (!data) return null;

  const SUBJECTS_ORDER = ['電気理論', '電気設備', '施工', '施工管理法', '法規'] as const;
  const SUBJECT_HINTS: Record<string, string> = {
    '電気理論': 'オームの法則・三相交流・電磁気。大学/高校で電気工学・物理を学んだなら強。文系なら弱。',
    '電気設備': '発電/送電/受変電/照明など。電気現場経験者なら強、未経験なら中。',
    '施工': '配線/接地/絶縁/試験/検査の手順。現場経験者なら強。',
    '施工管理法': '工程/品質/安全管理・PERT。建設・製造業の管理経験者なら強。',
    '法規': '電気事業法・工事士法・建設業法・労働安全衛生法。実務で接していないと弱。',
  };
  const SKILL_LABEL: Record<Skill, string> = { strong: '💪 強み (ほぼ無勉強OK)', medium: '⚖ 普通', weak: '⚠ 苦手 (重点)' };
  const SKILL_COLOR: Record<Skill, string> = { strong: 'bg-emerald-100 text-emerald-800 border-emerald-300', medium: 'bg-slate-100 text-slate-700 border-slate-300', weak: 'bg-red-100 text-red-800 border-red-300' };

  // 弱点優先の学習推奨順序 (weak → medium → strong)
  const recommendedOrder = SUBJECTS_ORDER.map((s) => ({ subject: s, skill: profile[s] || 'medium', count: subjectCounts[s] || 0 }))
    .sort((a, b) => {
      const rank: Record<Skill, number> = { weak: 0, medium: 1, strong: 2 };
      return rank[a.skill] - rank[b.skill];
    });

  if (showProfile) {
    // 強み科目の合計問題数 (除外すると勉強量がどれだけ減るか可視化)
    const strongSubjects = SUBJECTS_ORDER.filter((s) => profile[s] === 'strong');
    const weakSubjects = SUBJECTS_ORDER.filter((s) => profile[s] === 'weak');
    const allCount = SUBJECTS_ORDER.reduce((sum, s) => sum + (data?.by_subject[s] || 0), 0);
    const strongCount = strongSubjects.reduce((sum, s) => sum + (data?.by_subject[s] || 0), 0);
    const remainCount = allCount - strongCount;
    const reductionPct = allCount ? Math.round(strongCount / allCount * 100) : 0;
    return (
      <div className="h-screen bg-gradient-to-br from-indigo-50 to-blue-50 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-bold text-blue-900">📋 学習プロフィール</h1>
            <button
              onClick={() => setShowProfile(false)}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded font-bold text-sm"
            >
              保存して閉じる →
            </button>
          </div>

          {/* メリットを最初に大きく見せる */}
          <div className="bg-gradient-to-r from-emerald-100 to-cyan-100 border-2 border-emerald-400 rounded-xl p-5 mb-4">
            <h2 className="text-lg font-bold text-emerald-900 mb-2">🎯 このプロフィールを設定すると何が良いか</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-2xl font-black text-emerald-700">{strongCount}問</div>
                <div className="text-xs text-emerald-700 font-bold">⚡ 演習スキップできる問題数</div>
                <div className="text-xs text-slate-600 mt-1">強み科目を除外することで、{reductionPct}% の問題を勉強しなくて済む</div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-2xl font-black text-blue-700">{remainCount}問</div>
                <div className="text-xs text-blue-700 font-bold">📚 集中すべき残り問題数</div>
                <div className="text-xs text-slate-600 mt-1">この問題群だけを完璧にすれば合格圏内に到達</div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-2xl font-black text-rose-700">{weakSubjects.length}科目</div>
                <div className="text-xs text-rose-700 font-bold">⚠ 重点投下する苦手科目</div>
                <div className="text-xs text-slate-600 mt-1">時間配分を多めにする科目を自動で特定</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 bg-white rounded-lg p-3">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input
                  type="checkbox"
                  checked={excludeStrong}
                  onChange={(e) => setExcludeStrong(e.target.checked)}
                  className="w-5 h-5"
                />
                <div>
                  <div className="font-bold text-slate-800">💪 強み科目を演習プールから自動除外する</div>
                  <div className="text-xs text-slate-600">
                    {excludeStrong
                      ? `ON: 全フィルタ/モードで強み科目 (${strongSubjects.join('・') || 'なし'}) を自動除外`
                      : `OFF: 全科目から出題`}
                  </div>
                </div>
              </label>
              <div className="text-xs text-slate-600 text-right">
                <div>適用後の演習プール:</div>
                <div className="text-lg font-black text-emerald-700">
                  {allCount}問 → <span className={excludeStrong ? 'text-emerald-700' : 'text-slate-400'}>{excludeStrong ? remainCount : allCount}問</span>
                </div>
              </div>
            </div>
            <ul className="text-xs text-slate-700 mt-3 space-y-0.5 list-disc pl-5">
              <li><strong>AI戦略助言</strong>がプロフィールを考慮して「強みは捨てて苦手に集中」と具体的に提案</li>
              <li><strong>合格ロードマップ画面の推奨順序</strong>が弱点優先に自動並び替え</li>
              <li><strong>合格判定</strong>が強み科目を加点扱いで現実的な合格確率を算出</li>
            </ul>
          </div>

          {/* 試験構成テーブル: 年度ごとに変遷 (R3で制度改正) */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <h2 className="text-lg font-bold text-blue-900 mb-2">🎯 試験の出題構成 — 年度ごとに変遷</h2>
            <p className="text-xs text-slate-600 mb-3">
              <strong className="text-emerald-700">R3 から制度改正</strong>。「学科試験」→「第一次検定」に変更 + 応用能力問題が追加された。
              現行制度 (R3以降) に合わせて学習。古い年度は構成が異なるので参考程度。
            </p>
            {(['1級', '2級'] as const).map((lvl) => (
              <details key={lvl} open className="mb-3">
                <summary className="cursor-pointer font-bold text-blue-800 text-sm py-1.5 px-2 bg-blue-50 hover:bg-blue-100 rounded">
                  📋 {lvl}: 現行 + 過去制度
                </summary>
                <div className="pt-2 space-y-2">
                  {EXAM_STRUCTURES[lvl].map((era, eraIdx) => (
                    <details key={era.era} open={eraIdx === 0} className="border rounded">
                      <summary className="cursor-pointer px-2 py-1.5 bg-slate-50 hover:bg-slate-100 flex items-center gap-2 text-xs font-bold">
                        <span className="text-slate-800">{era.era} ({era.applies})</span>
                        {eraIdx === 0 ? (
                          <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded">現行 (学習対象)</span>
                        ) : (
                          <span className="text-[10px] bg-slate-300 text-slate-700 px-1.5 py-0.5 rounded">参考</span>
                        )}
                        <span className="ml-auto text-[10px] text-slate-600 font-normal">全{era.total}問 / {era.answer}問解答</span>
                      </summary>
                      <div className="p-2">
                        <p className="text-[11px] text-slate-600 mb-1">📝 {era.note}</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-blue-50 text-blue-900">
                              <th className="px-2 py-1 text-left">区分</th>
                              <th className="px-2 py-1 text-left">No.</th>
                              <th className="px-2 py-1 text-right">出題</th>
                              <th className="px-2 py-1 text-right">解答</th>
                              <th className="px-2 py-1 text-left">区分</th>
                              <th className="px-2 py-1 text-left">戦略</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {era.groups.map((g, i) => {
                              const isMust = g.type.startsWith('必須');
                              const skip = g.out - g.must;
                              const skill = profile[g.subject];
                              const myStrategy =
                                isMust && skill === 'weak' ? '⚠ 必須かつ苦手 → 最優先' :
                                isMust ? '✅ 必須 → 必ず学習' :
                                !isMust && skill === 'strong' ? `💪 選択かつ強み → 多めに選ぶ` :
                                !isMust && skill === 'weak' ? `⚠ 選択だが苦手 → ${skip}問捨てて他で稼ぐ` :
                                `${skip}問捨てられる`;
                              return (
                                <tr key={i} className={isMust ? 'bg-red-50' : 'bg-emerald-50'}>
                                  <td className="px-2 py-1 font-bold">{g.name}</td>
                                  <td className="px-2 py-1 text-slate-500">{g.no}</td>
                                  <td className="px-2 py-1 text-right">{g.out}</td>
                                  <td className="px-2 py-1 text-right font-bold">{g.must}</td>
                                  <td className={`px-2 py-1 font-bold ${isMust ? 'text-red-700' : 'text-emerald-700'}`}>{g.type}</td>
                                  <td className="px-2 py-1 text-slate-700">{myStrategy}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>

          <h2 className="text-lg font-bold text-slate-800 mb-2">あなたのバックグラウンドを科目別に</h2>
          <p className="text-sm text-slate-600 mb-3">
            ヒント: <strong className="text-emerald-700">大学/高校で電気・物理を学んだなら電気理論=強み</strong>、<strong className="text-rose-700">実務未経験の人は法規・施工管理法=苦手</strong>になりがち。
          </p>
          <div className="space-y-2.5">
            {SUBJECTS_ORDER.map((s) => (
              <div key={s} className="bg-white rounded-lg shadow p-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <h3 className="font-bold text-slate-800">{s} <span className="text-xs font-normal text-slate-500 ml-1">({data?.by_subject[s] || 0}問)</span></h3>
                </div>
                <p className="text-xs text-slate-600 mb-2">{SUBJECT_HINTS[s]}</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['strong', 'medium', 'weak'] as Skill[]).map((sk) => (
                    <button
                      key={sk}
                      onClick={() => setProfile((p) => ({ ...p, [s]: sk }))}
                      className={`px-3 py-1.5 rounded border-2 text-xs font-bold transition ${
                        profile[s] === sk ? SKILL_COLOR[sk] + ' ring-2 ring-offset-1' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
                      }`}
                    >
                      {SKILL_LABEL[sk]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ワークフローの各ステップ実行アクション
  const closeWorkflow = () => {
    setShowWorkflow(false);
    try { localStorage.setItem('sekokan-workflow-seen', '1'); } catch {}
  };
  const wfReport = () => {
    closeWorkflow();
    // 簡易版を優先 (要点だけまとめた1ページ版)。第二次検定なら 2次用レポート
    const lvl = filterLevel === '1級' ? '1級' : '2級';
    const is2nd = examType === '1級_2次' || examType === '2級_2次';
    const target = is2nd ? `施工管理${lvl}_2次_簡易版.html` : `施工管理${lvl}_簡易版.html`;
    window.open(`/api/report/${target}`, '_blank');
  };
  const wfBrowse = () => {
    setStudyMode('browse');
    closeWorkflow();
    setTimeout(() => pickNext(), 50);
  };
  const wfPattern = () => {
    setStudyMode('browse');
    setFilterFreq('top10');
    closeWorkflow();
    setTimeout(() => {
      pickNext();
      chatRef.current?.sendMessage(
        `今表示されている問題のテーマで、過去問が **繰り返し問うている共通の視点・出題パターン** を分析してください。

## 必須プロセス
1. 同テーマの過去問サンプル (context にあれば6-8問) を比較
2. **正答パターンの共通点** を抽出 (正答に出やすい単語/数値/法令用語)
3. **誤答パターンの共通点** を抽出 (誤答に頻出するNGワード)
4. **出題角度** の分類 (例: 数値の上下限を問う / 主体(誰が)を問う / 期限を問う / 単位を問う)

## 出力構造

**🎯 このテーマで繰り返し問われる視点 (Top 5)**
1. (角度名) — 例X,Yで類似の問われ方
2. ...

**✅ 正答に出やすい単語/数値 (根拠付き)**
- 「○○」 → 例X,Yで正答位置に頻出
- ...

**❌ 誤答に頻出するNGワード**
- 「省略できる」「に限り」 → 安全関連で誤答定番
- ...

**🔁 周期性/傾向**
- 数年置きに繰り返し出題されている具体的論点
- 直近の出題頻度 (急増/安定/減少)

**📌 このテーマで覚えるべき不変ポイント (5個)**
法令/物理/規格の絶対基準のみ、根拠付きで列挙

⚠ サンプル数の正確なカウントが難しい場合は「例N問程度」「複数の例で確認」のように **曖昧表現でよい**。具体的な数 (5問とか6問) を間違って書く方が悪い。
抽象論禁止。具体的な過去問例 (例X, 年度) を必ず引用すること。`,
      );
    }, 300);
  };
  const wfUnderstand = () => {
    setStudyMode('normal');
    closeWorkflow();
    setTimeout(() => pickNext(), 50);
  };
  const wfTricks = () => {
    setStudyMode('normal');
    closeWorkflow();
    setTimeout(() => {
      pickNext();
      setTimeout(() => generateInstantTricks(), 800);
    }, 50);
  };
  const wfFrequent = () => {
    setStudyMode('normal');
    setFilterFreq('top30');
    closeWorkflow();
    setTimeout(() => pickNext(), 50);
  };
  const wfWeak = () => {
    setStudyMode('weak');
    closeWorkflow();
    setTimeout(() => pickNext(), 50);
  };

  // 区分連動: workflow発動時に level filter を合わせる
  const wfSetLevel = (lv: '1級' | '2級') => () => {
    setFilterLevel(lv);
  };
  const wfOpenExperience = () => {
    closeWorkflow();
    setShowExperience(true);
  };
  const wfLawFilter = () => {
    setStudyMode('normal');
    setFilterSubject('法規');
    closeWorkflow();
    setTimeout(() => pickNext(), 50);
  };
  const wfApplyAbility = () => {
    setStudyMode('normal');
    setFilterSubject('施工管理法');
    closeWorkflow();
    setTimeout(() => pickNext(), 50);
  };

  // 4パターンのワークフロー定義
  const WORKFLOW_PRESETS: Record<ExamType, { n: number; icon: string; title: string; short: string; btn: string; action: () => void }[]> = {
    '2級_1次': [
      { n: 1, icon: '🗺', title: '敵を知る (2級 第一次)', short: '64問中40問解答・60%合格。試験構成を把握', btn: '2級 要点ガイド', action: () => { setFilterLevel('2級'); wfReport(); } },
      { n: 2, icon: '👀', title: '問題と答えを刷り込む', short: '答え見せ・流し見で脳に焼き付ける', btn: '眺めモード', action: () => { setFilterLevel('2級'); wfBrowse(); } },
      { n: 3, icon: '🔍', title: '出題パターン発見', short: '繰り返し問われる視点を見抜く', btn: 'パターン分析', action: () => { setFilterLevel('2級'); wfPattern(); } },
      { n: 4, icon: '🧠', title: '理解する', short: '丸暗記の上に原理を後付け', btn: '通常モード', action: () => { setFilterLevel('2級'); wfUnderstand(); } },
      { n: 5, icon: '⚡', title: '瞬殺テクを習得', short: 'キーワード→即答パターン辞典', btn: '瞬殺テク生成', action: () => { setFilterLevel('2級'); wfTricks(); } },
      { n: 6, icon: '🎯', title: '最頻出20%を完璧に', short: 'パレートで合格ラインに最短', btn: '頻出TOP30演習', action: () => { setFilterLevel('2級'); wfFrequent(); } },
      { n: 7, icon: '🔥', title: '弱点克服 (SRS)', short: '間違えた問題だけ反復', btn: '弱点モード', action: () => { setFilterLevel('2級'); wfWeak(); } },
    ],
    '1級_1次': [
      { n: 1, icon: '🗺', title: '敵を知る (1級 第一次)', short: '94問中62問解答・60%合格。試験構成を把握', btn: '1級 要点ガイド', action: () => { setFilterLevel('1級'); wfReport(); } },
      { n: 2, icon: '👀', title: '問題と答えを刷り込む', short: '答え見せ・流し見で脳に焼き付ける', btn: '眺めモード', action: () => { setFilterLevel('1級'); wfBrowse(); } },
      { n: 3, icon: '🔍', title: '出題パターン発見', short: '繰り返し問われる視点を見抜く', btn: 'パターン分析', action: () => { setFilterLevel('1級'); wfPattern(); } },
      { n: 4, icon: '🧠', title: '理解する', short: '丸暗記の上に原理を後付け', btn: '通常モード', action: () => { setFilterLevel('1級'); wfUnderstand(); } },
      { n: 5, icon: '⚡', title: '瞬殺テクを習得', short: 'キーワード→即答パターン辞典', btn: '瞬殺テク生成', action: () => { setFilterLevel('1級'); wfTricks(); } },
      { n: 6, icon: '🎯', title: '最頻出20%を完璧に', short: 'パレートで合格ラインに最短', btn: '頻出TOP30演習', action: () => { setFilterLevel('1級'); wfFrequent(); } },
      { n: 7, icon: '🔥', title: '弱点克服 (SRS)', short: '間違えた問題だけ反復', btn: '弱点モード', action: () => { setFilterLevel('1級'); wfWeak(); } },
    ],
    '2級_2次': [
      { n: 1, icon: '🗺', title: '敵を知る (2級 第二次)', short: '記述+選択。経験記述60点が合否を分ける', btn: '出題傾向を見る', action: () => { setFilterLevel('2級'); wfReport(); } },
      { n: 2, icon: '📋', title: '実務経験アンケート入力', short: '工事名・規模・立場を整理。一度入力すれば再利用', btn: '経験記述を開く', action: wfOpenExperience },
      { n: 3, icon: '✍', title: '経験記述5テーマAI生成', short: '安全/品質/工程/環境/仮設の例文を生成', btn: '5テーマ生成へ', action: wfOpenExperience },
      { n: 4, icon: '🧠', title: '記述内容を暗記・推敲', short: '本番で再現できるレベルに磨く (400字×5本)', btn: '記述を見返す', action: wfOpenExperience },
      { n: 5, icon: '⚡', title: '施工管理法 応用能力対策', short: '施工要領・配電計算・図面読み取り (足切り注意)', btn: '応用能力フィルタ', action: wfApplyAbility },
      { n: 6, icon: '⚖', title: '法規記述対策', short: '電気事業法・工事士法・建設業法の暗記', btn: '法規フィルタで演習', action: wfLawFilter },
      { n: 7, icon: '🎯', title: '直前模擬・記述書き写し', short: '生成した5記述を手書きで書き写して定着', btn: '経験記述を再表示', action: wfOpenExperience },
    ],
    '1級_2次': [
      { n: 1, icon: '🗺', title: '敵を知る (1級 第二次)', short: '記述+選択+応用。経験記述+施工管理法応用能力', btn: '出題傾向を見る', action: () => { setFilterLevel('1級'); wfReport(); } },
      { n: 2, icon: '📋', title: '実務経験アンケート入力', short: '監理技術者・元請レベルの工事経験を記入', btn: '経験記述を開く', action: wfOpenExperience },
      { n: 3, icon: '✍', title: '経験記述5テーマAI生成', short: '1級は深い技術内容と数字が求められる', btn: '5テーマ生成へ', action: wfOpenExperience },
      { n: 4, icon: '🧠', title: '記述内容を暗記・推敲', short: '採点者が認める具体性で本番再現 (400字×5本)', btn: '記述を見返す', action: wfOpenExperience },
      { n: 5, icon: '⚡', title: '施工管理法 応用能力対策', short: '12問必須・50%足切り。最重点ポイント', btn: '応用能力フィルタ', action: wfApplyAbility },
      { n: 6, icon: '⚖', title: '法規・関連法令対策', short: '電気事業法・工事士法・建設業法の応用記述', btn: '法規フィルタで演習', action: wfLawFilter },
      { n: 7, icon: '🎯', title: '直前模擬・記述書き写し', short: '5記述を手書きで定着、応用問題と並行で仕上げ', btn: '経験記述を再表示', action: wfOpenExperience },
    ],
  };
  const WORKFLOW_STEPS = WORKFLOW_PRESETS[examType];

  if (showExperience) {
    const EXP_THEMES = ['安全管理', '品質管理', '工程管理', '環境保全', '仮設計画'];
    const SURVEY_FIELDS: { key: keyof typeof experienceSurvey; label: string; placeholder: string; multiline?: boolean }[] = [
      { key: 'projectName', label: '工事名', placeholder: '例: ○○ビル新築工事における電気設備工事' },
      { key: 'location', label: '工事場所', placeholder: '例: 東京都千代田区○○1丁目' },
      { key: 'client', label: '発注者', placeholder: '例: ○○株式会社' },
      { key: 'startDate', label: '工期 開始', placeholder: '例: 2023年4月' },
      { key: 'endDate', label: '工期 終了', placeholder: '例: 2024年3月' },
      { key: 'budget', label: '施工金額', placeholder: '例: 1億2,000万円 (電気工事分)' },
      { key: 'buildingType', label: '建物用途・規模', placeholder: '例: 事務所ビル, 地上10階建, 延床5,000㎡' },
      { key: 'overview', label: '電気設備の概要 (主な工事内容)', placeholder: '例: 受変電設備(キュービクル500kVA), 動力設備, 照明設備(LED), 弱電設備', multiline: true },
      { key: 'role', label: 'あなたの立場', placeholder: '例: 現場代理人 / 主任技術者 / 元請社員 / 下請社員' },
      { key: 'specialPoints', label: '特に苦労した点・特記事項', placeholder: '例: 既存ビル稼働中の改修, 工期短縮要求, 雪国の冬季施工 など', multiline: true },
      { key: 'mySkills', label: 'あなたの強み・得意 (任意)', placeholder: '例: 工程管理が得意, 安全管理者経験あり', multiline: true },
    ];

    return (
      <div className="h-screen bg-gradient-to-br from-purple-50 to-pink-50 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-purple-900">📝 第二次検定 経験記述ジェネレーター</h1>
              <p className="text-sm text-slate-600">あなたの実務経験を入力 → テーマ別にAIが採点高評価の記述例を生成</p>
            </div>
            <button
              onClick={() => setShowExperience(false)}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded font-bold text-sm"
            >
              閉じる →
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 左: 実務経験アンケート */}
            <section className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-bold text-purple-800 mb-3">📋 実務経験アンケート</h2>
              <p className="text-xs text-slate-600 mb-3">
                すべて任意入力。入力した情報を元にAIが記述例を作成。<strong>localStorage に保存</strong>されるので毎回入力不要。
              </p>
              <div className="space-y-2">
                {SURVEY_FIELDS.map((f) => (
                  <div key={String(f.key)}>
                    <label className="text-xs font-bold text-slate-700">{f.label}</label>
                    {f.multiline ? (
                      <textarea
                        value={experienceSurvey[f.key]}
                        onChange={(e) => setExperienceSurvey((s) => ({ ...s, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        rows={2}
                        className="mt-0.5 w-full px-2 py-1.5 border border-slate-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    ) : (
                      <input
                        type="text"
                        value={experienceSurvey[f.key]}
                        onChange={(e) => setExperienceSurvey((s) => ({ ...s, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="mt-0.5 w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs bg-yellow-50 border-l-4 border-yellow-400 p-2">
                💡 試験本番では「実際にあなたが従事した工事」を書く必要があります。架空の工事は使えません。
                入力した情報を元に、AIが採点者ウケする<strong>文体・構成</strong>で書き上げます。
              </div>
            </section>

            {/* 右: テーマ別記述例生成 */}
            <section className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-bold text-purple-800 mb-3">✍ テーマ別 記述例 (AI生成)</h2>
              <p className="text-xs text-slate-600 mb-3">
                第二次検定では下記5テーマのうち1つが指定されます。それぞれ生成して比較しましょう。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                {EXP_THEMES.map((t) => {
                  const isLoading = experienceLoading === t;
                  const hasOutput = experienceOutputs[t]?.length > 0;
                  return (
                    <button
                      key={t}
                      onClick={() => generateExperience(t)}
                      disabled={!!experienceLoading || !experienceSurvey.projectName}
                      className={`px-3 py-2 rounded font-bold text-sm shadow transition ${
                        hasOutput ? 'bg-emerald-600 hover:bg-emerald-700 text-white' :
                        isLoading ? 'bg-amber-500 text-white' :
                        'bg-purple-600 hover:bg-purple-700 text-white'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {isLoading ? '⏳ 生成中…' : hasOutput ? `✅ ${t} (再生成)` : `🤖 ${t} を生成`}
                    </button>
                  );
                })}
              </div>
              {!experienceSurvey.projectName && (
                <div className="text-xs text-rose-700 bg-rose-50 border-l-4 border-rose-400 p-2 mb-3">
                  ⚠ まず左の「工事名」を入力してください (最低限の必須項目)
                </div>
              )}
              <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto">
                {EXP_THEMES.map((t) => {
                  const out = experienceOutputs[t];
                  if (!out) return null;
                  return (
                    <div key={t} className="border-l-4 border-purple-400 bg-purple-50 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-purple-900">📝 {t}</h3>
                        <div className="flex gap-1">
                          <button
                            onClick={() => navigator.clipboard.writeText(out)}
                            className="text-xs px-2 py-0.5 bg-white hover:bg-slate-100 border rounded"
                            title="クリップボードにコピー"
                          >
                            📋 コピー
                          </button>
                          <button
                            onClick={() => setExperienceOutputs((o) => { const n = { ...o }; delete n[t]; return n; })}
                            className="text-xs px-2 py-0.5 bg-white hover:bg-red-50 border rounded text-red-600"
                          >
                            🗑 削除
                          </button>
                        </div>
                      </div>
                      <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">{out}</pre>
                    </div>
                  );
                })}
                {Object.keys(experienceOutputs).length === 0 && (
                  <div className="text-center text-slate-400 text-sm py-8">
                    まだ生成されていません。<br />左のアンケートを入力後、上のテーマボタンを押してください。
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  if (showWorkflow) {
    return (
      <div className="min-h-screen w-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col lg:h-screen lg:overflow-hidden">
        {/* ヘッダー (固定) */}
        <header className="bg-gradient-to-r from-blue-800 to-cyan-600 text-white px-8 py-4 shadow-lg flex items-center justify-between flex-shrink-0">
          <div className="flex-1">
            <h1 className="text-2xl font-black tracking-tight">⚡ 電気工事施工管理技士 — 合格ロードマップ</h1>
            {/* 4パターン切替 (1級/2級 × 1次/2次) */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs opacity-80">対象:</span>
              {([
                { v: '2級_1次', label: '2級 第一次', desc: '四肢択一64問' },
                { v: '2級_2次', label: '2級 第二次', desc: '記述+選択' },
                { v: '1級_1次', label: '1級 第一次', desc: '四肢択一94問' },
                { v: '1級_2次', label: '1級 第二次', desc: '記述+応用' },
              ] as { v: ExamType; label: string; desc: string }[]).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setExamType(opt.v)}
                  className={`px-3 py-1 rounded text-xs font-bold transition ${
                    examType === opt.v
                      ? 'bg-yellow-400 text-yellow-900 shadow-lg ring-2 ring-yellow-200'
                      : 'bg-white/15 hover:bg-white/25 text-white'
                  }`}
                  title={opt.desc}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs opacity-90 mt-2">
              「<strong className="bg-yellow-300 text-yellow-900 px-1.5 rounded">丸暗記してから理解する</strong>」順序が最短。各STEPのボタンで該当モード起動。
            </p>
          </div>
          <div className="flex items-center gap-4">
            {(['1級', '2級'] as const).map((lvl) => {
              const d = examDates[lvl];
              const days = d ? (() => {
                const t = new Date(d + 'T00:00:00');
                const today = new Date(); today.setHours(0, 0, 0, 0);
                return Math.floor((t.getTime() - today.getTime()) / 86400000);
              })() : null;
              return (
                <div key={lvl} className="text-right bg-white/15 px-3 py-1.5 rounded-lg backdrop-blur">
                  <div className="text-[10px] opacity-80">📅 {lvl}試験日まで</div>
                  <div className={`text-xl font-black ${days !== null && days < 30 ? 'text-yellow-300' : days !== null && days < 90 ? 'text-orange-200' : ''}`}>
                    {days !== null && days >= 0 ? `残 ${days} 日` : d ? `${-(days ?? 0)}日経過` : '未公表'}
                  </div>
                </div>
              );
            })}
            <button
              onClick={closeWorkflow}
              className="px-5 py-3 bg-yellow-400 hover:bg-yellow-300 text-yellow-900 rounded-lg font-bold shadow-lg text-base"
            >
              アプリを開く →
            </button>
          </div>
        </header>

        {/* このロードマップの根拠 (折りたたみ可) */}
        <details open className="bg-blue-50 border-b border-blue-200 flex-shrink-0">
          <summary className="cursor-pointer px-6 py-2 hover:bg-blue-100 transition flex items-center gap-2">
            <span className="text-sm font-bold text-blue-900">🤔 なぜこのロードマップで合格できるのか</span>
            <span className="text-xs text-blue-600">(クリックで展開/折りたたみ)</span>
          </summary>
          <div className="px-6 pb-3 max-w-[1400px] mx-auto">
            <p className="text-xs text-slate-700 mb-2">
              合格 = <strong>60%得点</strong>。満点不要。「全範囲を完璧に」ではなく「合格圏に最短で乗せる」のが正解。
              本ロードマップは <strong>学習科学・パレートの法則・過去問再出題分析</strong> の3つの原則で設計。
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
              <div className="bg-white rounded p-2 border-l-4 border-orange-400">
                <div className="font-bold text-orange-700 mb-0.5">① 丸暗記 → 理解 の順序</div>
                <div className="text-slate-600">脳は知らない事象を理解しようとすると挫折する。先に答えを焼き付け、後から原理を肉付けすると定着率が高い (英単語と文法の関係と同じ)</div>
              </div>
              <div className="bg-white rounded p-2 border-l-4 border-rose-400">
                <div className="font-bold text-rose-700 mb-0.5">② パレートの法則</div>
                <div className="text-slate-600">頻出20%のテーマで全問題の<strong>60-70%</strong>をカバーできる。合格基準60%なので、頻出だけ完璧にすれば残りを捨てても合格</div>
              </div>
              <div className="bg-white rounded p-2 border-l-4 border-emerald-400">
                <div className="font-bold text-emerald-700 mb-0.5">③ 過去問再出題率 40%+</div>
                <div className="text-slate-600">本ツール分析: 過去問の<strong>40-65%</strong>が「同じ・ほぼ同じ」再出題。新規対策より過去問演習が圧倒的に効率的</div>
              </div>
              <div className="bg-white rounded p-2 border-l-4 border-blue-400">
                <div className="font-bold text-blue-700 mb-0.5">④ SRS (間隔反復学習)</div>
                <div className="text-slate-600">Anki式の科学的暗記法。間違えた問題だけ反復し忘却曲線に逆らう。学習時間を<strong>1/3-1/5に圧縮</strong>できる</div>
              </div>
              <div className="bg-white rounded p-2 border-l-4 border-violet-400">
                <div className="font-bold text-violet-700 mb-0.5">⑤ 試験構造を理解</div>
                <div className="text-slate-600">選択問題は強み科目から多く取る。必須問題は捨てられない。応用能力問題は<strong>50%足切り</strong>あり。配点を理解して戦略的に</div>
              </div>
            </div>
            <p className="text-[11px] text-emerald-700 font-bold mt-2 text-center">
              この5原則に沿って7ステップを順番にこなせば、最小努力で合格圏に到達できます。
            </p>
          </div>
        </details>

        {/* プロフィールに基づく推奨学習順序 */}
        <div className="bg-white border-b border-slate-200 px-6 py-2 flex-shrink-0">
          <div className="max-w-[1400px] mx-auto flex items-center gap-3">
            <span className="text-xs font-bold text-slate-700 flex-shrink-0">📋 あなた向け推奨順序:</span>
            {recommendedOrder.map((r, i) => (
              <div key={r.subject} className={`flex items-center gap-1.5 px-2 py-1 rounded border ${SKILL_COLOR[r.skill]}`}>
                <span className="text-[10px] font-black">{i + 1}.</span>
                <span className="text-xs font-bold">{r.subject}</span>
                <span className="text-[9px] opacity-70">{r.skill === 'weak' ? '⚠' : r.skill === 'strong' ? '💪' : '⚖'}</span>
              </div>
            ))}
            <button
              onClick={() => setShowProfile(true)}
              className="ml-auto text-xs px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded font-bold flex-shrink-0"
              title="プロフィール設定 (大学で電気習った等の自己評価を反映)"
            >
              ⚙ プロフィール変更
            </button>
          </div>
        </div>

        {/* メインコンテンツ — 1画面に収まる 1列レイアウト */}
        <main className="flex-1 flex flex-col p-4 overflow-hidden">
          <div className="flex-1 flex flex-col gap-2 max-w-[1400px] mx-auto w-full">
            {WORKFLOW_STEPS.map((s) => (
              <button
                key={s.n}
                onClick={s.action}
                className="bg-white border-2 border-slate-200 rounded-lg px-5 py-3 hover:border-blue-500 hover:bg-blue-50 hover:shadow-md transition-all relative overflow-hidden flex items-center gap-4 text-left group flex-1 min-h-0"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center text-3xl shadow">
                  {s.icon}
                </div>
                <div className="flex-shrink-0 text-[10px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded">STEP {s.n}</div>
                <div className="flex-1 min-w-0 relative">
                  <h3 className="text-lg font-bold text-slate-800 leading-tight">{s.title}</h3>
                  <p className="text-xs text-slate-600 leading-tight">{s.short}</p>
                </div>
                <div className="flex-shrink-0 px-4 py-2 bg-blue-700 group-hover:bg-blue-800 text-white rounded font-bold text-sm shadow">
                  {s.btn} →
                </div>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (showReport) {
    const rate = stats.total ? Math.round(stats.correct / stats.total * 100) : 0;
    // 合格判定: 全体60%以上 かつ 全科目55%以上 (1次検定の概ねの基準)
    const PASS_OVERALL = 60;
    const PASS_PER_SUBJ = 55;
    const subjEntries = Object.entries(subjStats).sort((a, b) => b[1].total - a[1].total);
    const subjRates = subjEntries.map(([s, v]) => ({ s, total: v.total, correct: v.correct, rate: v.total ? Math.round(v.correct / v.total * 100) : 0 }));
    const weakSubjects = subjRates.filter((x) => x.total >= 3 && x.rate < PASS_PER_SUBJ);
    const okSubjects = subjRates.filter((x) => x.total >= 3 && x.rate >= PASS_PER_SUBJ);
    const overallOk = rate >= PASS_OVERALL;
    const subjOk = subjRates.length === 0 || weakSubjects.length === 0;
    // 合格確率の単純推定: 全体正答率を 0-100% にマップ
    let passProb = 0;
    if (stats.total >= 5) {
      const baseFromRate = Math.max(0, Math.min(100, (rate - 40) * 2.5)); // 40%→0, 80%→100
      const weakPenalty = weakSubjects.length * 10;
      passProb = Math.max(0, Math.min(99, Math.round(baseFromRate - weakPenalty)));
    }
    const passColor = passProb >= 70 ? 'emerald' : passProb >= 40 ? 'amber' : 'red';
    const askPassAdvice = () => {
      const subjLines = subjRates.map((x) => `${x.s}: ${x.correct}/${x.total} (${x.rate}%)`).join('\n');
      const profileLines = SUBJECTS_ORDER.map((s) => `${s}: ${profile[s] === 'strong' ? '💪 強み (ほぼ無勉強OK)' : profile[s] === 'weak' ? '⚠ 苦手 (重点)' : '⚖ 普通'}`).join('\n');
      setShowReport(false);
      setTimeout(() => {
        chatRef.current?.sendMessage(
          `合格までの **最短ルート個別アドバイス** をお願いします。受験生の状況を踏まえた具体的な行動計画が欲しい。

## 受験生の現状

【全体演習実績】 ${stats.total}問 / ${stats.correct}正解 / ${stats.wrong}不正解 (正答率 ${rate}%)

【科目別正答率】
${subjLines || 'まだデータがありません'}

【受験生の自己評価バックグラウンド】
${profileLines}

【試験日】 ${examDate || '未設定'}

## 合格基準
- 1級: 全体60%(36/60問)以上 + 応用能力(No.71-82)50%以上必須
- 2級: 全体60%(24/40問)以上、足切り無し

## 必須プロセス (順番に分析)

### ステップ1: 合格圏との距離計算
現在の正答率と合格基準を比較し、各科目で **何問足りないか** を具体的に数字で示す。
例: 「電気理論 5/10問 (50%) → 合格圏 (60%)まで1問必要。10問中6問正解できる状態にする必要あり」

### ステップ2: 学習投資の優先順位付け (ROI重視)
- 💪強み → ほぼ学習不要、現状維持で十分か検証
- ⚖普通 → 過去問演習で +10%上げる余地
- ⚠苦手 → 重点投資すべきか or 切り捨てるか

「**苦手を伸ばす vs 普通を強化する**」のどちらが合格に近いか定量的に判断する (科目配分から逆算)。

### ステップ3: 残り日数の時間配分
試験日まで残り○日 → ○時間/日 確保 → ○問/日 演習可能 → 何科目を何問ずつ回せるか具体的に。

### ステップ4: 科目別の具体的取り組み
各科目について:
- 取り組むべき頻出テーマ (このサイトで頻出度フィルタを使うとよい)
- 丸暗記/理解必須/公式一発 の比率
- このテーマだけはやれ、というTop3

### ステップ5: 1日のサンプル学習プラン
朝/昼/夜の時間配分、何問ずつどの科目を回すか、復習ループの間隔。

## 出力フォーマット
**📊 合格圏との距離 (数字で)**
**🎯 学習投資の優先度 (ROI順)**
**📅 残り日数の時間配分**
**📚 科目別やること (具体的にテーマ列挙)**
**🗓 1日の学習プラン例**
**⚠ 最大リスク要因** (この受験生にとって一番危険な点)

抽象論禁止。「電気理論を重点的に」みたいな漠然としたアドバイスは無価値。
「電気理論の中性点接地・絶縁抵抗・三相回路の3テーマを優先、過去5年分の問題演習を1日10問×5日で完了させる」レベルの具体性で。`,
        );
      }, 100);
    };
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold text-blue-800 border-b-4 border-blue-800 pb-2 mb-4">📊 成績・合格判定レポート</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-blue-50 p-4 rounded text-center"><div className="text-2xl font-bold text-blue-800">{stats.total}</div><div className="text-xs">回答</div></div>
            <div className="bg-emerald-100 p-4 rounded text-center"><div className="text-2xl font-bold text-emerald-800">{stats.correct}</div><div className="text-xs">○ 正解</div></div>
            <div className="bg-red-100 p-4 rounded text-center"><div className="text-2xl font-bold text-red-800">{stats.wrong}</div><div className="text-xs">× 不正解</div></div>
            <div className="bg-slate-100 p-4 rounded text-center"><div className="text-2xl font-bold text-slate-700">{stats.skipped}</div><div className="text-xs">スキップ</div></div>
            <div className="bg-amber-100 p-4 rounded text-center"><div className="text-2xl font-bold text-amber-800">{rate}%</div><div className="text-xs">正答率</div></div>
          </div>

          {/* 合格判定パネル */}
          <div className={`p-5 rounded-lg border-2 mb-6 ${passProb >= 70 ? 'border-emerald-500 bg-emerald-50' : passProb >= 40 ? 'border-amber-500 bg-amber-50' : 'border-red-500 bg-red-50'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-lg font-bold text-${passColor}-800`}>📊 合格判定</h3>
              <div className={`text-3xl font-bold text-${passColor}-700`}>{stats.total >= 5 ? `${passProb}%` : '— %'}</div>
            </div>
            <p className="text-sm text-slate-700 mb-2">
              {stats.total < 5 ? '⚠ 判定にはあと数問の演習データが必要です (最低5問)' :
                overallOk && subjOk ? '✅ 現状ペースなら合格圏内。引き続き弱点を潰しましょう' :
                !overallOk ? `⚠ 全体正答率 ${rate}% (合格ライン ${PASS_OVERALL}%)。${PASS_OVERALL - rate}pt 上積みが必要` :
                `⚠ 全体OKだが弱点科目あり (${weakSubjects.map((x) => x.s).join('・')})`
              }
            </p>
            {subjRates.length > 0 && (
              <div className="mt-3 space-y-2">
                {subjRates.map((x) => (
                  <div key={x.s}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="font-semibold">{x.s}</span>
                      <span>{x.correct}/{x.total} = <strong>{x.rate}%</strong> {x.rate >= PASS_PER_SUBJ ? '✓' : x.total >= 3 ? '✗弱点' : ''}</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded overflow-hidden">
                      <div
                        className={`h-full ${x.rate >= PASS_PER_SUBJ ? 'bg-emerald-500' : 'bg-red-500'}`}
                        style={{ width: `${x.rate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
              <button
                onClick={askPassAdvice}
                disabled={stats.total < 5}
                className="px-4 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white rounded font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-700 hover:to-fuchsia-700"
              >
                🤖 AIに合格戦略を相談 (重点科目助言)
              </button>
              <button
                onClick={() => {
                  // 上位30テーマを抽出して AI に「次回出題予測」を依頼
                  const topThemes = [...themeRanks.entries()]
                    .sort((a, b) => a[1] - b[1])
                    .slice(0, 30)
                    .map(([t, r]) => `#${r} ${t}`)
                    .join(', ');
                  const examInfoStr = examDate ? `${examDate} (残${examInfo.days}日)` : '試験日未公表';
                  setShowReport(false);
                  setTimeout(() => {
                    chatRef.current?.sendMessage(
                      `次回試験での出題予測を **データドリブン+トレンド読み** で作成してください。受験戦略の核となる予測です。

## 入力データ
【試験日】 ${examInfoStr}
【受験級】 ${filterLevel || '2級 (デフォルト)'}
【現在の弱点科目】 ${weakSubjects.map((x) => x.s).join('・') || 'なし'}
【過去出題上位30テーマ (出題頻度順、context として)】
${topThemes}

## 必須プロセス

### ステップ1: 「ほぼ確実に出題されるテーマ」 (毎年出題、ROI最大)
出題頻度ベースで、過去5年中4-5年で出題されている定番テーマを抽出。これだけで合格点の50%程度をカバーできるはず。

### ステップ2: 「周期的再出題」テーマ
「2-3年に1回」の周期で出題される論点を抽出。前回が○年なら、今回出題確率が高い、というロジックで。

### ステップ3: 法改正/技術トレンドに基づく新規テーマ予想
- 直近の法令改正 (建設業法改正、電気事業法改正、JIS規格改訂)
- 業界トレンド (太陽光発電、蓄電池、EV充電、データセンター、再エネ)
- これらに関連する **過去問にはあまり出ていないが今後出そうな新規テーマ**

### ステップ4: 受験生の弱点との掛け合わせ
弱点科目 (${weakSubjects.map((x) => x.s).join('・') || 'なし'}) の中で、上記Top出題テーマと重なるものは **最優先で対策必要** と判定。

### ステップ5: 残り時間からの "やるべきこと" 確定
試験まで○日。1日に学習可能な時間と問題数を想定し、優先テーマを何問ずつ回せばいいか具体化。

## 出力フォーマット

**🎯 次回試験 出題予測 Top 15 (確率順)**
各テーマに以下を必ず付ける:
- 順位 / テーマ名
- 出題確率 (高/中/低)
- 根拠 (過去○年中×年出題、前回が△年だから周期で今年来る、等)
- 想定される問われ方 (計算/法令/JIS/組合せ等)
- 学習投資レベル (HIGH/MID/LOW)

**🔁 「毎年必出」 と言えるテーマ** (5個)
過去5年連続出題のもの。これを落とすと致命的。

**📅 「周期的に来る年」 が今回該当するテーマ** (5個)
前回出題年と再出題周期を明示。

**🆕 法改正/技術トレンド由来の新規予想テーマ** (3個)
具体的な改正条文/業界動向と紐づけて。

**⚠ 受験生の弱点と被るテーマ** (= 緊急対策必要)
弱点科目の中から、出題確率高めのテーマを抽出。

**🗓 残り${examInfo.days || '?'}日でやれ。優先順位 Top 10**
「テーマ名 → 何時間/何問演習」で具体的に。

**📊 ボーナス: 出題されたら捨ててもよいテーマ** (3個)
学習コスト高、出題頻度低、捨て問でOKなテーマ。受験生の時間節約に。

予測には不確実性が伴うので「※予測」と明示。ただし根拠 (過去問の頻度や年度) は具体的に書く。`,
                    );
                  }, 100);
                }}
                disabled={stats.total < 5}
                className="px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed hover:from-emerald-700 hover:to-teal-700"
              >
                🔮 次回試験の出題予測 (AI)
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setShowReport(false); next(); }} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">▶ 演習を続ける</button>
            <button onClick={() => { resetStats(); setShowReport(false); }} className="px-4 py-2 bg-amber-500 text-white rounded font-bold">🔄 統計リセットして新セッション</button>
          </div>
        </div>
      </div>
    );
  }

  const isRight = current && current.correct_answer && selected !== null && (selected + 1) === current.correct_answer;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:h-screen lg:overflow-hidden">
      <header className="bg-gradient-to-r from-blue-800 to-cyan-600 text-white px-6 py-2 shadow flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold leading-tight">⚡ 電気工事施工管理技士 過去問演習</h1>
          <p className="text-[10px] opacity-80">1級・2級 第1次検定 / Bedrock Claude AI解説</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWorkflow(true)}
            className="bg-yellow-400 hover:bg-yellow-300 text-yellow-900 px-3 py-1.5 rounded font-bold text-xs shadow"
            title="最小努力で合格するための7ステップ・ロードマップ"
          >
            🗺 合格ロードマップ
          </button>
          <button
            onClick={() => setShowProfile(true)}
            className="bg-emerald-400 hover:bg-emerald-300 text-emerald-900 px-3 py-1.5 rounded font-bold text-xs shadow"
            title="あなたのバックグラウンド (大学で電気習った等) に基づく科目別の優先度を設定"
          >
            📋 学習プロフィール
          </button>
          <button
            onClick={() => setShowExperience(true)}
            className="bg-pink-400 hover:bg-pink-300 text-pink-900 px-3 py-1.5 rounded font-bold text-xs shadow"
            title="第二次検定 経験記述ジェネレーター: 実務経験を入力するとAIが採点高評価の記述例を生成"
          >
            📝 経験記述 (第2次)
          </button>
          <div className="flex items-center gap-1 bg-white/10 rounded px-2 py-1">
            <span className="text-[10px] opacity-80">📊 1次ガイド</span>
            <a href="/api/report/施工管理1級_簡易版.html" target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-yellow-200 hover:text-yellow-900 px-2 py-0.5 rounded font-bold text-xs" title="1級 第一次検定の要点ガイド">1級</a>
            <a href="/api/report/施工管理2級_簡易版.html" target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-yellow-200 hover:text-yellow-900 px-2 py-0.5 rounded font-bold text-xs" title="2級 第一次検定の要点ガイド">2級</a>
          </div>
          <div className="flex items-center gap-1 bg-white/10 rounded px-2 py-1">
            <span className="text-[10px] opacity-80">📝 2次ガイド</span>
            <a href="/api/report/施工管理1級_2次_簡易版.html" target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-pink-200 hover:text-pink-900 px-2 py-0.5 rounded font-bold text-xs" title="1級 第二次検定の要点ガイド (経験記述中心)">1級</a>
            <a href="/api/report/施工管理2級_2次_簡易版.html" target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-pink-200 hover:text-pink-900 px-2 py-0.5 rounded font-bold text-xs" title="2級 第二次検定の要点ガイド (経験記述中心)">2級</a>
          </div>
          <div className="flex items-center gap-1 bg-white/10 rounded px-2 py-1">
            <span className="text-[10px] opacity-80">🔬 詳細版</span>
            <a href="/api/report/施工管理1級_出題傾向_徹底分析/index.html" target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-white/40 px-2 py-0.5 rounded font-bold text-xs" title="1級の徹底分析レポート">1級</a>
            <a href="/api/report/施工管理2級_出題傾向_徹底分析/index.html" target="_blank" rel="noopener noreferrer" className="bg-white/20 hover:bg-white/40 px-2 py-0.5 rounded font-bold text-xs" title="2級の徹底分析レポート">2級</a>
          </div>
        </div>
      </header>

      {/* ダッシュボードストリップ: 試験日 / 学習モード / 今日のノルマ / 統計 (折りたたみ可) */}
      <div className="bg-white border-b border-slate-200 px-4 py-1.5 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => setDashboardCollapsed((v) => !v)}
            className="text-xs text-slate-600 hover:text-slate-900 font-bold flex items-center gap-1"
            title={dashboardCollapsed ? '展開' : '折りたたみ'}
          >
            <span className="text-slate-400">{dashboardCollapsed ? '▶' : '▼'}</span>
            📊 ダッシュボード
            {dashboardCollapsed && (
              <span className="ml-2 font-normal text-slate-500 text-[11px]">
                試験日 {examDates['1級'] ? (() => {
                  const t = new Date(examDates['1級'] + 'T00:00:00');
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const d = Math.floor((t.getTime() - today.getTime()) / 86400000);
                  return `1級残${d >= 0 ? d : '?'}日 / `;
                })() : ''}
                {examDates['2級'] ? (() => {
                  const t = new Date(examDates['2級'] + 'T00:00:00');
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const d = Math.floor((t.getTime() - today.getTime()) / 86400000);
                  return `2級残${d >= 0 ? d : '?'}日`;
                })() : ''}
                {' / 🎯 '}{studyMode === 'browse' ? '👀眺め' : studyMode === 'weak' ? '🔥弱点' : studyMode === 'bookmark' ? '⭐ブックマーク' : '通常'}
                {' / 📊 '}{stats.correct}/{stats.total} ({stats.total ? Math.round(stats.correct / stats.total * 100) : 0}%)
              </span>
            )}
          </button>
        </div>
        {!dashboardCollapsed && (
        <div className="flex flex-wrap items-stretch gap-2 text-xs">
          {/* 試験日カウントダウン: 1級 + 2級 両方表示 (active な級をハイライト) */}
          {(['1級', '2級'] as const).map((lvl) => {
            const d = examDates[lvl];
            const src = examDateSources[lvl];
            const sch = examSchedule[lvl];
            const isActive = lvl === activeLevel;
            const days = d ? (() => {
              const t = new Date(d + 'T00:00:00');
              const today = new Date(); today.setHours(0, 0, 0, 0);
              return Math.floor((t.getTime() - today.getTime()) / 86400000);
            })() : null;
            // 申込期間の状態
            const applyState = sch && sch.applyStart && sch.applyEnd ? (() => {
              const today = new Date().toISOString().slice(0, 10);
              if (today < sch.applyStart) return { label: `📝 申込: ${sch.applyStart}〜${sch.applyEnd}`, color: 'text-slate-600' };
              if (today <= sch.applyEnd) return { label: `🟢 申込中: ${sch.applyEnd}まで`, color: 'text-emerald-700 font-bold' };
              return { label: `✅ 申込終了 (${sch.applyStart}〜${sch.applyEnd})`, color: 'text-slate-500' };
            })() : null;
            return (
              <div
                key={lvl}
                className={`flex flex-col bg-gradient-to-br from-rose-50 to-orange-50 border rounded-lg px-3 py-2 min-w-[220px] ${
                  isActive ? 'border-rose-500 ring-2 ring-rose-300' : 'border-rose-200 opacity-80'
                }`}
              >
                <div className="flex items-center gap-1 text-rose-700 font-bold text-[11px] mb-1" title={sch?.examName || ''}>
                  📅 {sch?.examName || `${lvl}試験日`}
                  {examDateFetching[lvl] && <span className="opacity-60 font-normal">取得中…</span>}
                  {!examDateFetching[lvl] && src === 'auto' && d && (
                    <span className="opacity-60 font-normal text-[9px] px-1 bg-emerald-200 rounded" title="公式サイト (fcip-shiken.jp) から自動取得">✓ 公式</span>
                  )}
                  {!examDateFetching[lvl] && src === 'fallback' && (
                    <span className="opacity-80 font-normal text-[9px] px-1 bg-yellow-200 rounded text-yellow-900" title={`公式取得失敗のため例年実施日から推定。debug: ${examDateDebug[lvl]}`}>⚠ 推定</span>
                  )}
                  {src === 'manual' && (
                    <span className="opacity-60 font-normal text-[9px] px-1 bg-amber-200 rounded">手動</span>
                  )}
                </div>
                {d ? (
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-black ${days !== null && days < 30 ? 'text-red-600' : days !== null && days < 90 ? 'text-orange-600' : 'text-rose-700'}`}>
                      {days !== null && days >= 0 ? days : '?'}
                    </span>
                    <span className="text-rose-700 font-bold">日</span>
                    <input
                      type="date"
                      value={d}
                      onChange={(e) => {
                        setExamDates((dd) => ({ ...dd, [lvl]: e.target.value }));
                        setExamDateSources((s) => ({ ...s, [lvl]: 'manual' }));
                      }}
                      className="ml-auto bg-white border border-rose-200 px-1 py-0.5 rounded text-rose-700 text-[10px]"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-bold">未公表</span>
                    <input
                      type="date"
                      value=""
                      onChange={(e) => {
                        setExamDates((dd) => ({ ...dd, [lvl]: e.target.value }));
                        setExamDateSources((s) => ({ ...s, [lvl]: 'manual' }));
                      }}
                      className="ml-auto bg-white border border-rose-200 px-1 py-0.5 rounded text-rose-700 text-[10px]"
                    />
                  </div>
                )}
                {/* 受付期間 + 合格発表 */}
                {sch && (
                  <div className="mt-1 space-y-0.5 text-[10px]">
                    {applyState && (
                      <div className={applyState.color} title={`受付期間: ${sch.applyStart} 〜 ${sch.applyEnd}`}>{applyState.label}</div>
                    )}
                    {sch.resultDate && (
                      <div className="text-slate-600" title="合格発表日">📢 合格発表: {sch.resultDate}</div>
                    )}
                    {sch.note && (
                      <div className="text-slate-500 text-[9px] italic">※ {sch.note}</div>
                    )}
                  </div>
                )}
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => fetchExamDate(lvl)}
                    className="text-[10px] text-rose-700 hover:bg-rose-100 px-1.5 py-0.5 rounded"
                    title={`ネットから再取得: ${examDateDebug[lvl] || '(未試行)'}`}
                  >
                    🔄 再取得
                  </button>
                  {src === 'manual' && (
                    <button
                      onClick={() => {
                        setExamDateSources((s) => ({ ...s, [lvl]: 'auto' }));
                        fetchExamDate(lvl);
                      }}
                      className="text-[10px] text-rose-700 hover:bg-rose-100 px-1.5 py-0.5 rounded"
                    >
                      自動に戻す
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* 学習モード */}
          <div className="flex flex-col bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg px-3 py-2 min-w-[180px]">
            <div className="flex items-center gap-1 text-indigo-700 font-bold text-[11px] mb-1">
              🎯 学習モード
            </div>
            <select
              value={studyMode}
              onChange={(e) => setStudyMode(e.target.value as 'normal' | 'weak' | 'bookmark' | 'browse')}
              className="bg-white border border-indigo-200 text-indigo-900 text-xs px-2 py-1 rounded font-semibold"
            >
              <option value="browse">👀 眺めモード (答え見せ・刷り込み)</option>
              <option value="normal">📝 通常テスト (全問題)</option>
              <option value="weak">🔥 弱点克服 ({wrongIds.size}問)</option>
              <option value="bookmark">⭐ ブックマーク ({bookmarkIds.size}問)</option>
            </select>
            <div className="text-[10px] text-indigo-600 mt-1">
              {studyMode === 'browse' && `答えを見ながら流し見 (Space/→で次、←で前)`}
              {studyMode === 'weak' && `間違えた問題だけ出題 (正解で除外)`}
              {studyMode === 'bookmark' && `お気に入りだけ出題`}
              {studyMode === 'normal' && `テスト形式 (全プール ${poolTotal}問)`}
            </div>
          </div>

          {/* 今日のノルマ */}
          {examInfo.days !== null && examInfo.days > 0 && (
            <div className="flex flex-col bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-lg px-3 py-2 min-w-[170px]">
              <div className="flex items-center gap-1 text-emerald-700 font-bold text-[11px] mb-1">
                📈 今日のノルマ
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-emerald-700">{examInfo.todayCount}</span>
                <span className="text-sm text-emerald-700">/ {examInfo.dailyTarget}問</span>
                {examInfo.todayCount >= examInfo.dailyTarget && examInfo.dailyTarget > 0 && (
                  <span className="ml-1 text-xs">✅</span>
                )}
              </div>
              <div className="text-[10px] text-emerald-600">{examInfo.pace}</div>
            </div>
          )}

          {/* プロフィール: 強み除外トグル (常時可視で個別最適化を示す) */}
          <div className="flex flex-col bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-300 rounded-lg px-3 py-2 min-w-[200px]">
            <div className="flex items-center gap-1 text-emerald-700 font-bold text-[11px] mb-1">
              📋 プロフィール反映
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeStrong}
                onChange={(e) => setExcludeStrong(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span className="text-xs text-slate-700">
                💪 強み科目を演習から除外
              </span>
            </label>
            <div className="text-[10px] text-emerald-700 mt-1">
              {(() => {
                const strongList = SUBJECTS_ORDER.filter((s) => profile[s] === 'strong');
                if (strongList.length === 0) return <span className="text-slate-400">未設定 → プロフィール編集してください</span>;
                if (!excludeStrong) return <span>OFF (全科目から出題)</span>;
                return <span>除外中: {strongList.join('・')}</span>;
              })()}
            </div>
            <button
              onClick={() => setShowProfile(true)}
              className="mt-1 text-[10px] text-emerald-700 hover:bg-emerald-100 px-1.5 py-0.5 rounded text-left underline"
            >
              ⚙ プロフィールを編集
            </button>
          </div>

          {/* 演習統計 */}
          <div className="flex flex-col bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-[260px]">
            <div className="text-slate-700 font-bold text-[11px] mb-1">📊 演習統計</div>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded text-[11px] font-semibold" title="現在のフィルタ条件で出題される問題の総数 (プロフィール反映後)">🎯 プール {poolTotal}</span>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[11px]">累計 {stats.total}</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[11px]">○ {stats.correct}</span>
              <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-[11px]">× {stats.wrong}</span>
              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[11px] font-bold">正答率 {stats.total ? Math.round(stats.correct / stats.total * 100) : 0}%</span>
              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-[11px]">🔥 弱点 {wrongIds.size}</span>
              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[11px]">⭐ {bookmarkIds.size}</span>
            </div>
          </div>
        </div>
        )}
      </div>

      <div className="w-full flex-1 px-4 py-3 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        <div className="lg:col-span-7 space-y-4 overflow-y-auto pr-2">
          <div className="bg-white rounded-lg shadow p-4">
            {/* フィルタ行 (各ドロップダウンは固定幅でレイアウトシフト防止) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[115px_1fr_1.5fr_1.5fr_2fr] gap-3 items-end">
              <label className="flex flex-col text-xs text-slate-600 font-semibold">
                級
                <select
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value)}
                  className="mt-1 px-2 py-2 border border-slate-300 rounded text-sm w-full"
                >
                  <option value="">すべて ({(levelCounts['1級'] || 0) + (levelCounts['2級'] || 0)})</option>
                  <option value="1級">1級 ({levelCounts['1級'] || 0})</option>
                  <option value="2級">2級 ({levelCounts['2級'] || 0})</option>
                </select>
              </label>
              <label className="flex flex-col text-xs text-slate-600 font-semibold">
                科目
                <select
                  value={filterSubject}
                  onChange={(e) => { setFilterSubject(e.target.value); setFilterTheme(''); }}
                  className="mt-1 px-2 py-2 border border-slate-300 rounded text-sm w-full"
                >
                  <option value="">すべて ({poolTotal})</option>
                  {Object.entries(data.by_subject).sort((a, b) => (subjectCounts[b[0]] || 0) - (subjectCounts[a[0]] || 0)).map(([s]) => (
                    <option key={s} value={s}>{s} ({subjectCounts[s] || 0})</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-xs text-slate-600 font-semibold">
                テーマ
                <select
                  value={filterTheme}
                  onChange={(e) => setFilterTheme(e.target.value)}
                  className="mt-1 px-2 py-2 border border-slate-300 rounded text-sm w-full"
                >
                  <option value="">すべて</option>
                  {themeOptions.slice(0, 100).map(([t, n]) => {
                    const rank = themeRanks.get(t);
                    const prefix = rank ? `#${rank} ` : '';
                    return <option key={t} value={t}>{prefix}{t} ({n})</option>;
                  })}
                </select>
              </label>
              <label className="flex flex-col text-xs text-slate-600 font-semibold">
                類似度
                <select
                  value={filterSim}
                  onChange={(e) => setFilterSim(e.target.value)}
                  className="mt-1 px-2 py-2 border border-slate-300 rounded text-sm w-full"
                  title="過去問との類似度。「過去問と同じ」「ほぼ同じ」は再出題に近く高効率"
                >
                  <option value="">すべて</option>
                  {['過去問と同じ', 'ほぼ同じ', '一部違う', '大幅違う', '過去問と全然違う'].map((c) => (
                    <option key={c} value={c}>
                      {SIM_ICON[c]} {c} ({simCounts[c] || 0})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-xs text-slate-600 font-semibold">
                頻出度
                <select
                  value={filterFreq}
                  onChange={(e) => setFilterFreq(e.target.value)}
                  className="mt-1 px-2 py-2 border border-slate-300 rounded text-sm w-full"
                  title="テーマの出題頻度ランキング (選択した級内)。最頻出は得点源にしやすい"
                >
                  <option value="">すべて</option>
                  <option value="top10">🔥 超頻出 上位10テーマ ({freqCounts.top10}問)</option>
                  <option value="top30">⭐ 頻出 上位30テーマ ({freqCounts.top30}問)</option>
                  <option value="top60">📚 標準 上位60テーマ ({freqCounts.top60}問)</option>
                  <option value="rare">🔍 マイナー 61位以下 ({freqCounts.rare}問)</option>
                </select>
              </label>
            </div>
            {/* アクションボタン行 (フィルタ変更でも位置が変わらない) */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={next}
                className="px-4 py-2 bg-blue-600 text-white rounded font-bold text-sm hover:bg-blue-700"
              >
                次の問題 →
              </button>
              <button
                onClick={() => setShowReport(true)}
                className="px-3 py-2 bg-amber-500 text-white rounded font-bold text-sm hover:bg-amber-600"
                title="現在までの正答率・科目別成績・合格判定・AI戦略助言を表示"
              >
                📊 成績・合格判定を見る
              </button>
              <button
                onClick={clearFilters}
                className="px-3 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded text-sm hover:bg-slate-200"
                title="級・科目・テーマ・類似度のフィルタをすべて解除"
              >
                ✖ フィルタクリア
              </button>
              <button
                onClick={resetStats}
                className="px-3 py-2 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300"
              >
                統計リセット
              </button>
            </div>
          </div>

          {!current ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-slate-500">
              「次の問題 →」を押して開始してください
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-5 space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="relative group cursor-help">
                  <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded font-bold">{current.level}</span>
                  <span className="absolute left-0 top-full mt-1 hidden group-hover:block bg-slate-800 text-white text-xs leading-snug p-2 rounded shadow-lg w-72 z-20 whitespace-normal font-normal">
                    <strong>{current.level}</strong>: 電気工事施工管理技士 第一次検定の試験区分。<br />
                    {current.level === '1級' ? '1級は監理技術者要件 (大規模工事の現場管理可)。出題範囲が広く深い' : '2級は主任技術者要件 (一般工事の現場管理可)。1級より範囲は限定的'}
                  </span>
                </span>
                <span className="relative group cursor-help">
                  <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded">
                    {current.year}{current.season ? (current.season === 'AM' ? ' 前期' : current.season === 'PM' ? ' 後期' : ` ${current.season}`) : ''}
                  </span>
                  <span className="absolute left-0 top-full mt-1 hidden group-hover:block bg-slate-800 text-white text-xs leading-snug p-2 rounded shadow-lg w-72 z-20 whitespace-normal font-normal">
                    <strong>出題年度</strong>: {current.year}{current.season === 'AM' ? ' 前期 (6月実施)' : current.season === 'PM' ? ' 後期 (11月実施)' : ''}。{current.level === '2級' && (current.season === 'AM' || current.season === 'PM') ? '2級は年2回実施 (前期/後期)' : '1級は年1回実施'}
                  </span>
                </span>
                <span className="relative group cursor-help">
                  <span className="px-2 py-1 bg-blue-600 text-white rounded font-bold">問題No.{current.no}</span>
                  <span className="absolute left-0 top-full mt-1 hidden group-hover:block bg-slate-800 text-white text-xs leading-snug p-2 rounded shadow-lg w-72 z-20 whitespace-normal font-normal">
                    <strong>問題番号</strong>: 試験問題PDF内の連番 (No.{current.no})。PDFのページ {current.page ?? '不明'} に掲載
                  </span>
                </span>
                <span className="relative group cursor-help">
                  <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded">{current.subject}</span>
                  <span className="absolute left-0 top-full mt-1 hidden group-hover:block bg-slate-800 text-white text-xs leading-snug p-2 rounded shadow-lg w-72 z-20 whitespace-normal font-normal">
                    <strong>{current.subject}</strong>: 第一次検定5科目のひとつ。<br />
                    {current.subject === '電気理論' ? 'オームの法則・三相交流・電磁気学などの基礎理論' :
                      current.subject === '電気設備' ? '発電/送配電/受変電/照明/動力など実務に直結する設備知識' :
                      current.subject === '施工' ? '現場の施工手順・配線/接地/試験/検査などの具体技術' :
                      current.subject === '施工管理法' ? '工程/品質/安全/原価管理。PERT/ガントチャート等' :
                      current.subject === '法規' ? '電気事業法・電気工事士法・建設業法・労働安全衛生法など' : '科目別出題範囲'
                    }
                  </span>
                </span>
                {current.theme && (() => {
                  const rank = themeRanks.get(current.theme);
                  const isTop10 = rank !== undefined && rank <= 10;
                  const isTop30 = rank !== undefined && rank <= 30;
                  const bg = isTop10 ? 'bg-rose-500 text-white' : isTop30 ? 'bg-amber-500 text-white' : 'bg-emerald-100 text-emerald-800';
                  const icon = isTop10 ? '🔥' : isTop30 ? '⭐' : '';
                  const tier = isTop10 ? '超頻出 (上位10)' : isTop30 ? '頻出 (上位30)' : rank && rank <= 60 ? '標準 (上位60)' : 'マイナー (61位以下)';
                  return (
                    <span className="relative group cursor-help">
                      <span className={`px-2 py-1 rounded ${bg}`}>
                        {icon}{current.theme}{rank ? ` (#${rank})` : ''}
                      </span>
                      <span className="absolute left-0 top-full mt-1 hidden group-hover:block bg-slate-800 text-white text-xs leading-snug p-2 rounded shadow-lg w-72 z-20 whitespace-normal font-normal">
                        <strong>テーマ: {current.theme}</strong><br />
                        {rank ? `${current.level}内の頻出度ランキング: #${rank} 位 / ${tier}` : 'ランキング外'}<br />
                        過去問にどれだけ繰り返し出題されているかの指標。上位ほど得点源にしやすい
                      </span>
                    </span>
                  );
                })()}
                {current.category && (
                  <span className="relative group cursor-help">
                    <span className="px-2 py-1 text-white rounded font-bold" style={{ background: current.category_color }}>
                      {CATEGORY_ICON[current.category] || ''} {current.category}
                    </span>
                    <span className="absolute left-0 top-full mt-1 hidden group-hover:block bg-slate-800 text-white text-xs leading-snug p-2 rounded shadow-lg w-72 z-20 whitespace-normal font-normal">
                      <strong>{current.category}とは:</strong><br />
                      {CATEGORY_DEF[current.category] || '—'}
                    </span>
                  </span>
                )}
                {current.similarity_category && (
                  <span className="relative group cursor-help">
                    <span
                      className="px-2 py-1 text-white rounded font-bold"
                      style={{ background: SIM_COLOR[current.similarity_category] }}
                    >
                      {SIM_ICON[current.similarity_category] || ''} {current.similarity_category}
                    </span>
                    <span className="absolute left-0 top-full mt-1 hidden group-hover:block bg-slate-800 text-white text-xs leading-snug p-2 rounded shadow-lg w-72 z-20 whitespace-normal font-normal">
                      <strong>{current.similarity_category}とは:</strong><br />
                      {SIM_DEF[current.similarity_category] || '—'}
                      <br /><br />
                      <span className="text-slate-300">類似度スコア: {((current.similarity_score ?? 0) * 100).toFixed(0)}%
                      {current.similar_to ? ` (最類似: ${current.similar_to})` : ''}</span>
                    </span>
                  </span>
                )}
              </div>

              <p className="text-base leading-relaxed whitespace-pre-wrap">{current.question}</p>

              {/* 「📄 問題PDF」ボタンを押すと PDFオーバーレイで表示するため、サムネ画像は削除 */}

              <div className="space-y-2">
                {current.choices.map((c, i) => {
                  const isCorrect = judged && current.correct_answer && (i + 1) === current.correct_answer;
                  const isWrong = judged && selected === i && !isCorrect;
                  return (
                    <button
                      key={i}
                      onClick={() => judge(i)}
                      disabled={judged}
                      className={`w-full text-left px-4 py-3 border-2 rounded transition ${
                        isCorrect ? 'border-emerald-500 bg-emerald-50 text-emerald-900' :
                        isWrong ? 'border-red-500 bg-red-50 text-red-900' :
                        selected === i ? 'border-blue-500 bg-blue-50' :
                        'border-slate-200 hover:border-blue-400 hover:bg-slate-50'
                      } ${judged ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <span className="font-bold text-blue-700 mr-2">{i + 1}.</span>
                      <span className="text-sm">{c}</span>
                    </button>
                  );
                })}
              </div>

              {judged && current.correct_answer && studyMode === 'browse' && (
                <div className="p-3 rounded bg-amber-50 border-l-4 border-amber-500 text-amber-900">
                  <p><strong>👀 眺めモード:</strong> この問題の正解は <strong>{current.correct_answer}番</strong>。問題と答えの組合せを脳に焼き付ける目的なので、テストはしない。</p>
                </div>
              )}
              {judged && current.correct_answer && studyMode !== 'browse' && (
                <div className={`p-3 rounded ${isRight ? 'bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800' : 'bg-red-50 border-l-4 border-red-500 text-red-800'}`}>
                  {isRight ? (
                    <p><strong>○ 正解！</strong> 問題No.{current.no} の正解は {current.correct_answer}番 です。</p>
                  ) : (
                    <p><strong>× 不正解。</strong> 正解は {current.correct_answer}番 でした。あなたの選択: {(selected ?? 0) + 1}番</p>
                  )}
                </div>
              )}

              {/* 判定後: AI機能群 (合格率向上のための4機能) */}
              {judged && (
                <div className="mt-2 p-4 bg-gradient-to-r from-purple-50 to-fuchsia-50 border-2 border-purple-300 rounded-lg space-y-2">
                  <button
                    onClick={askAi}
                    className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white rounded-lg font-bold text-base shadow-lg hover:shadow-xl hover:from-purple-700 hover:to-fuchsia-700 transition-all"
                  >
                    🤖 AIに詳しく解説してもらう
                  </button>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <button
                      onClick={explainAllChoices}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-sm shadow"
                      title="正解以外の3つの選択肢も「なぜ違うか」「どう書き換えたら正解になるか」を解説。1問で4問分の知識を吸収"
                    >
                      🎯 4択全てを解説<span className="text-xs opacity-80 block">1問で4倍の学習密度</span>
                    </button>
                    <button
                      onClick={generateInstantTricks}
                      className="px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-yellow-950 rounded font-bold text-sm shadow"
                      title="このテーマの「キーワード→即答」パターンをAIが生成。本番の時間短縮に直結"
                    >
                      ⚡ 瞬殺テク集<span className="text-xs opacity-80 block">キーワード→即答パターン</span>
                    </button>
                    <button
                      onClick={generateSimilar}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-sm shadow"
                      title="同じ解法パターンで数値だけ変えた類題をAIが作成。解法パターンが身についているかテストできる"
                    >
                      🎲 類題を生成<span className="text-xs opacity-80 block">数値を変えて解法定着</span>
                    </button>
                    <button
                      onClick={generateMnemonic}
                      className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold text-sm shadow"
                      title="法規・丸暗記向け。語呂合わせと暗記カードをAIが作成。試験直前の詰め込みに最適"
                    >
                      🃏 語呂&暗記カード<span className="text-xs opacity-80 block">数字暗記を最速化</span>
                    </button>
                  </div>
                  <p className="text-xs text-purple-700 text-center">
                    AI機能はすべて右側のチャットに表示されます。追加質問もそのまま可能。
                  </p>
                </div>
              )}

              {/* セカンダリ操作: PDF/解説サイト/再挑戦/次へ等 */}
              <div className="flex flex-wrap gap-2 items-center mt-2">
                <button
                  onClick={toggleBookmark}
                  className={`px-3 py-2 rounded text-sm font-bold w-[140px] text-center ${bookmarkIds.has(current.id) ? 'bg-yellow-400 text-yellow-900' : 'bg-slate-200 text-slate-700 hover:bg-yellow-100'}`}
                  title="あとで見直す印 (試験直前の見返し用)"
                >
                  {bookmarkIds.has(current.id) ? '⭐ 登録済' : '☆ ブックマーク'}
                </button>
                <button
                  onClick={openProblemPdf}
                  className={`px-3 py-2 rounded text-sm font-bold text-white ${current.has_figure ? 'bg-violet-500 hover:bg-violet-600' : 'bg-slate-500 hover:bg-slate-600'}`}
                  title={`問題PDF を新タブで開く (p.${current.page || '?'} 周辺に No.${current.no})`}
                >
                  {current.has_figure ? '🖼 問題PDF' : '📄 問題PDF'}
                  {current.page ? <span className="ml-1 text-[10px] opacity-80">p.{current.page}</span> : null}
                </button>
                <button
                  onClick={openAnswerPdf}
                  className="px-3 py-2 bg-teal-500 text-white rounded text-sm font-bold hover:bg-teal-600"
                  title={`解答PDF を新タブで開く (No.${current.no} を探してください)`}
                >
                  📑 解答PDF
                </button>
                <button onClick={openKakomon} className="px-3 py-2 bg-cyan-500 text-white rounded text-sm font-bold hover:bg-cyan-600">
                  📖 解説サイト
                </button>
                {studyMode === 'browse' ? (
                  <>
                    <button
                      onClick={goPrev}
                      disabled={historyIdx <= 0}
                      className="px-3 py-2 bg-slate-400 text-white rounded text-sm font-bold hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="前の問題に戻る (PCなら ← キーでも操作可)"
                    >
                      ← 前へ
                    </button>
                    <button
                      onClick={next}
                      className="px-5 py-2 bg-emerald-600 text-white rounded text-sm font-bold hover:bg-emerald-700 ml-auto"
                      title="次の問題に進む (PCなら Space または → キーでも操作可)"
                    >
                      次の問題 →
                    </button>
                  </>
                ) : !judged ? (
                  <button onClick={skipUnanswered} className="px-3 py-2 bg-slate-300 text-slate-700 rounded text-sm font-bold hover:bg-slate-400">
                    スキップ（未回答）
                  </button>
                ) : (
                  <>
                    <button onClick={redo} className="px-3 py-2 bg-sky-500 text-white rounded text-sm font-bold hover:bg-sky-600">
                      🔄 同じ問題をもう一度
                    </button>
                    <button onClick={next} className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-700 ml-auto">
                      次の問題 →
                    </button>
                  </>
                )}
              </div>

              {judged && current.explanation && (
                <div className="p-4 bg-cyan-50 border-l-4 border-cyan-500 rounded">
                  <h3 className="font-bold text-cyan-800 mb-2">📖 公式解説 (kakomonn由来)</h3>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{current.explanation}</p>
                  {current.choice_eval && current.choice_eval.some((x) => x) && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-semibold text-slate-600">選択肢別評価:</p>
                      {current.choice_eval.map((ev, i) => ev && (
                        <div key={i} className={`text-xs p-2 rounded ${(i + 1) === current.correct_answer ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
                          <strong>選択肢{i + 1}:</strong> {ev}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {judged && !current.explanation && (
                <div className="p-4 bg-slate-50 border-l-4 border-slate-400 rounded">
                  <h3 className="font-bold text-slate-700 mb-1">📖 公式解説</h3>
                  <p className="text-sm text-slate-600">
                    ⚠ この問題には kakomonn 由来の公式解説が登録されていません。
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    上の「🤖 AIに詳しく解説してもらう」または「🎯 4択全てを解説」ボタンで Claude に解説してもらえます。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 h-full overflow-hidden">
          <div className="h-full">
            <ChatUI
              ref={chatRef}
              context={current ? {
                level: current.level,
                year: current.year + (current.season ? `_${current.season}` : ''),
                no: current.no,
                subject: current.subject,
                theme: current.theme,
                question: current.question,
                choices: current.choices,
                correctAnswer: current.correct_answer,
                userSelection: selected !== null ? selected + 1 : undefined,
                explanation: current.explanation,
                themeSamples: (() => {
                  const same = (data?.problems || []).filter((p) => p.theme === current.theme && p.id !== current.id).slice(0, 5);
                  return same.map((p) => ({
                    level: p.level,
                    year: p.year + (p.season ? `_${p.season}` : ''),
                    no: p.no,
                    question: p.question.slice(0, 200),
                    choices: (p.choices || []).map((c) => c.slice(0, 100)),
                    correctAnswer: p.correct_answer,
                  }));
                })(),
              } : undefined}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
