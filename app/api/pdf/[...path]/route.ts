import { NextRequest } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, normalize } from 'node:path';

// 配信元: 開発時は親 過去問/施工管理/、本番Dockerは同梱の kakomon-assets/
async function resolveRoot(): Promise<string> {
  const candidates = [
    resolve(process.cwd(), 'kakomon-assets'),          // 本番 Docker
    resolve(process.cwd(), '..', '過去問', '施工管理'), // 開発
    resolve(process.cwd(), '過去問', '施工管理'),       // フォールバック
  ];
  for (const c of candidates) {
    try {
      const s = await stat(c);
      if (s.isDirectory()) return c;
    } catch {}
  }
  return candidates[1];
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const PDF_ROOT = await resolveRoot();
  // ディレクトリトラバーサル防止
  const rel = path.join('/');
  const absolute = normalize(join(PDF_ROOT, rel));
  if (!absolute.startsWith(PDF_ROOT)) {
    return new Response('forbidden', { status: 403 });
  }
  if (!absolute.toLowerCase().endsWith('.pdf')) {
    return new Response('only pdf', { status: 400 });
  }
  try {
    const data = await readFile(absolute);
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
