"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";

const nav = [
  { href: "/admin", label: "Обзор", exact: true },
  { href: "/admin/stats", label: "Статистика" },
  { href: "/admin/clients", label: "Клиенты" },
  { href: "/admin/subscribers", label: "Подписчики" },
  { href: "/admin/partners", label: "Партнёры" },
  { href: "/admin/settings", label: "Настройки" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-surface backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-white text-xs font-bold">
                ADM
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-indigo-400 font-semibold">
                  Админ-панель
                </p>
                <p className="text-sm font-semibold text-white">РКО Партнёры</p>
              </div>
            </div>
            <nav className="flex flex-wrap gap-1 overflow-x-auto scrollbar-thin">
              {nav.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition whitespace-nowrap ${
                      active
                        ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <LogoutButton />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
