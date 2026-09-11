import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALL_STATUSES, formatDate, formatMoney } from "@/lib/status";
import { StatusBadge, CommissionBadge } from "@/components/StatusBadge";
import { ClientEditor } from "./ClientEditor";
import { CreateLeadForm } from "./CreateLeadForm";
import { StatusFilterChips } from "@/components/FilterChips";
import { EmptyState } from "@/components/EmptyState";
import { getActiveProductRates } from "@/lib/products";
import type { ClientStatus, CommissionStatus } from "@/lib/types";

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await requireSession("ADMIN");
  if (!session) redirect("/login");

  const statusFilter = searchParams.status as ClientStatus | undefined;
  const [clients, rates, partners] = await Promise.all([
    prisma.client.findMany({
      where:
        statusFilter && ALL_STATUSES.includes(statusFilter)
          ? { status: statusFilter }
          : undefined,
      include: {
        partner: { include: { user: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getActiveProductRates(),
    prisma.partner.findMany({
      where: { active: true },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const productOptions = rates.map((r) => ({
    name: r.productName,
    premium: r.premium,
  }));

  const partnerOptions = partners.map((p) => ({
    id: p.id,
    label: p.displayName || p.user.name || p.user.username,
    refCode: p.refCode,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="ui-page-title">Клиенты</h1>
        <p className="ui-page-sub">
          Лиды из Telegram · админ задаёт статусы и премии вручную
        </p>
      </div>

      <CreateLeadForm partners={partnerOptions} products={productOptions} />

      <StatusFilterChips basePath="/admin/clients" active={statusFilter} />

      {/* Mobile cards */}
      <div className="mobile-cards">
        {clients.length === 0 ? (
          <div className="ui-card">
            <EmptyState title="Клиентов нет" description="Измените фильтр или дождитесь новых лидов" />
          </div>
        ) : (
          clients.map((c) => {
            const trafferName =
              c.partner.displayName ||
              c.partner.user.name ||
              c.partner.user.username;
            return (
              <div key={c.id} className="ui-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">{c.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {c.phone}
                      {c.inn ? ` · ИНН ${c.inn}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={c.status as ClientStatus} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">Траффер</div>
                    <div className="text-slate-200">{trafferName}</div>
                    <div className="text-xs font-mono text-cyan-400/80">
                      /r/{c.partner.refCode}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Продукт / премия</div>
                    <div className="text-slate-200">{c.product}</div>
                    <div className="font-semibold text-emerald-400">
                      {formatMoney(c.commission)}
                    </div>
                  </div>
                </div>
                {c.comment ? (
                  <p className="text-xs text-slate-500">{c.comment}</p>
                ) : null}
                <ClientEditor
                  id={c.id}
                  status={c.status as ClientStatus}
                  commission={c.commission ?? 0}
                  commissionStatus={c.commissionStatus as CommissionStatus}
                  amount={c.amount}
                  product={c.product}
                  productOptions={productOptions}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="desktop-table ui-table-wrap scrollbar-thin">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Имя траффера</th>
              <th>Продукт</th>
              <th>Премия</th>
              <th>Статус</th>
              <th>Управление</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title="Клиентов нет"
                    description="Измените фильтр или дождитесь новых лидов"
                  />
                </td>
              </tr>
            ) : (
              clients.map((c) => {
                const trafferName =
                  c.partner.displayName ||
                  c.partner.user.name ||
                  c.partner.user.username;
                return (
                  <tr key={c.id} className="align-top">
                    <td>
                      <div className="font-semibold text-white">{c.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {c.phone}
                        {c.inn ? ` · ИНН ${c.inn}` : ""}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {formatDate(c.createdAt)}
                      </div>
                      {c.comment ? (
                        <p className="text-xs text-slate-500 mt-2 max-w-xs">
                          {c.comment}
                        </p>
                      ) : null}
                    </td>
                    <td>
                      <div className="font-medium text-white">{trafferName}</div>
                      <div className="text-xs font-mono text-cyan-400/80">
                        /r/{c.partner.refCode}
                      </div>
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
                      {c.amount != null ? (
                        <div className="text-xs text-slate-500 mt-1">
                          сумма: {formatMoney(c.amount)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge status={c.status as ClientStatus} />
                    </td>
                    <td>
                      <ClientEditor
                        id={c.id}
                        status={c.status as ClientStatus}
                        commission={c.commission ?? 0}
                        commissionStatus={
                          c.commissionStatus as CommissionStatus
                        }
                        amount={c.amount}
                        product={c.product}
                        productOptions={productOptions}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
