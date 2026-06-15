import { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join, resolve, normalize } from 'node:path';

// 親リポジトリの過去問PDFを安全に配信する
const PDF_ROOT = resolve(process.cwd(), '..', '過去問', '施工管理');

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  // ディレクトリトラバーサル防止: 結合後のパスが PDF_ROOT 配下であることを確認
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
