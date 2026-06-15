// App Runner ヘルスチェック用エンドポイント
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'sekokan-coach',
    timestamp: new Date().toISOString(),
  });
}
