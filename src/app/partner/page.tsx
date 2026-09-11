import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "@/components/LogoutButton";
import { StatCard } from "@/components/StatCard";
import { StatusBadge, CommissionBadge } from "@/components/StatusBadge";
import { CopyLink } from "@/components/CopyLink";
import { PriceList } from "@/components/PriceList";
import { EmptyState } from "@/components/EmptyState";
import { StatusFilterChips } from "@/components/FilterChips";
import { formatMoney, formatDate, ALL_STATUSES } from "@/lib/status";
import { getActiveProductRates } from "@/lib/products";
import {
  getBotDeepLink,
  isBotConfigured,
  isChannelInviteConfigured,
} from "@/lib/telegram";
import type { ClientStatus, CommissionStatus } from "@/lib/types";

export default async function PartnerDashboard({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await requireSession("PARTNER");
  if (!session || !session.partnerId) redirect("/login");

  const partner = await prisma.partner.findUnique({
    where: { id: session.partnerId },
    include: {
      user: true,
      _count: { select: { subscribers: true } },
    },
  });
  if (!partner) redirect("/login");

  const statusFilter = searchParams.status as ClientStatus | undefined;
  const where = {
    partnerId: partner.id,
    ...(statusFilter && ALL_STATUSES.includes(statusFilter)
      ? { status: statusFilter }
      : {}),
  };

  const [clients, allClients, rates] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({ where: { partnerId: partner.id } }),
    getActiveProductRates(),
  ]);

  const total = allClients.length;
  const issued = allClients.filter((c) =>
    ["issued", "paid"].includes(c.status)
  ).length;
  const earned = allClients
    .filter((c) => c.commissionStatus === "paid")
    .reduce((s, c) => s + (c.commission || 0), 0);
  const pending = allClients
    .filter((c) => c.commissionStatus === "pending" && c.status !== "rejected")
    .reduce((s, c) => s + (c.commission || 0), 0);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webRef = `${baseUrl}/r/${partner.refCode}`;
  const botDeep = getBotDeepLink(partner.refCode);
  const primaryLink =
    partner.telegramInviteLink ||
    partner.telegramChannelUrl ||
    (isBotConfigured() ? botDeep : null) ||
    webRef;
  const primaryKind = partner.telegramInviteLink
    ? "invite"
    : partner.telegramChannelUrl
      ? "tgk"
      : isBotConfigured() && botDeep
        ? "bot"
        : "web";
  const trafferName =
    partner.displayName || partner.user.name || partner.user.username;
  const subCount = partner._count.subscribers;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-surface backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">
              РКО
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-400 font-semibold">
                Кабинет партнёра
              </p>
              <h1 className="text-base font-semibold text-white truncate">
                {trafferName}
              </h1>
            </div>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <PriceList rates={rates} compact />

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Людей в работе" value={total} accent="cyan" />
          <StatCard label="Выдано / оплачено" value={issued} accent="indigo" />
          <StatCard
            label="Выплачено премий"
            value={formatMoney(earned)}
            accent="emerald"
          />
          <StatCard
            label="Подписчики канала"
            value={subCount}
            accent="amber"
          />
        </section>

        <section className="ui-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h2 className="ui-section-title">Ваша ссылка</h2>
              <p className="text-sm text-slate-400 mt-1">
                Одна персональная ссылка для привлечения. Лиды и статусы ведутся
                в Telegram / админом — без форм на сайте.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-slate-500">Реф. код</div>
              <div className="font-mono font-medium text-cyan-300">
                {partner.refCode}
              </div>
            </div>
          </div>

          <CopyLink url={primaryLink || webRef} />

          <div className="flex flex-wrap gap-2 text-xs">
            {primaryKind === "invite" ? (
              <span className="ui-badge bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30">
                Invite канала
                {partner.telegramInviteLinkName
                  ? ` · ${partner.telegramInviteLinkName}`
                  : ""}
              </span>
            ) : primaryKind === "tgk" ? (
              <span className="ui-badge bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30">
                TGK
              </span>
            ) : primaryKind === "bot" ? (
              <span className="ui-badge bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
                Deep-link бота
              </span>
            ) : (
              <span className="ui-badge bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/30">
                Веб-реф /r/{partner.refCode}
              </span>
            )}
            {!isChannelInviteConfigured() && !partner.telegramInviteLink ? (
              <span className="text-amber-400/90">
                Авто-invite появится после подключения бота к каналу
              </span>
            ) : null}
          </div>

          {partner.telegramUsername ? (
            <p className="text-sm text-slate-400">
              Ваш Telegram:{" "}
              <span className="text-slate-200">{partner.telegramUsername}</span>
            </p>
          ) : null}

          <p className="text-xs text-slate-500">
            Подписчиков по вашей invite-ссылке:{" "}
            <span className="text-slate-300 font-medium">{subCount}</span>
            {" · "}ожидает выплаты: {formatMoney(pending)}
          </p>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="ui-section-title">Ваши люди</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Статусы и премии выставляет администратор по факту открытия
                продукта
              </p>
            </div>
            <StatusFilterChips basePath="/partner" active={statusFilter} />
          </div>

          <div className="mobile-cards">
            {clients.length === 0 ? (
              <div className="ui-card">
                <EmptyState
                  title="Пока никого нет"
                  description="Делитесь своей ссылкой в Telegram — админ занесёт лиды и статусы"
                />
              </div>
            ) : (
              clients.map((c) => (
                <div key={c.id} className="ui-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">{c.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {c.phone}
                      </div>
                    </div>
                    <StatusBadge status={c.status as ClientStatus} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-400">{c.product}</span>
                    <span className="text-slate-600">·</span>
                    <span className="font-semibold text-emerald-400">
                      {formatMoney(c.commission)}
                    </span>
                    <CommissionBadge
                      status={c.commissionStatus as CommissionStatus}
                    />
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatDate(c.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="desktop-table ui-table-wrap scrollbar-thin">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Человек</th>
                  <th>Дата</th>
                  <th>Статус</th>
                  <th>Продукт</th>
                  <th>Премия</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        title="Пока никого нет"
                        description="Делитесь своей ссылкой в Telegram — админ занесёт лиды и статусы"
                      />
                    </td>
                  </tr>
                ) : (
                  clients.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="font-medium text-white">{c.name}</div>
                        <div className="text-xs text-slate-500">{c.phone}</div>
                      </td>
                      <td className="text-slate-400 whitespace-nowrap">
                        {formatDate(c.createdAt)}
                      </td>
                      <td>
                        <StatusBadge status={c.status as ClientStatus} />
                      </td>
                      <td className="text-slate-300">{c.product}</td>
                      <td>
                        <div className="font-semibold text-emerald-400">
                          {formatMoney(c.commission)}
                        </div>
                        <div className="mt-1">
                          <CommissionBadge
                            status={c.commissionStatus as CommissionStatus}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
