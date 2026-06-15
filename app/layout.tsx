import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#1e40af",
};

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "電気工事施工管理技士 合格ナビ — 1級/2級 第1次・第2次 (AI対応)",
  description: "電気工事施工管理技士 1級・2級 第1次検定/第2次検定の過去問演習・経験記述ジェネレーター・出題傾向ガイド。Bedrock Claude によるAI解説。",
  appleWebApp: {
    capable: true,
    title: "sekokan-coach",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "電気工事施工管理技士 合格ナビ",
    description: "1級・2級 第1次/第2次 完全対応。過去問演習 + AI解説 + 経験記述ジェネレーター",
    type: "website",
    locale: "ja_JP",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[var(--font-noto-sans-jp)]">
        {children}
      </body>
    </html>
  );
}
