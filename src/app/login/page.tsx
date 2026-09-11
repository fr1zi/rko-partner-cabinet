"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка входа");
        return;
      }
      router.push(data.redirect);
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-background bg-grid-fade">
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500 text-slate-950 font-bold shadow-glow"
          >
            РКО
          </Link>
          <h1 className="mt-5 text-2xl font-bold text-white">Вход в кабинет</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Партнёр (траффер) или администратор
          </p>
        </div>
        <form onSubmit={onSubmit} className="ui-card p-6 sm:p-7 space-y-4">
          {error ? (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm px-3 py-2.5">
              {error}
            </div>
          ) : null}
          <div>
            <label className="ui-label">Логин</label>
            <input
              className="ui-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="partner или admin"
              required
            />
          </div>
          <div>
            <label className="ui-label">Пароль</label>
            <input
              type="password"
              className="ui-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="ui-btn-primary w-full py-3"
          >
            {loading ? "Вход…" : "Войти"}
          </button>
          <p className="text-center text-xs text-slate-500 pt-1">
            Демо: partner / partner123 · admin / admin123
          </p>
        </form>
        <p className="mt-6 text-center">
          <Link href="/" className="text-sm text-slate-400 hover:text-cyan-300 transition">
            ← На главную
          </Link>
        </p>
      </div>
    </main>
  );
}
