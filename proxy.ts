import { NextRequest, NextResponse } from 'next/server';

// 環境変数 ALLOWED_IPS（カンマ区切りCIDR）からIP制限
// 未設定時（ローカル開発）は全許可
export function proxy(request: NextRequest) {
  const allowedIps = process.env.ALLOWED_IPS;
  if (!allowedIps) return NextResponse.next();

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  // x-forwarded-for がない = App Runner内部ヘルスチェック → 許可
  if (!clientIp) return NextResponse.next();

  const cidrs = allowedIps.split(',').map(s => s.trim()).filter(Boolean);

  if (!isIpAllowed(clientIp, cidrs)) {
    console.log(JSON.stringify({
      type: 'ACCESS_DENIED', ip: clientIp, path: request.nextUrl.pathname,
      method: request.method, ua: request.headers.get('user-agent')?.slice(0, 200),
      t: new Date().toISOString(),
    }));
    return new NextResponse('アクセスが許可されていません', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // アクセスログ（構造化JSON → CloudWatch）
  console.log(JSON.stringify({
    type: 'ACCESS', ip: clientIp, path: request.nextUrl.pathname,
    method: request.method, ua: request.headers.get('user-agent')?.slice(0, 200),
    t: new Date().toISOString(),
  }));

  return NextResponse.next();
}

function ipToNum(ip: string): number {
  const parts = ip.split('.');
  return (
    ((parseInt(parts[0]) << 24) |
      (parseInt(parts[1]) << 16) |
      (parseInt(parts[2]) << 8) |
      parseInt(parts[3])) >>>
    0
  );
}

function isIpAllowed(ip: string, cidrs: string[]): boolean {
  for (const cidr of cidrs) {
    if (!cidr.includes('/')) {
      if (ip === cidr) return true;
      continue;
    }
    const [network, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr);
    if (prefix === 0) return true;
    const mask = (~0 << (32 - prefix)) >>> 0;
    if ((ipToNum(ip) & mask) === (ipToNum(network) & mask)) return true;
  }
  return false;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|api/health).*)'],
};
