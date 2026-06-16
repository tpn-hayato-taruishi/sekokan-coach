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
    const prompt = current.explanation
      ? `この問題について、公式解説を踏まえた上で「なぜそれが正解か」「他の選択肢の覚え方」「似た問題の傾向」をもう少し詳しく教えてください。`
      : `この問題の正解の理由・他の選択肢が誤りである理由・覚え方を解説してください。`;
    chatRef.current?.sendMessage(prompt);
  }, [current]);

  // 機能①: 4択全ての正誤理由を一括解説 (1問→4問分の学習密度)
  const explainAllChoices = useCallback(() => {
    if (!current) return;
    chatRef.current?.sendMessage(
      `この問題の選択肢1〜4それぞれについて、以下を簡潔に教えてください。
1. 正しいか誤りか
2. なぜそうなるのか (根拠となる法令・公式・原理)
3. 引っ掛けポイント (この選択肢を真にするには問題文をどう書き換えるか)

「他3つを正解の形に書き換えたらどうなるか」を意識して、1問で4問分の知識が身につく説明にしてください。`
    );
  }, [current]);

  // 機能②: 数値だけ変えた類題を生成 (計算問題の解法パターン定着)
  const generateSimilar = useCallback(() => {
    if (!current) return;
    chatRef.current?.sendMessage(
      `この問題と「全く同じ解法パターン」で「数値だけを別の値」に差し替えた類題を1問作成してください。

出力フォーマット:
【類題】問題文
【選択肢】1. ... / 2. ... / 3. ... / 4. ...
【正解】N番
【解き方】公式と計算手順を3〜5行で
【ポイント】この解法パターンの覚え方

数値は試験で出そうな現実的な範囲にしてください。`
    );
  }, [current]);

  // 機能④: テーマ別「瞬殺テク集」生成 — 選択肢を絞り込むためのパターン辞典
  const generateInstantTricks = useCallback(() => {
    if (!current || !current.theme) return;
    const allProblems = data?.problems || [];
    const sameTheme = allProblems.filter((p) => p.theme === current.theme && p.id !== current.id).slice(0, 6);
    const examplesBlock = sameTheme.length > 0
      ? `\n## 同テーマの過去問サンプル (これらから出題パターンと正答パターンを抽出してください)\n` + sameTheme.map((p, i) =>
          `### 例${i + 1}: ${p.level} ${p.year} No.${p.no}\n` +
          `Q: ${p.question.slice(0, 250)}\n` +
          `選択肢:\n${(p.choices || []).map((c, j) => `  ${j + 1}. ${c.slice(0, 90)}`).join('\n')}\n` +
          (p.correct_answer ? `正答: ${p.correct_answer}番` : ''),
        ).join('\n\n')
      : '';
    chatRef.current?.sendMessage(
      `テーマ「${current.theme}」(${current.subject}) の過去問4択を **選択肢を絞り込んで正解を選ぶ** ためのパターン辞典を作ってください。

## 受験生の要望
- 「正解の根拠を完全に理解する」のではなく「**選択肢を見て、これは違う・これは怪しい** と判別して絞り込みたい」
- 試験本番で迷ったときに、選択肢の語句だけ見て確率の高い答えに賭けたい

## 現在の問題
${current.question.slice(0, 300)}
選択肢:
${(current.choices || []).map((c, i) => `  ${i + 1}. ${c.slice(0, 100)}`).join('\n')}
${current.correct_answer ? `正答: ${current.correct_answer}番` : ''}
${examplesBlock}

## 守るべきこと
1. 上記の **過去問サンプルから実際の言葉を引用** して書く。一般論や抽象論は禁止。
2. 「正答に出やすい単語」「誤答にはこのフレーズが多い」など、**選択肢の文面パターン** に焦点。
3. 「問題文と合わない選択肢を選ぶ」「計算結果と一致しないものは誤答」のような **当たり前の話は絶対書かない**。

## 出力フォーマット

【🎯 正答に出やすい単語・フレーズ】 (4-6個)
・「○○」を含む選択肢 → 正答率高 (理由: 例3,例5でも正答にこの単語あり)
・「常に・必ず」を含む選択肢 → ほぼ正答 (法令や基準の絶対表現)
(具体的に、過去問の文面から引用すること)

【❌ 誤答に頻出するNGワード】 (4-6個)
・「省略できる」「不要である」 → 誤答多 (安全関連は省略不可が原則)
・「逆比例」「上昇する」など、原則の逆を書いた表現 → 誤答
(過去問の誤答選択肢から具体的に引用すること)

【🔑 二択まで絞ったときの最終判断】
迷う2選択肢が出たとき、どちらを選ぶ? このテーマ固有の判断基準を1-2個。
例: 「より厳しい基準を選ぶ」「より具体的な数値を選ぶ」

【📌 暗記必須の固有名詞・数値】 (3-5個)
このテーマで出る数字や固有名詞をリスト化。

簡潔に。本番で迷ったとき選択肢を見ながら絞り込めるレベルに。`,
    );
  }, [current, data]);

  // 機能③: 語呂合わせ・暗記カード生成 (法規/丸暗記向け)
  const generateMnemonic = useCallback(() => {
    if (!current) return;
    chatRef.current?.sendMessage(
      `この問題の正解と関連知識を覚えるための「語呂合わせ + 暗記カード」を作ってください。

出力フォーマット:
【語呂合わせ】(7〜15字程度の短いフレーズ)
【意味】語呂と知識の対応
【暗記カード】
表: (キーワード or 数字)
裏: (定義 or 値)
× 2〜3枚
【類似ひっかけ】試験で混同しやすい用語/数字との違い

数字 (○日以内, ○m以上, ○V以下 等) は特に重点的に。`
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
      chatRef.current?.sendMessage('今表示されているテーマで「過去問が繰り返し問うている共通の視点・出題パターン」をAIに分析してもらえますか？同じテーマで何度も同じ角度から問われている点を列挙してください。');
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
          `現在の演習実績と私のバックグラウンドを踏まえて、合格に向けて何を重点学習すべきか個別アドバイスをお願いします。

【全体演習実績】 ${stats.total}問 / ${stats.correct}正解 / ${stats.wrong}不正解 (正答率 ${rate}%)
【科目別正答率】
${subjLines || 'まだデータがありません'}

【私のバックグラウンド (自己評価)】
${profileLines}

合格基準は 全体60%以上 + 各科目40%以上 です。
- 💪強みに設定した科目は学習対象から外すか軽く流す方針で、それで合格圏に届くか
- ⚠苦手科目を最優先に時間配分すべきか
- 残り時間を考えて何科目を優先すべきか (試験日: ${examDate || '未設定'})
- 各科目で取り組むべき具体的なテーマ・分野
1次検定 (四肢択一) 対策の視点で、最小努力で合格するルートを教えてください。`
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
                      `次回試験での出題を予測してください。

【試験日】 ${examInfoStr}
【受験級】 ${filterLevel || '2級 (デフォルト)'}
【現在の弱点】 ${weakSubjects.map((x) => x.s).join('・') || 'なし'}
【過去出題上位30テーマ】 ${topThemes}

以下を教えてください:
1. 次回試験で出題確率が高いと予測されるテーマ Top10 (理由とともに)
2. その中で「過去2-3年連続出題」「周期的に再出題されるパターン」のテーマ
3. 直近の法改正/技術トレンドに関連する新規テーマ予想
4. 試験まで残された日数で「これだけはやれ」と言える最重要 5 テーマ`
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
                      title="前の問題に戻る (←キー)"
                    >
                      ← 前へ
                    </button>
                    <span className="text-xs text-slate-500 hidden sm:inline" title="PC専用: スペースキーで次の問題、←キーで前の問題">⌨ PC: Space=次 / ←=前</span>
                    <button onClick={next} className="px-5 py-2 bg-emerald-600 text-white rounded text-sm font-bold hover:bg-emerald-700 ml-auto">
                      次の問題 (Space) →
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
              } : undefined}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
