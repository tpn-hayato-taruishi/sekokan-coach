// 試験日スケジュール (サーバ側のみ)。app/api/exam-date/route.ts が使う。
// 新しい試験を追加するときは EXAM_SCHEDULE_URLS / EXAM_SCHEDULE に同じ ExamId で追加する。
// エントリが無い試験は API が 400 を返し、UI 側はカウントダウンを出さない。

import type { ExamId } from './exams';

export type ScheduleEntry = {
  examDate: string;       // 試験日
  examName: string;       // 表示名
  applyStart: string;     // 受付開始
  applyEnd: string;       // 受付締切
  resultDate: string;     // 合格発表日 (空文字列なら未公表)
  note?: string;          // 補足
};

/** 公式サイト (試験日が未来日として載っているかの確認に使う) */
export const EXAM_SCHEDULE_URLS: Partial<Record<ExamId, Record<string, string[]>>> = {
  denki: {
    '1級': [
      'https://www.fcip-shiken.jp/den1/',
      'https://www.fcip-shiken.jp/den1/index.html',
      'https://www.fcip-shiken.jp/',
    ],
    '2級': [
      'https://www.fcip-shiken.jp/den2/',
      'https://www.fcip-shiken.jp/den2/index.html',
      'https://www.fcip-shiken.jp/',
    ],
  },
  denkitsushin: {
    '1級': [
      'https://www.jctc.jp/exam_dentsu_1q/',
      'https://www.jctc.jp/',
    ],
    '2級': [
      'https://www.jctc.jp/exam_dentsu_2q/',
      'https://www.jctc.jp/',
    ],
  },
};

// 公式から取得した R8 試験スケジュール (試験終了後に手動更新)
// 出典: https://www.fcip-shiken.jp/den1/index.html, /den2/index.html (取得日: 2026-06-15)
export const EXAM_SCHEDULE: Partial<Record<ExamId, Record<string, ScheduleEntry[]>>> = {
  denki: {
    '1級': [
      {
        examDate: '2026-07-12',
        examName: 'R8 1級 第一次検定',
        applyStart: '2026-02-13',
        applyEnd: '2026-02-27',
        resultDate: '2026-08-25',
        note: '「第一次のみ」受検申請は 2026-02-13～2026-04-07 に延長可',
      },
      {
        examDate: '2026-10-18',
        examName: 'R8 1級 第二次検定',
        applyStart: '2026-02-13',
        applyEnd: '2026-02-27',
        resultDate: '2027-01-08',
      },
    ],
    '2級': [
      {
        examDate: '2026-06-14',
        examName: 'R8 2級 前期 第一次検定',
        applyStart: '2026-02-06',
        applyEnd: '2026-02-27',
        resultDate: '2026-07-13',
        note: '前期は第二次検定なし',
      },
      {
        examDate: '2026-11-08',
        examName: 'R8 2級 後期 第一次検定',
        applyStart: '2026-06-29',
        applyEnd: '2026-07-27',
        resultDate: '2026-12-21',
        note: 'ネット 6/29-7/27 / 書面 7/13-7/27',
      },
      {
        examDate: '2027-02-05',
        examName: 'R8 2級 後期 第二次検定',
        applyStart: '2026-06-29',
        applyEnd: '2026-07-27',
        resultDate: '',
        note: '合格発表は未公表',
      },
    ],
  },
  denkitsushin: {
    // JCTC 公式 (全国建設研修センター) - 例年実施スケジュールから推定
    '1級': [
      {
        examDate: '2026-09-06',
        examName: 'R8 1級 第一次検定',
        applyStart: '2026-05-07',
        applyEnd: '2026-05-21',
        resultDate: '2026-10-15',
        note: 'JCTC公式の例年スケジュールから推定 (詳細は jctc.jp を確認)',
      },
      {
        examDate: '2026-12-06',
        examName: 'R8 1級 第二次検定',
        applyStart: '2026-05-07',
        applyEnd: '2026-05-21',
        resultDate: '2027-03-05',
        note: '一次合格後に二次受検 (推定)',
      },
    ],
    '2級': [
      {
        examDate: '2026-06-07',
        examName: 'R8 2級 前期 第一次検定',
        applyStart: '2026-03-04',
        applyEnd: '2026-03-18',
        resultDate: '2026-07-08',
        note: '前期は第二次検定なし (推定)',
      },
      {
        examDate: '2026-11-15',
        examName: 'R8 2級 後期 第一次検定',
        applyStart: '2026-07-08',
        applyEnd: '2026-07-22',
        resultDate: '2027-01-08',
        note: 'JCTC公式の例年スケジュールから推定',
      },
      {
        examDate: '2026-11-15',
        examName: 'R8 2級 後期 第二次検定',
        applyStart: '2026-07-08',
        applyEnd: '2026-07-22',
        resultDate: '2027-03-05',
        note: '後期は一次+二次 同日実施 (推定)',
      },
    ],
  },
};
