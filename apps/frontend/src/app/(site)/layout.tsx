import type { ReactNode } from 'react';
import Header from '@/components/Header';

// アプリの chrome（共通ヘッダ + フッタ）。ランディング / rooms を包む。
// preview などの独立フルスクリーン画面はこの group の外（ルート直下）に置く。
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-stone-200 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-stone-500">
            © 2026 サンレンタン Party.
          </p>
        </div>
      </footer>
    </div>
  );
}
