"use client";

import { useEffect, useMemo, useState } from "react";
import { BANKS } from "@/lib/banks";
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
        <section>
          <h3 className="tg-section-label">Лидерборд трафферов</h3>
          <LeaderboardList
            rows={(data.leaderboard || []) as Array<{
              rank: number;
              userId: string;
              username: string | null;
              telegramId: string;
              earned: number;
              earnedLabel: string;
              leadsPaid: number;
            }>}
            limit={10}
          />
        </section>
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
    const users = (data.users || []) as Array<{
      id: string;
      username: string | null;
      firstName?: string | null;
      telegramId: string;
      role: string;
      balance: number;
      isBanned: boolean;
      createdAt?: string;
      refSource?: string | null;
      issues?: Array<{
        id: string;
        status: string;
        productId: string;
        product: string;
        premium: number;
      }>;
    }>;
    const products = (data.products || []) as Array<{
      id: string;
      title: string;
      reward: number;
    }>;
    if (users.length === 0) return <div className="tg-empty">Пока нет юзеров</div>;
    return (
      <div className="tg-stack">
        <p className="tg-note-plate">
          Общая база: заход и чья рефка. Оформление ставится вручную — одно
          или все продукты. Премия уходит трафферу.
        </p>
        {users.map((u) => {
          const isAdm = u.role === "admin";
          const issued = new Set((u.issues || []).map((x) => x.productId));
          const left = products.filter((p) => !issued.has(p.id));
          const roleRu =
            u.role === "admin"
              ? "админ"
              : u.role === "traffer"
                ? "траффер"
                : "подписчик";
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
                </p>
              </div>
              {(u.issues || []).length > 0 ? (
                <div className="space-y-1">
                  {(u.issues || []).map((iss) => (
                    <p key={iss.id} className="text-xs">
                      {iss.product} · {money(iss.premium)} · {iss.status}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="tg-muted text-xs">Продукты не оформлены</p>
              )}
              {!isAdm && left.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {left.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="tg-btn-secondary text-xs"
                      disabled={disabled}
                      onClick={() =>
                        void onAction({
                          action: "issue_products",
                          userId: u.id,
                          productId: p.id,
                        })
                      }
                    >
                      {p.title}
                    </button>
                  ))}
                  {left.length > 1 ? (
                    <button
                      type="button"
                      className="tg-btn-primary text-xs"
                      disabled={disabled}
                      onClick={() =>
                        void onAction({
                          action: "issue_products",
                          userId: u.id,
                          productIds: "all",
                        })
                      }
                    >
                      Оформить все
                    </button>
                  ) : null}
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

  return null;
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



type AdminLeadRow = {
  id: string;
  status: string;
  fullName: string;
  phone: string;
  subscriberAmount?: number | null;
  premiumAmount?: number | null;
  adminComment?: string | null;
  product: { title: string; bank?: string; subscriberPrice?: number; reward?: number };
  client: { username: string | null; telegramId: string; firstName?: string | null };
  referrer?: { username: string | null; telegramId?: string; firstName?: string | null } | null;
};

type AdminWdRow = {
  id: string;
  amount: number;
  status: string;
  details: string;
  user: { username: string | null; telegramId: string };
};

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
  const filtered = useMemo(() => {
    return leads.filter((l) => {
      const closed = isClosedLead(l.status);
      if (bucket === "open" && closed) return false;
      if (bucket === "closed" && !closed) return false;
      return matchesUsernameQuery(
        q,
        l.client.username,
        l.client.telegramId,
        l.fullName
      );
    });
  }, [leads, q, bucket]);

  return (
    <div className="tg-stack">
      <p className="tg-note-plate">
        Заказы по продуктам. Открытые — в работе; закрытые — выплачено или
        отклонено. Поиск по @username.
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
        <div className="tg-empty">Нет заказов</div>
      ) : (
        filtered.map((l) => {
          const st =
            l.status === "new" || l.status === "duplicate"
              ? "processing"
              : l.status === "approved"
                ? "awaiting_payout"
                : l.status;
          const defAmt = l.subscriberAmount ?? l.product.subscriberPrice ?? 0;
          const prem = l.premiumAmount ?? l.product.reward ?? 0;
          const who = tgHandle(l.client.username, l.client.telegramId);
          const refName = l.referrer
            ? tgHandle(l.referrer.username, l.referrer.telegramId)
            : "Админы";
          const productLabel = formatProductLabel(
            l.product.title,
            l.product.bank
          );
          return (
            <div key={l.id} className="tg-card space-y-3">
              <div>
                <p className="tg-card-title">{who}</p>
                {l.fullName && !String(l.fullName).startsWith("@") ? (
                  <p className="tg-muted text-xs mt-1">ФИО в заявке: {l.fullName}</p>
                ) : null}
                <p className="tg-muted text-sm mt-1">
                  {productLabel}
                  {l.phone ? ` · ${l.phone}` : ""}
                </p>
                <p className="tg-muted text-xs mt-1">рефка: {refName}</p>
                <span className={`tg-status tg-status-${st} mt-2 inline-block`}>
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
                  Премия траффера: {money(prem)}
                </p>
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
                    const comment =
                      prompt("Почему не прошло") || "не прошло";
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
              </div>
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
          ? "Цены для подписчика по банкам. Премии — во вкладке «Премии»."
          : "Премии трафферам по банкам. Цены подписчикам здесь не показываем."}
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
        filtered.map((p) => (
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
              className="tg-btn-primary w-full text-sm"
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
              {isPrices ? "Сохранить цену" : "Сохранить премию"}
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
        ))
      )}
    </div>
  );
}
