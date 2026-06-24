import Link from "next/link";

/**
 * サンレンタン Party のランディング。
 * このプロジェクトは「卓を立てる」「招待リンクで入る」の 2 動線しかないため、
 * ここでは大きな CTA を 1 つだけ提示する。
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <header className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">サンレンタン Party</h1>
          <p className="text-lg md:text-xl text-white/90 mb-8">
            ホストのお題に 1 着・2 着・3 着を予想して当てる推理パーティ
          </p>
          <Link
            href="/rooms/new"
            className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-200 shadow-md hover:shadow-lg"
          >
            ホストで卓を立てる
          </Link>
        </div>
      </header>

      <section className="py-12 bg-stone-50">
        <div className="max-w-3xl mx-auto px-6 text-stone-700 text-base/7">
          <ol className="list-decimal pl-5 space-y-2">
            <li>「ホストで卓を立てる」を押し、卓の名前を入れて開く</li>
            <li>表示された招待 URL をプレイヤーに共有する</li>
            <li>お題と選択肢を入力 → 全員の予想が揃ったら結果を公開</li>
          </ol>
        </div>
      </section>

      <footer className="bg-stone-800 text-stone-300 mt-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 text-center text-sm">
          <p>&copy; 2026 サンレンタン Party.</p>
        </div>
      </footer>
    </div>
  );
}
