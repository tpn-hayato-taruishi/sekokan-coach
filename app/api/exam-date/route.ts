// 公式試験スケジュールを取得 (試験種別は lib/exams.ts の ExamId)
// - 電気工事: fcip-shiken.jp (建設業振興基金)
// - 電気通信工事: jctc.jp (全国建設研修センター)
// 試験日 + 受付期間 + 合格発表日 をセットで返す
// 取得失敗時 (社内プロキシ等) は lib/exam-schedule.ts の表から返す

import { isExamId } from '@/lib/exams';
import { EXAM_SCHEDULE, EXAM_SCHEDULE_URLS } from '@/lib/exam-schedule';

export const dynamic = 'force-dynamic';
export const revalidate = 21600; // 6時間キャッシュ

function toNum(s: string): number {
  return parseInt(s.replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xFF10)), 10);
}

function parseDates(html: string): string[] {
  const out = new Set<string>();
  const r1 = /令和\s*([0-9０-９]+)\s*年\s*([0-9０-９]+)\s*月\s*([0-9０-９]+)\s*日/g;
  const r2 = /([0-9]{4})\s*年\s*([0-9]+)\s*月\s*([0-9]+)\s*日/g;
  let m: RegExpExecArray | null;
  while ((m = r1.exec(html))) {
    const year = 2018 + toNum(m[1]);
    out.add(`${year}-${String(toNum(m[2])).padStart(2, '0')}-${String(toNum(m[3])).padStart(2, '0')}`);
  }
  while ((m = r2.exec(html))) {
    out.add(`${m[1]}-${String(toNum(m[2])).padStart(2, '0')}-${String(toNum(m[3])).padStart(2, '0')}`);
  }
  return [...out];
}

async function fetchOne(url: string): Promise<{ dates: string[]; debug: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
      },
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { dates: [], debug: `HTTP ${res.status} ${url}` };
    const html = await res.text();
    if (html.includes('HTTP接続時にエラー') || html.includes('プロキシ') || html.length < 500) {
      return { dates: [], debug: `proxy/error response ${url}` };
    }
    const dates = parseDates(html);
    return { dates, debug: `${dates.length}件抽出 ${url}` };
  } catch (e) {
    return { dates: [], debug: `${(e as Error).message} ${url}` };
  }
}

async function fetchOfficial(urls: string[]): Promise<{ futureDates: string[]; debug: string }> {
  const debugLines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const url of urls) {
    const r = await fetchOne(url);
    debugLines.push(r.debug);
    const future = r.dates.filter((d) => d >= today).sort();
    if (future.length > 0) {
      return { futureDates: future, debug: debugLines.join(' | ') };
    }
  }
  return { futureDates: [], debug: debugLines.join(' | ') || 'no dates' };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level') || '2級';
  const rawCategory = searchParams.get('category');
  const category = isExamId(rawCategory) ? rawCategory : 'denki';
  const urls = EXAM_SCHEDULE_URLS[category]?.[level];
  if (!urls) return Response.json({ error: 'invalid level or category' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const fetched = await fetchOfficial(urls);

  // SCHEDULE 表から「今日以降の試験日」を持つエントリを抽出
  const upcomingSchedule = (EXAM_SCHEDULE[category]?.[level] || []).filter((s) => s.examDate >= today);

  // 公式取得成功 = 試験日が公式に未来日として含まれているか確認
  let source: 'official' | 'fallback' = 'fallback';
  const primary = upcomingSchedule[0] || null;
  if (fetched.futureDates.length > 0 && primary && fetched.futureDates.includes(primary.examDate)) {
    source = 'official';
  }

  return Response.json({
    level,
    examDate: primary?.examDate ?? null,
    examName: primary?.examName ?? null,
    applyStart: primary?.applyStart ?? null,
    applyEnd: primary?.applyEnd ?? null,
    resultDate: primary?.resultDate ?? null,
    note: primary?.note ?? null,
    schedule: upcomingSchedule, // 次回以降の全エントリ
    source,
    tried: urls,
    debug: fetched.debug,
    fetchedAt: new Date().toISOString(),
  });
}
