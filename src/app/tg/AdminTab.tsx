"use client";

import { useEffect, useMemo, useState } from "react";
import { BANKS } from "@/lib/banks";
import {
  estimateBankCpa,
  isAdminRefAttribution,
  ownerMarginFromPayouts,
  ownerPayout,
  resolveProductPayouts,
} from "@/lib/productDefaults";
import type { AdminSubTab } from "./types";
import { LeaderboardList } from "./Leaderboard";
import {
  formatDate,
  formatProductLabel,
  isClosedLead,
  isClosedWithdrawal,
  matchesUsernameQuery,
  money,
  statusLabel,
  tgHandle,
} from "./utils";

const SUBS: Array<[AdminSubTab, string]> = [
  ["stats", "Итоги"],
  ["products", "Цены"],
  ["premiums", "Премии"],
  ["leads", "Заказы"],
  ["withdrawals", "Выводы"],
  ["users", "Юзеры"],
];

export function AdminTab({
  tab,
  setTab,
  data,
  onAction,
  loading,
  disabled,
}: {
  tab: AdminSubTab;
  setTab: (t: AdminSubTab) => void;
  data: Record<string, unknown> | null;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="tg-stack">
      <div className="tg-admin-chips">
        {SUBS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={
              tab === key ? "tg-chip tg-chip-active" : "tg-chip"
            }
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="tg-empty">Загрузка…</div>
      ) : (
        <AdminBody
          tab={tab}
          data={data}
          onAction={onAction}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function AdminBody({
  tab,
  data,
  onAction,
  disabled,
}: {
  tab: AdminSubTab;
  data: Record<string, unknown> | null;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  if (!data) return <div className="tg-empty">Нет данных</div>;

  if (tab === "stats") {
    const s = (data.stats || {}) as Record<string, unknown>;
    return (
      <div className="tg-stack">
        <div className="tg-stat-grid">
          <StatTile
            label="Подписчики"
            value={String(s.channelSubscribers ?? 0)}
            wide
          />
          <StatTile label="Трафферы" value={String(s.trafters ?? 0)} />
          <StatTile label="Клиенты" value={String(s.clients ?? 0)} />
          <StatTile label="Заявки" value={String(s.leads ?? 0)} />
          <StatTile
            label="Начислено"
            value={String(s.creditedLabel ?? "0")}
            wide
          />
          <StatTile
            label="Прибыль компании"
            value={String(s.companyProfitLabel ?? "0")}
            wide
          />
        </div>
        <LeaderboardAdminPanel
          meta={(data.leaderboardMeta || null) as LeaderboardMetaState | null}
          rows={(data.leaderboard || []) as Array<{
            rank: number;
            userId: string;
            username: string | null;
            telegramId: string;
            earned: number;
            earnedLabel: string;
            leadsPaid: number;
          }>}
          onAction={onAction}
          disabled={disabled}
        />
      </div>
    );
  }

  if (tab === "products") {
    return (
      <AdminProductsEditor
        mode="prices"
        products={(data.products || []) as AdminProductRow[]}
        onAction={onAction}
        disabled={disabled}
      />
    );
  }

  if (tab === "premiums") {
    return (
      <AdminProductsEditor
        mode="premiums"
        products={(data.products || []) as AdminProductRow[]}
        onAction={onAction}
        disabled={disabled}
      />
    );
  }

  if (tab === "leads") {
    return (
      <AdminLeadsPanel
        leads={(data.leads || []) as AdminLeadRow[]}
        onAction={onAction}
        disabled={disabled}
      />
    );
  }

  if (tab === "withdrawals") {
    return (
      <AdminWithdrawalsPanel
        list={(data.withdrawals || []) as AdminWdRow[]}
        onAction={onAction}
        disabled={disabled}
      />
    );
  }

  if (tab === "users") {
    const users = (data.users || []) as AdminUserRow[];
    if (users.length === 0) return <div className="tg-empty">Пока нет юзеров</div>;
    return (
      <AdminUsersPanel
        users={users}
        onAction={onAction}
        disabled={disabled}
      />
    );
  }

  return null;
}

type LeaderboardMetaState = {
  speech?: string;
  prize?: string;
  periodDays?: number;
  periodStart?: string;
  periodEndsAt?: string | null;
  daysLeft?: number | null;
};

function LeaderboardAdminPanel({
  meta,
  rows,
  onAction,
  disabled,
}: {
  meta: LeaderboardMetaState | null;
  rows: Array<{
    rank: number;
    userId: string;
    username: string | null;
    telegramId: string;
    earned: number;
    earnedLabel: string;
    leadsPaid: number;
  }>;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  const [speech, setSpeech] = useState(meta?.speech || "");
  const [prize, setPrize] = useState(meta?.prize || "");
  const [periodDays, setPeriodDays] = useState(
    String(meta?.periodDays ?? 30)
  );

  useEffect(() => {
    setSpeech(meta?.speech || "");
    setPrize(meta?.prize || "");
    setPeriodDays(String(meta?.periodDays ?? 30));
  }, [meta?.speech, meta?.prize, meta?.periodDays, meta?.periodStart]);

  return (
    <div className="tg-stack">
      <section className="tg-card space-y-3">
        <h3 className="tg-card-title">Лидерборд — настройки</h3>
        <label className="block space-y-1">
          <span className="tg-muted text-xs">Награда (что получает топ)</span>
          <input
            className="tg-input w-full"
            value={prize}
            disabled={disabled}
            onChange={(e) => setPrize(e.target.value)}
            placeholder="Например: AirPods / 10 000 ₽ / мерка с основателем"
          />
        </label>
        <label className="block space-y-1">
          <span className="tg-muted text-xs">Мотивационная речь</span>
          <textarea
            className="tg-input w-full min-h-[88px]"
            value={speech}
            disabled={disabled}
            onChange={(e) => setSpeech(e.target.value)}
            placeholder="Текст над таблицей лидеров"
          />
        </label>
        <label className="block space-y-1">
          <span className="tg-muted text-xs">Срок периода (дней)</span>
          <input
            className="tg-input w-full"
            type="number"
            min={1}
            max={365}
            value={periodDays}
            disabled={disabled}
            onChange={(e) => setPeriodDays(e.target.value)}
          />
        </label>
        {meta?.daysLeft != null ? (
          <p className="tg-muted text-xs">
            Сейчас осталось {meta.daysLeft} дн. до конца окна.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="tg-btn-primary"
            disabled={disabled}
            onClick={() =>
              onAction({
                action: "leaderboard_save",
                speech,
                prize,
                periodDays: Number(periodDays) || 30,
              })
            }
          >
            Сохранить
          </button>
          <button
            type="button"
            className="tg-btn-secondary"
            disabled={disabled}
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                !window.confirm(
                  "Сбросить лидерборд? Очки начнут считаться с этого момента."
                )
              ) {
                return;
              }
              void onAction({ action: "leaderboard_reset" });
            }}
          >
            Сброс периода
          </button>
        </div>
      </section>
      <section>
        <h3 className="tg-section-label">Текущий топ</h3>
        <LeaderboardList rows={rows} meta={meta} limit={10} />
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "tg-stat-tile tg-stat-wide" : "tg-stat-tile"}>
      <p className="tg-stat-label">{label}</p>
      <p className="tg-stat-value">{value}</p>
    </div>
  );
}



type AdminUserIssue = {
  id: string;
  status: string;
  productId: string;
  product: string;
  premium: number;
  orderId?: string | null;
};

type AdminUserRow = {
  id: string;
  username: string | null;
  firstName?: string | null;
  telegramId: string;
  role: string;
  balance: number;
  isBanned: boolean;
  createdAt?: string;
  refSource?: string | null;
  issues?: AdminUserIssue[];
};

type AdminLeadRow = {
  id: string;
  status: string;
  orderId?: string | null;
  referrerId?: string | null;
  fullName: string;
  phone: string;
  subscriberAmount?: number | null;
  premiumAmount?: number | null;
  adminComment?: string | null;
  product: { title: string; bank?: string; subscriberPrice?: number; reward?: number };
  client: {
    username: string | null;
    telegramId: string;
    firstName?: string | null;
    inviteLinkName?: string | null;
  };
  referrer?: {
    username: string | null;
    telegramId?: string;
    firstName?: string | null;
    role?: string | null;
  } | null;
};

type AdminWdRow = {
  id: string;
  amount: number;
  status: string;
  details: string;
  user: { username: string | null; telegramId: string };
};

function groupLeadsByOrder(leads: AdminLeadRow[]) {
  const groups: Array<{ key: string; orderId: string | null; lines: AdminLeadRow[] }> =
    [];
  const byOrder = new Map<string, AdminLeadRow[]>();
  const singles: AdminLeadRow[] = [];
  for (const l of leads) {
    if (l.orderId) {
      const list = byOrder.get(l.orderId) || [];
      list.push(l);
      byOrder.set(l.orderId, list);
    } else {
      singles.push(l);
    }
  }
  for (const [orderId, lines] of Array.from(byOrder.entries())) {
    groups.push({ key: orderId, orderId, lines });
  }
  for (const l of singles) {
    groups.push({ key: l.id, orderId: null, lines: [l] });
  }
  return groups;
}

function AdminLeadLineControls({
  l,
  onAction,
  disabled,
}: {
  l: AdminLeadRow;
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  const st =
    l.status === "new" || l.status === "duplicate"
      ? "processing"
      : l.status === "approved"
        ? "awaiting_payout"
        : l.status;
  const adminRefResolved =
    isAdminRefAttribution({
      referrerId: l.referrerId ?? null,
      referrerRole: l.referrer?.role,
      inviteLinkName: l.client.inviteLinkName,
    }) || (!l.referrer && (l.referrerId == null || l.referrerId === ""));
  const split = resolveProductPayouts(
    l.product.subscriberPrice ?? 0,
    l.product.reward ?? 0,
    { adminRef: adminRefResolved }
  );
  const rawSub = l.subscriberAmount;
  const looksLikeLegacyCpa =
    split.legacy &&
    rawSub != null &&
    Math.abs(Number(rawSub) - split.bankCpa) < 0.01;
  const defAmt =
    rawSub != null && rawSub > 0 && !looksLikeLegacyCpa
      ? Number(rawSub)
      : split.subscriber;
  const prem = adminRefResolved ? 0 : l.premiumAmount ?? split.traffer;
  const ours = split.owner;
  const productLabel = formatProductLabel(l.product.title, l.product.bank);
  const removedHint =
    (l.adminComment || "").startsWith("Удалено из чека") && st === "rejected";

  return (
    <div className="space-y-2 rounded-xl border border-white/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{productLabel} ×1</p>
          {l.phone ? (
            <p className="tg-muted text-xs mt-0.5">{l.phone}</p>
          ) : null}
        </div>
        <span className={`tg-status tg-status-${st} shrink-0`}>
          {statusLabel(st)}
        </span>
      </div>
      <div className="tg-edit-block">
        <label className="tg-label">Сумма подписчику, ₽</label>
        <input
          className="tg-input"
          type="number"
          defaultValue={defAmt}
          disabled={disabled}
          id={`amt-${l.id}`}
        />
        <p className="tg-muted text-xs">
          {adminRefResolved
            ? `Рефка Админы · нам 55%: ${money(ours)} · подписчику 45%: ${money(defAmt)} · CPA: ${money(split.bankCpa)}`
            : `Премия траффера: ${money(prem)} · нам: ${money(ours)} · CPA: ${money(split.bankCpa)}`}
        </p>
        {removedHint ? (
          <p className="tg-muted text-xs">Удалено из чека · {l.adminComment}</p>
        ) : l.adminComment ? (
          <p className="tg-muted text-xs">{l.adminComment}</p>
        ) : null}
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="tg-btn-secondary text-xs"
          disabled={disabled || st === "processing"}
          onClick={() =>
            void onAction({
              action: "lead_set_status",
              id: l.id,
              status: "processing",
            })
          }
        >
          В обработке
        </button>
        <button
          type="button"
          className="tg-btn-primary text-xs"
          disabled={disabled || st === "awaiting_payout"}
          onClick={() => {
            const el = document.getElementById(
              `amt-${l.id}`
            ) as HTMLInputElement | null;
            void onAction({
              action: "lead_set_status",
              id: l.id,
              status: "awaiting_payout",
              subscriberAmount: Number(el?.value || defAmt),
            });
          }}
        >
          Ждём выплату
        </button>
        <button
          type="button"
          className="tg-btn-primary text-xs"
          disabled={disabled || st === "paid"}
          onClick={() => {
            const el = document.getElementById(
              `amt-${l.id}`
            ) as HTMLInputElement | null;
            void onAction({
              action: "lead_set_status",
              id: l.id,
              status: "paid",
              subscriberAmount: Number(el?.value || defAmt),
            });
          }}
        >
          Выплачено
        </button>
        <button
          type="button"
          className="tg-btn-secondary text-xs"
          disabled={disabled || st === "rejected"}
          onClick={() => {
            const comment = prompt("Почему не прошло") || "не прошло";
            void onAction({
              action: "lead_set_status",
              id: l.id,
              status: "rejected",
              comment,
            });
          }}
        >
          Не прошло
        </button>
        <button
          type="button"
          className="tg-btn-secondary text-xs"
          disabled={disabled || st === "rejected"}
          onClick={() => {
            const reason = String(
              prompt("Причина удаления из чека (обязательно)") || ""
            ).trim();
            if (!reason) {
              alert("Нужна причина — удаление отменено");
              return;
            }
            void onAction({
              action: "remove_order_line",
              leadId: l.id,
              reason,
            });
          }}
        >
          Удалить из чека
        </button>
      </div>
    </div>
  );
}

function groupUserIssuesByOrder(issues: AdminUserIssue[]) {
  const groups: Array<{
    key: string;
    orderId: string | null;
    lines: AdminUserIssue[];
  }> = [];
  const byOrder = new Map<string, AdminUserIssue[]>();
  const singles: AdminUserIssue[] = [];
  for (const iss of issues) {
    if (iss.orderId) {
      const list = byOrder.get(iss.orderId) || [];
      list.push(iss);
      byOrder.set(iss.orderId, list);
    } else {
      singles.push(iss);
    }
  }
  for (const [orderId, lines] of Array.from(byOrder.entries())) {
    groups.push({ key: orderId, orderId, lines });
  }
  for (const iss of singles) {
    groups.push({ key: iss.id, orderId: null, lines: [iss] });
  }
  return groups;
}

function AdminUsersPanel({
  users,
  onAction,
  disabled,
}: {
  users: AdminUserRow[];
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  const [historyId, setHistoryId] = useState<string | null>(null);

  return (
    <div className="tg-stack">
      <p className="tg-note-plate">
        База юзеров: роль, рефка, бан. Оформление чека — во вкладке «Люди».
        Здесь можно посмотреть историю заявок.
      </p>
      {users.map((u) => {
        const isAdm = u.role === "admin";
        const roleRu =
          u.role === "admin"
            ? "админ"
            : u.role === "traffer"
              ? "траффер"
              : "подписчик";
        const issues = u.issues || [];
        const groups = groupUserIssuesByOrder(issues);
        const viewing = historyId === u.id;
        return (
          <div key={u.id} className="tg-card space-y-3">
            <div>
              <p className="tg-card-title">
                {u.isBanned ? "🚫 " : ""}
                {tgHandle(u.username, u.telegramId)}
              </p>
              <p className="tg-muted text-sm mt-1">
                {roleRu} · рефка: {u.refSource || "Админы"}
              </p>
              <p className="tg-muted text-xs mt-1">
                {u.createdAt ? formatDate(u.createdAt) : ""}
                {u.balance != null ? ` · баланс ${money(u.balance)}` : ""}
              </p>
            </div>

            <button
              type="button"
              className="tg-btn-secondary text-xs w-full"
              onClick={() =>
                setHistoryId((cur) => (cur === u.id ? null : u.id))
              }
            >
              {viewing ? "Скрыть историю" : "История заявок"}
              {issues.length > 0 ? ` · ${issues.length}` : ""}
            </button>

            {viewing ? (
              <div className="space-y-2">
                {groups.length === 0 ? (
                  <p className="tg-muted text-xs">Заявок пока нет</p>
                ) : (
                  groups.map((g) => (
                    <div key={g.key} className="space-y-1">
                      <p className="tg-muted text-xs">
                        {g.orderId
                          ? `Чек ${g.orderId.slice(0, 12)}… · ${g.lines.length}`
                          : "Без чека"}
                      </p>
                      {g.lines.map((iss) => (
                        <div
                          key={iss.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="truncate">{iss.product} ×1</span>
                          <span className="tg-muted text-xs shrink-0">
                            {money(iss.premium)} · {statusLabel(iss.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {!isAdm ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="tg-btn-secondary text-xs flex-1"
                  disabled={disabled || u.role === "traffer"}
                  onClick={() =>
                    void onAction({
                      action: "user_set_role",
                      id: u.id,
                      role: "traffer",
                    })
                  }
                >
                  сделать траффером
                </button>
                <button
                  type="button"
                  className="tg-btn-secondary text-xs flex-1"
                  disabled={
                    disabled ||
                    u.role === "subscriber" ||
                    u.role === "client"
                  }
                  onClick={() =>
                    void onAction({
                      action: "user_set_role",
                      id: u.id,
                      role: "subscriber",
                    })
                  }
                >
                  сделать подписчиком
                </button>
              </div>
            ) : (
              <p className="tg-muted text-xs">Админ канала — роль не меняется</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="tg-btn-secondary text-xs flex-1"
                disabled={disabled}
                onClick={() => void onAction({ action: "user_ban", id: u.id })}
              >
                {u.isBanned ? "Разбан" : "Бан"}
              </button>
              <button
                type="button"
                className="tg-btn-secondary text-xs flex-1"
                disabled={disabled}
                onClick={() => {
                  const amount = Number(
                    prompt("Корректировка баланса (±)") || 0
                  );
                  if (amount)
                    void onAction({
                      action: "user_adjust",
                      id: u.id,
                      amount,
                    });
                }}
              >
                Баланс ±
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdminLeadsPanel({
  leads,
  onAction,
  disabled,
}: {
  leads: AdminLeadRow[];
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState<"open" | "closed">("open");
  const groups = useMemo(() => {
    const matched = leads.filter((l) =>
      matchesUsernameQuery(
        q,
        l.client.username,
        l.client.telegramId,
        l.fullName
      )
    );
    // Keep full чек together: include sibling lines of the same orderId
    const orderIds = new Set(
      matched.map((l) => l.orderId).filter((x): x is string => Boolean(x))
    );
    const withSiblings = leads.filter(
      (l) =>
        matched.some((m) => m.id === l.id) ||
        (l.orderId != null && orderIds.has(l.orderId))
    );
    const allGroups = groupLeadsByOrder(withSiblings);
    return allGroups.filter((g) => {
      const anyOpen = g.lines.some((l) => !isClosedLead(l.status));
      if (bucket === "open") return anyOpen;
      return !anyOpen;
    });
  }, [leads, q, bucket]);

  return (
    <div className="tg-stack">
      <p className="tg-note-plate">
        Заказы по продуктам. Чек группирует позиции — у каждой свой статус и
        сумма. Открытые — в работе; закрытые — выплачено или отклонено.
      </p>
      <input
        className="tg-input"
        placeholder="Поиск @username"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="tg-admin-chips">
        <button
          type="button"
          className={bucket === "open" ? "tg-chip tg-chip-active" : "tg-chip"}
          onClick={() => setBucket("open")}
        >
          Открытые
        </button>
        <button
          type="button"
          className={bucket === "closed" ? "tg-chip tg-chip-active" : "tg-chip"}
          onClick={() => setBucket("closed")}
        >
          Закрытые
        </button>
      </div>
      {groups.length === 0 ? (
        <div className="tg-empty">Нет заказов</div>
      ) : (
        groups.map((g) => {
          const head = g.lines[0];
          const who = tgHandle(head.client.username, head.client.telegramId);
          const refName = head.referrer
            ? tgHandle(head.referrer.username, head.referrer.telegramId)
            : "Админы";
          return (
            <div key={g.key} className="tg-card space-y-3">
              <div>
                <p className="tg-card-title">{who}</p>
                {head.fullName && !String(head.fullName).startsWith("@") ? (
                  <p className="tg-muted text-xs mt-1">
                    ФИО в заявке: {head.fullName}
                  </p>
                ) : null}
                <p className="tg-muted text-xs mt-1">рефка: {refName}</p>
                {g.orderId ? (
                  <p className="tg-muted text-xs mt-1">
                    Чек · {g.lines.length} поз. · {g.orderId.slice(0, 14)}…
                  </p>
                ) : (
                  <p className="tg-muted text-xs mt-1">Одна позиция</p>
                )}
              </div>
              {g.lines.map((l) => (
                <AdminLeadLineControls
                  key={l.id}
                  l={l}
                  onAction={onAction}
                  disabled={disabled}
                />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

function AdminWithdrawalsPanel({
  list,
  onAction,
  disabled,
}: {
  list: AdminWdRow[];
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState<"open" | "closed">("open");
  const filtered = useMemo(() => {
    return list.filter((w) => {
      const closed = isClosedWithdrawal(w.status);
      if (bucket === "open" && closed) return false;
      if (bucket === "closed" && !closed) return false;
      return matchesUsernameQuery(q, w.user.username, w.user.telegramId);
    });
  }, [list, q, bucket]);

  return (
    <div className="tg-stack">
      <p className="tg-note-plate">
        Выплаченные и отклонённые выводы — в «Закрытые». Поиск по @username.
      </p>
      <input
        className="tg-input"
        placeholder="Поиск @username"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="tg-admin-chips">
        <button
          type="button"
          className={bucket === "open" ? "tg-chip tg-chip-active" : "tg-chip"}
          onClick={() => setBucket("open")}
        >
          Открытые
        </button>
        <button
          type="button"
          className={bucket === "closed" ? "tg-chip tg-chip-active" : "tg-chip"}
          onClick={() => setBucket("closed")}
        >
          Закрытые
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="tg-empty">Нет выводов</div>
      ) : (
        filtered.map((w) => (
          <div key={w.id} className="tg-card space-y-3">
            <div>
              <p className="tg-card-title">{money(w.amount)}</p>
              <p className="tg-muted text-sm mt-1">
                {tgHandle(w.user.username, w.user.telegramId)} ·{" "}
                {statusLabel(w.status)}
              </p>
              <p className="tg-muted text-xs mt-1">{w.details}</p>
            </div>
            {!isClosedWithdrawal(w.status) ? (
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  className="tg-btn-secondary text-xs"
                  disabled={disabled}
                  onClick={() =>
                    void onAction({ action: "wd_approve", id: w.id })
                  }
                >
                  Одобрить
                </button>
                <button
                  type="button"
                  className="tg-btn-secondary text-xs"
                  disabled={disabled}
                  onClick={() =>
                    void onAction({ action: "wd_reject", id: w.id })
                  }
                >
                  Отклонить
                </button>
                <button
                  type="button"
                  className="tg-btn-primary text-xs"
                  disabled={disabled}
                  onClick={() => void onAction({ action: "wd_paid", id: w.id })}
                >
                  Выплачено
                </button>
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

type AdminProductRow = {
  id: string;
  title: string;
  bank?: string;
  reward: number;
  subscriberPrice: number;
  bankCpa?: number;
  ownerMargin?: number;
  isActive: boolean;
  isHot: boolean;
};

function AdminProductsEditor({
  mode,
  products,
  onAction,
  disabled,
}: {
  mode: "prices" | "premiums";
  products: AdminProductRow[];
  onAction: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}) {
  const [bank, setBank] = useState<string>(BANKS[0].label);
  const isPrices = mode === "prices";

  const bankOptions = useMemo(() => {
    const present = new Set(
      products.map((p) => p.bank || "").filter(Boolean)
    );
    const known = BANKS.filter((b) => present.has(b.label));
    const extras = Array.from(present)
      .filter((label) => !BANKS.some((b) => b.label === label))
      .sort()
      .map((label) => ({ key: label, label, short: label }));
    return [...known, ...extras];
  }, [products]);

  useEffect(() => {
    if (bankOptions.length === 0) return;
    if (!bankOptions.some((b) => b.label === bank)) {
      setBank(bankOptions[0].label);
    }
  }, [bankOptions, bank]);

  const filtered = useMemo(() => {
    return products.filter((p) => (p.bank || "") === bank);
  }, [products, bank]);

  return (
    <div className="tg-stack">
      <p className="tg-note-plate">
        {isPrices
          ? "CPA банка → 10/45/45. Наша премия 45% считается сама. Ручная цена — опционально."
          : "CPA банка → 10/45/45. Наша премия 45% считается сама. Ручная премия трафферу — опционально."}
      </p>
      <div className="tg-bank-filters" role="tablist" aria-label="Банки">
        {bankOptions.map((b) => (
          <button
            key={b.key}
            type="button"
            className={bank === b.label ? "tg-chip tg-chip-active" : "tg-chip"}
            onClick={() => setBank(b.label)}
          >
            {b.short}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="tg-empty">
          <p>Нет продуктов для этого банка</p>
        </div>
      ) : (
        filtered.map((p) => {
          const sub = p.subscriberPrice ?? 0;
          const prem = p.reward ?? 0;
          const cpa =
            p.bankCpa && p.bankCpa > 0
              ? p.bankCpa
              : estimateBankCpa(sub, prem) || Math.round(sub + prem);
          const ours =
            p.ownerMargin && p.ownerMargin > 0
              ? p.ownerMargin
              : ownerMarginFromPayouts(sub, prem) || ownerPayout(cpa);
          return (
            <div key={p.id} className="tg-card space-y-3">
              <div className="tg-product-title-row">
                <div className="min-w-0 flex-1">
                  <p className="tg-card-title">{p.title}</p>
                  {p.bank ? <p className="tg-product-bank">{p.bank}</p> : null}
                </div>
                {p.isHot ? <span className="tg-hot-badge">HOT</span> : null}
                <span
                  className={
                    p.isActive
                      ? "tg-status tg-status-approved"
                      : "tg-status tg-status-none"
                  }
                >
                  {p.isActive ? "Вкл" : "Выкл"}
                </span>
              </div>
              <div className="tg-stat-grid">
                <div className="tg-stat-tile">
                  <p className="tg-stat-label">Подписчик</p>
                  <p className="tg-stat-value text-base">{money(sub)}</p>
                </div>
                <div className="tg-stat-tile">
                  <p className="tg-stat-label">Траффер</p>
                  <p className="tg-stat-value text-base">{money(prem)}</p>
                </div>
                <div className="tg-stat-tile tg-stat-wide">
                  <p className="tg-stat-label">Наша премия (45%)</p>
                  <p className="tg-stat-value text-base text-money">
                    {money(ours)}
                  </p>
                </div>
              </div>
              <div className="tg-edit-block">
                <label className="tg-label">CPA банка, ₽</label>
                <input
                  className="tg-input"
                  type="number"
                  defaultValue={cpa}
                  disabled={disabled}
                  id={`cpa-${p.id}`}
                />
                <p className="tg-muted text-xs mt-1">
                  10% траффер · 45% подписчик · 45% нам
                </p>
              </div>
              <button
                type="button"
                className="tg-btn-primary w-full text-sm"
                disabled={disabled}
                onClick={() => {
                  const el = document.getElementById(
                    `cpa-${p.id}`
                  ) as HTMLInputElement | null;
                  const bankCpa = Number(el?.value || cpa);
                  void onAction({
                    action: "product_set_cpa",
                    id: p.id,
                    bankCpa,
                  });
                }}
              >
                Применить 10/45/45 от CPA
              </button>
              <div className="tg-edit-block">
                <label className="tg-label">
                  {isPrices ? "Цена для подписчика, ₽" : "Премия трафферу, ₽"}
                </label>
                <input
                  className="tg-input"
                  type="number"
                  defaultValue={
                    isPrices ? p.subscriberPrice ?? p.reward : p.reward
                  }
                  disabled={disabled}
                  id={`${isPrices ? "price" : "prem"}-${p.id}`}
                />
              </div>
              <button
                type="button"
                className="tg-btn-secondary w-full text-sm"
                disabled={disabled}
                onClick={() => {
                  const el = document.getElementById(
                    `${isPrices ? "price" : "prem"}-${p.id}`
                  ) as HTMLInputElement | null;
                  if (isPrices) {
                    const subscriberPrice = Number(
                      el?.value || p.subscriberPrice || p.reward
                    );
                    void onAction({
                      action: "product_update",
                      id: p.id,
                      subscriberPrice,
                    });
                  } else {
                    const reward = Number(el?.value || p.reward);
                    void onAction({
                      action: "product_update",
                      id: p.id,
                      reward,
                    });
                  }
                }}
              >
                {isPrices
                  ? "Сохранить только цену"
                  : "Сохранить только премию"}
              </button>
              {isPrices ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="tg-btn-secondary text-xs flex-1"
                    disabled={disabled}
                    onClick={() =>
                      void onAction({ action: "product_toggle", id: p.id })
                    }
                  >
                    {p.isActive ? "Выключить" : "Включить"}
                  </button>
                  <button
                    type="button"
                    className="tg-btn-secondary text-xs flex-1"
                    disabled={disabled}
                    onClick={() =>
                      void onAction({
                        action: "product_hot",
                        id: p.id,
                        isHot: !p.isHot,
                        hotText: "Акция",
                        days: 7,
                      })
                    }
                  >
                    {p.isHot ? "Снять HOT" : "HOT 7д"}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
