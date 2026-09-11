"use client";

import type { AdminSubTab } from "./types";
import { money } from "./utils";

const SUBS: Array<[AdminSubTab, string]> = [
  ["stats", "Итоги"],
  ["products", "Цены"],
  ["premiums", "Премии"],
  ["leads", "Заявки"],
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
      </div>
    );
  }

  if (tab === "products") {
    const products = (data.products || []) as Array<{
      id: string;
      title: string;
      reward: number;
      subscriberPrice: number;
      isActive: boolean;
      isHot: boolean;
    }>;
    return (
      <div className="tg-stack">
        <p className="tg-note-plate">
          Меняйте текущую цену. Премии — во вкладке «Премии».
        </p>
        {products.map((p) => (
          <div key={p.id} className="tg-card space-y-3">
            <div className="tg-product-title-row">
              <p className="tg-card-title">{p.title}</p>
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
              <label className="tg-label">Цена для подписчика, ₽</label>
              <input
                className="tg-input"
                type="number"
                defaultValue={p.subscriberPrice ?? p.reward}
                disabled={disabled}
                id={`price-${p.id}`}
              />
            </div>
            <button
              type="button"
              className="tg-btn-primary w-full text-sm"
              disabled={disabled}
              onClick={() => {
                const el = document.getElementById(
                  `price-${p.id}`
                ) as HTMLInputElement | null;
                const subscriberPrice = Number(
                  el?.value || p.subscriberPrice || p.reward
                );
                void onAction({
                  action: "product_update",
                  id: p.id,
                  subscriberPrice,
                });
              }}
            >
              Сохранить цену
            </button>
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
          </div>
        ))}
      </div>
    );
  }

  if (tab === "premiums") {
    const products = (data.products || []) as Array<{
      id: string;
      title: string;
      reward: number;
      subscriberPrice: number;
      isActive: boolean;
      isHot: boolean;
    }>;
    return (
      <div className="tg-stack">
        <p className="tg-note-plate">
          Только премии трафферам. Цены подписчикам здесь не показываем.
        </p>
        {products.map((p) => (
          <div key={p.id} className="tg-card space-y-3">
            <div className="tg-product-title-row">
              <p className="tg-card-title">{p.title}</p>
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
              <label className="tg-label">Премия трафферу, ₽</label>
              <input
                className="tg-input"
                type="number"
                defaultValue={p.reward}
                disabled={disabled}
                id={`prem-${p.id}`}
              />
            </div>
            <button
              type="button"
              className="tg-btn-primary w-full text-sm"
              disabled={disabled}
              onClick={() => {
                const el = document.getElementById(
                  `prem-${p.id}`
                ) as HTMLInputElement | null;
                const reward = Number(el?.value || p.reward);
                void onAction({
                  action: "product_update",
                  id: p.id,
                  reward,
                });
              }}
            >
              Сохранить премию
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (tab === "leads") {
    const leads = (data.leads || []) as Array<{
      id: string;
      status: string;
      fullName: string;
      phone: string;
      product: { title: string };
      client: { username: string | null; telegramId: string };
    }>;
    if (leads.length === 0) return <div className="tg-empty">Нет заявок</div>;
    return (
      <div className="tg-stack">
        {leads.map((l) => (
          <div key={l.id} className="tg-card space-y-3">
            <div>
              <p className="tg-card-title">
                {l.fullName || l.client.username || l.client.telegramId}
              </p>
              <p className="tg-muted text-sm mt-1">
                {l.product.title} · {l.phone}
              </p>
              <p className="tg-muted text-xs mt-1">{l.status}</p>
            </div>
            {l.status === "new" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="tg-btn-primary text-xs flex-1"
                  disabled={disabled}
                  onClick={() =>
                    void onAction({ action: "lead_approve", id: l.id })
                  }
                >
                  Одобрить
                </button>
                <button
                  type="button"
                  className="tg-btn-secondary text-xs flex-1"
                  disabled={disabled}
                  onClick={() => {
                    const comment =
                      prompt("Комментарий отклонения") || "отклонено";
                    void onAction({
                      action: "lead_reject",
                      id: l.id,
                      comment,
                    });
                  }}
                >
                  Отклонить
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  if (tab === "withdrawals") {
    const list = (data.withdrawals || []) as Array<{
      id: string;
      amount: number;
      status: string;
      details: string;
      user: { username: string | null; telegramId: string };
    }>;
    if (list.length === 0) return <div className="tg-empty">Нет выводов</div>;
    return (
      <div className="tg-stack">
        {list.map((w) => (
          <div key={w.id} className="tg-card space-y-3">
            <div>
              <p className="tg-card-title">{money(w.amount)}</p>
              <p className="tg-muted text-sm mt-1">
                {w.user.username || w.user.telegramId} · {w.status}
              </p>
              <p className="tg-muted text-xs mt-1">{w.details}</p>
            </div>
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
          </div>
        ))}
      </div>
    );
  }

  if (tab === "users") {
    const users = (data.users || []) as Array<{
      id: string;
      username: string | null;
      telegramId: string;
      role: string;
      balance: number;
      isBanned: boolean;
    }>;
    return (
      <div className="tg-stack">
        {users.map((u) => {
          const isAdm = u.role === "admin";
          return (
            <div key={u.id} className="tg-card space-y-3">
              <div>
                <p className="tg-card-title">
                  {u.isBanned ? "🚫 " : ""}
                  {u.username || u.telegramId}
                </p>
                <p className="tg-muted text-sm mt-1">
                  {u.role} · {money(u.balance)}
                </p>
              </div>
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
