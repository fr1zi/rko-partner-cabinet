import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate, STATUS_LABELS } from "@/lib/status";
import { CopyButton } from "@/components/CopyButton";
import { EmptyState } from "@/components/EmptyState";
import { StatCard } from "@/components/StatCard";
import type { ClientStatus } from "@/lib/types";

export default async function AdminStatsPage() {
  const session = await requireSession("ADMIN");
  if (!session) redirect("/login");

  const partners = await prisma.partner.findMany({
    include: {
      user: true,
      clients: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const rows = partners.map((p) => {
    const clients = p.clients;
    const byStatus: Record<string, number> = {};
    for (const c of clients) {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    }
    const issued = clients.filter((c) =>
      ["issued", "paid"].includes(c.status)
    ).length;
    const commissionsSum = clients.reduce(
      (s, c) => s + (c.commission || 0),
      0
    );
    const paidSum = clients
      .filter((c) => c.commissionStatus === "paid")
      .reduce((s, c) => s + (c.commission || 0), 0);
    const lastLead = clients[0]?.createdAt ?? null;
    const name = p.displayName || p.user.name || p.user.username;
    const conversion =
      clients.length > 0 ? Math.round((issued / clients.length) * 100) : 0;
    return {
      id: p.id,
      name,
      refCode: p.refCode,
      telegramChannelUrl: p.telegramChannelUrl,
      telegramUsername: p.telegramUsername,
      leads: clients.length,
      byStatus,
      issued,
      conversion,
      commissionsSum,
      paidSum,
      lastLead,
      webRef: `${baseUrl}/r/${p.refCode}`,
    };
  });

  const totalLeads = rows.reduce((s, r) => s + r.leads, 0);
  const totalIssued = rows.reduce((s, r) => s + r.issued, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidSum, 0);
  const maxLeads = Math.max(...rows.map((r) => r.leads), 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="ui-page-title">Статистика по трафферам</h1>
        <p className="ui-page-sub">
          Только данные из БД — без выдуманных метрик
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Всего лидов" value={totalLeads} accent="cyan" />
        <StatCard
          label="Конверсии (выдано)"
          value={totalIssued}
          accent="indigo"
          hint={
            totalLeads
              ? `${Math.round((totalIssued / totalLeads) * 100)}% от лидов`
              : undefined
          }
        />
        <StatCard
          label="Выплачено премий"
          value={formatMoney(totalPaid)}
          accent="emerald"
        />
      </section>

      {/* Charts-lite: lead bars per traffer */}
      <section className="ui-card p-5 sm:p-6 space-y-4">
        <h2 className="ui-section-title">Лиды по трафферам</h2>
        {rows.length === 0 ? (
          <EmptyState title="Нет партнёров" />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={`bar-${r.id}`} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm gap-3">
                  <span className="font-medium text-slate-200 truncate">
                    {r.name}
                  </span>
                  <span className="text-slate-400 shrink-0">
                    {r.leads} · {r.conversion}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-surface-raised overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                    style={{
                      width: `${Math.max((r.leads / maxLeads) * 100, r.leads ? 4 : 0)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Mobile cards */}
      <div className="mobile-cards">
        {rows.map((r) => (
          <div key={r.id} className="ui-card p-4 space-y-3">
            <div>
              <div className="font-semibold text-white">{r.name}</div>
              <div className="text-xs font-mono text-cyan-400">{r.refCode}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface-raised p-2">
                <div className="text-lg font-bold text-white">{r.leads}</div>
                <div className="text-[10px] text-slate-500">лиды</div>
              </div>
              <div className="rounded-lg bg-surface-raised p-2">
                <div className="text-lg font-bold text-indigo-300">
                  {r.issued}
                </div>
                <div className="text-[10px] text-slate-500">выдано</div>
              </div>
              <div className="rounded-lg bg-surface-raised p-2">
                <div className="text-lg font-bold text-emerald-400">
                  {r.conversion}%
                </div>
                <div className="text-[10px] text-slate-500">конв.</div>
              </div>
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <div>Σ комиссий: {formatMoney(r.commissionsSum)}</div>
              <div className="text-emerald-400">
                выплачено: {formatMoney(r.paidSum)}
              </div>
              <div>
                последний лид:{" "}
                {r.lastLead ? formatDate(r.lastLead) : "—"}
              </div>
            </div>
            {r.telegramChannelUrl ? (
              <a
                href={r.telegramChannelUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-cyan-400 break-all hover:underline"
              >
                {r.telegramChannelUrl}
              </a>
            ) : null}
          </div>
        ))}
      </div>

      <div className="desktop-table ui-table-wrap scrollbar-thin">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Траффер</th>
              <th>TGK</th>
              <th>Веб-реф</th>
              <th>Лиды</th>
              <th>По статусам</th>
              <th>Конверсии</th>
              <th>Комиссии Σ</th>
              <th>Последний лид</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState title="Нет партнёров" />
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td>
                    <div className="font-medium text-white">{r.name}</div>
                    <div className="text-xs text-cyan-400 font-mono">
                      {r.refCode}
                    </div>
                    {r.telegramUsername ? (
                      <div className="text-xs text-slate-500">
                        {r.telegramUsername}
                      </div>
                    ) : null}
                  </td>
                  <td className="max-w-[180px]">
                    {r.telegramChannelUrl ? (
                      <div className="space-y-1">
                        <a
                          href={r.telegramChannelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-400 text-xs break-all hover:underline"
                        >
                          {r.telegramChannelUrl}
                        </a>
                        <CopyButton
                          text={r.telegramChannelUrl}
                          label="Копировать"
                        />
                      </div>
                    ) : (
                      <span className="text-slate-500 text-xs">—</span>
                    )}
                  </td>
                  <td>
                    <div className="font-mono text-xs text-slate-300">
                      /r/{r.refCode}
                    </div>
                    <div className="mt-1">
                      <CopyButton text={r.webRef} label="Копировать" />
                    </div>
                  </td>
                  <td className="font-semibold text-white">{r.leads}</td>
                  <td>
                    <ul className="text-xs text-slate-400 space-y-0.5">
                      {Object.entries(r.byStatus).map(([st, n]) => (
                        <li key={st}>
                          {STATUS_LABELS[st as ClientStatus] || st}:{" "}
                          <span className="text-slate-200">{n}</span>
                        </li>
                      ))}
                      {Object.keys(r.byStatus).length === 0 ? (
                        <li className="text-slate-600">нет</li>
                      ) : null}
                    </ul>
                  </td>
                  <td>
                    <div className="font-semibold text-indigo-300">
                      {r.issued}
                    </div>
                    <div className="text-xs text-slate-500">{r.conversion}%</div>
                  </td>
                  <td>
                    <div className="text-slate-200">
                      {formatMoney(r.commissionsSum)}
                    </div>
                    <div className="text-xs text-emerald-400">
                      выплачено: {formatMoney(r.paidSum)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-slate-400 text-xs">
                    {r.lastLead ? formatDate(r.lastLead) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
