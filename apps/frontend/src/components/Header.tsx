import Link from "next/link";

// cookie-based identity (HttpOnly pb_uid) を BFF が裏で発行するため、
// 画面上の login/logout 概念は無い。ヘッダはロゴ + 「卓を立てる」 CTA のみ。
export default function Header() {
  return (
    <header className="border-b border-amber-200 bg-gradient-to-r from-amber-500 to-orange-500 shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-xl font-bold text-white sm:text-2xl">
          サンレンタン Party
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/rooms/new"
            className="rounded-md bg-white/15 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/25"
          >
            卓を立てる
          </Link>
        </div>
      </div>
    </header>
  );
}
