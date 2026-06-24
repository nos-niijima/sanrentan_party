import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'サンレンタン Party',
  description: 'ホストのお題に 1〜3 着を予想して当てる、推理パーティゲーム',
};

type LayoutProps = {
  children: ReactNode;
};

// ルートは html/body のみ。アプリのヘッダ/フッタ chrome は (site) グループに置く。
// /browse 等の独立フルスクリーン画面は chrome 無しでルート直下に置ける。
export default function RootLayout({ children }: LayoutProps) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-stone-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
