import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMoney, formatDate, STATUS_LABELS } from "@/lib/status";
import { getActiveProductRates } from "@/lib/products";
import { PriceList } from "@/components/PriceList";
import { EmptyState } from "@/components/EmptyState";
import type { ClientStatus } from "@/lib/types";
import Link from "next/link";

export default async function AdminHome() {
  const session = await requireSession("ADMIN");
  if (!session) redirect("/login");

  const [partners, recentClients, settings, rates, allClients] =
    await Promise.all([
      prisma.partner.count(),
      prisma.client.findMany({
        include: { partner: { include: { user: true } } },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.settings.findUnique({ where: { id: "default" } }),
      getActiveProductRates(),
      prisma.client.findMany(),
    ]);

  const byStatus = allClients.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  const paidComm = allClients
    .filter((c) => c.commissionStatus === "paid")
    .reduce((s, c) => s + (c.commission || 0), 0);

  const issued = allClients.filter((c) =>
    ["issued", "paid"].includes(c.status)
  ).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="ui-page-title">Обзор</h1>
        <p className="ui-page-sub">
          Запасная премия: {formatMoney(settings?.defaultCommission ?? 3500)} ·{" "}
          выдано продуктов: {issued}
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Партнёры / трафферы" value={partners} accent="indigo" />
        <StatCard label="Клиенты" value={allClients.length} accent="cyan" />
        <StatCard label="Новые заявки" value={byStatus["new"] || 0} accent="amber" />
        <StatCard
          label="Выплачено премий"
          value={formatMoney(paidComm)}
          accent="emerald"
        />
      </section>

      {/* Status breakdown cards */}
      <section className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {(Object.keys(STATUS_LABELS) as ClientStatus[]).map((st) => {
          const n = byStatus[st] || 0;
          const max = Math.max(allClients.length, 1);
          const pct = Math.round((n / max) * 100);
          return (
            <div key={st} className="ui-card p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <StatusBadge status={st} />
                <span className="text-sm font-bold text-white">{n}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
                <div
                  className="h-full rounded-full bg-cyan-500/70"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </section>

      <PriceList rates={rates} compact title="Текущий прайс премий" />

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/clients" className="ui-btn-primary">
          Управление клиентами
        </Link>
        <Link href="/admin/stats" className="ui-btn-secondary">
          Статистика трафферов
        </Link>
        <Link href="/admin/partners" className="ui-btn-secondary">
          Профили партнёров
        </Link>
        <Link href="/admin/settings" className="ui-btn-secondary">
          Редактировать прайс
        </Link>
      </div>

      <section className="ui-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-white">Последние заявки</h2>
          <Link
            href="/admin/clients"
            className="text-xs text-cyan-400 hover:text-cyan-300"
          >
            Все клиенты →
          </Link>
        </div>
        {recentClients.length === 0 ? (
          <EmptyState
            title="Заявок пока нет"
            description="Новые лиды появятся здесь после заполнения реф. форм"
          />
        ) : (
          <>
            <div className="mobile-cards p-4">
              {recentClients.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-border bg-surface-raised p-3 space-y-1"
                >
                  <div className="font-medium text-white">{c.name}</div>
                  <div className="text-xs text-slate-400">
                    {c.partner.displayName ||
                      c.partner.user.name ||
                      c.partner.user.username}
                    {" · "}
                    {c.product}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <StatusBadge status={c.status as ClientStatus} />
                    <span className="text-sm font-semibold text-emerald-400">
                      {formatMoney(c.commission)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="desktop-table overflow-x-auto scrollbar-thin">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Клиент</th>
                    <th>Траффер</th>
                    <th>Продукт</th>
                    <th>Статус</th>
                    <th>Премия</th>
                    <th>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {recentClients.map((c) => (
                    <tr key={c.id}>
                      <td className="font-medium text-white">{c.name}</td>
                      <td className="text-slate-300">
                        {c.partner.displayName ||
                          c.partner.user.name ||
                          c.partner.user.username}
                      </td>
                      <td className="text-slate-400">{c.product}</td>
                      <td>
                        <StatusBadge status={c.status as ClientStatus} />
                      </td>
                      <td className="font-medium text-emerald-400">
                        {formatMoney(c.commission)}
                      </td>
                      <td className="text-slate-500 whitespace-nowrap text-xs">
                        {formatDate(c.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
