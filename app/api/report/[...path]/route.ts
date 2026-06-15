import { NextRequest } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, normalize } from 'node:path';

// 配信元 pptx/ — 開発時は親リポジトリ参照、本番Docker内は同梱の pptx-assets/
async function resolveRoot(): Promise<string> {
  const candidates = [
    resolve(process.cwd(), 'pptx-assets'),       // 本番 Docker
    resolve(process.cwd(), '..', 'pptx'),         // 開発 (親ディレクトリ)
    resolve(process.cwd(), 'pptx'),               // フォールバック
  ];
  for (const c of candidates) {
    try {
      const s = await stat(c);
      if (s.isDirectory()) return c;
    } catch {}
  }
  return candidates[1]; // 最後の手段
}

const TYPE_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const REPORT_ROOT = await resolveRoot();
  const rel = path.join('/');
  const absolute = normalize(join(REPORT_ROOT, rel));
  if (!absolute.startsWith(REPORT_ROOT)) {
    return new Response('forbidden', { status: 403 });
  }
  // 出題傾向HTMLと関連アセットのみ配信
  const lower = absolute.toLowerCase();
  const allowed = Object.keys(TYPE_MAP).some((ext) => lower.endsWith(ext));
  if (!allowed) {
    return new Response('only html/css/js/img assets', { status: 400 });
  }
  try {
    const data = await readFile(absolute);
    const ext = '.' + lower.split('.').pop();
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': TYPE_MAP[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
