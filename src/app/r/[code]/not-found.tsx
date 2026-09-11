import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="ui-card p-8 text-center space-y-4 max-w-sm">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-400 text-lg font-bold">
          404
        </div>
        <h1 className="text-xl font-semibold text-white">Ссылка не найдена</h1>
        <p className="text-sm text-slate-400">
          Реферальный код недействителен или партнёр отключён.
        </p>
        <Link href="/" className="ui-btn-primary inline-flex">
          На главную
        </Link>
      </div>
    </main>
  );
}
