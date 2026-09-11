"use client";

import type { CabinetData } from "./types";
import { formatDate, money, statusLabel } from "./utils";

export type AdminPerson = {
  id: string;
  username: string | null;
  firstName?: string | null;
  telegramId: string;
  role: string;
  createdAt?: string;
  refSource?: string | null;
  isBanned?: boolean;
  issues?: Array<{
    id: string;
    status: string;
    productId: string;
    product: string;
    premium: number;
  }>;
};

export type AdminProductOpt = { id: string; title: string; reward: number };

export function PeopleTab({
  referrals,
  allChannel = false,
  people,
  products,
  onIssue,
  disabled,
  loading,
}: {
  referrals: CabinetData["referrals"];
  allChannel?: boolean;
  people?: AdminPerson[];
  products?: AdminProductOpt[];
  onIssue?: (userId: string, productId: string | "all") => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  if (allChannel) {
    return (
      <AdminPeopleTable
        people={people || []}
        products={products || []}
        onIssue={onIssue}
        disabled={disabled}
        loading={loading}
      />
    );
  }

  if (referrals.length === 0) {
    return (
      <div className="tg-empty">
        <p>Пока никого — делитесь реф-ссылкой</p>
      </div>
    );
  }

  return (
    <div className="tg-stack">
      <h2 className="tg-section-label">Ваши клиенты</h2>
      {referrals.map((r) => {
        const name = r.firstName || r.username || r.telegramId;
        const handle = r.username
          ? `@${r.username.replace(/^@/, "")}`
          : `id ${r.telegramId}`;
        const issues = r.issues || [];
        return (
          <div key={r.id} className="tg-card space-y-2">
            <div className="tg-person-row">
              <div className="tg-person-avatar" aria-hidden>
                {String(name).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="tg-card-title truncate">{name}</p>
                <p className="tg-muted text-xs truncate">{handle}</p>
                {r.createdAt ? (
                  <p className="tg-muted text-xs">{formatDate(r.createdAt)}</p>
                ) : null}
              </div>
            </div>
            {issues.length === 0 ? (
              <p className="tg-muted text-xs">Ещё не оформлен</p>
            ) : (
              <div className="space-y-1">
                {issues.map((iss) => (
                  <div
                    key={iss.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-sm truncate">{iss.product}</span>
                    <span className="tg-muted text-xs shrink-0">
                      {money(iss.premium)} · {statusLabel(iss.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AdminPeopleTable({
  people,
  products,
  onIssue,
  disabled,
  loading,
}: {
  people: AdminPerson[];
  products: AdminProductOpt[];
  onIssue?: (userId: string, productId: string | "all") => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  if (loading && people.length === 0) {
    return <div className="tg-empty">Загрузка таблицы…</div>;
  }
  if (people.length === 0) {
    return (
      <div className="tg-empty">
        <p>Пока никого в базе канала</p>
      </div>
    );
  }

  return (
    <div className="tg-stack">
      <h2 className="tg-section-label">Люди канала · {people.length}</h2>
      <p className="tg-note-plate">
        Общая таблица: заход, чья рефка, оформление. Одно или все. Премия уходит
        трафферу.
      </p>
      <div className="tg-table-wrap">
        <table className="tg-table">
          <thead>
            <tr>
              <th>Юзер</th>
              <th>Заход</th>
              <th>Рефка</th>
              <th>Оформлено</th>
              <th>Оформить</th>
            </tr>
          </thead>
          <tbody>
            {people.map((u) => {
              const name =
                u.username || u.firstName || u.telegramId;
              const handle = u.username
                ? `@${u.username.replace(/^@/, "")}`
                : `id ${u.telegramId}`;
              const roleRu =
                u.role === "admin"
                  ? "админ"
                  : u.role === "traffer"
                    ? "траффер"
                    : "подписчик";
              const issued = new Set((u.issues || []).map((x) => x.productId));
              const left = products.filter((p) => !issued.has(p.id));
              const isAdm = u.role === "admin";
              return (
                <tr key={u.id}>
                  <td>
                    <p className="font-semibold text-white">
                      {u.isBanned ? "🚫 " : ""}
                      {name}
                    </p>
                    <p className="tg-muted text-[11px]">{handle}</p>
                    <p className="tg-muted text-[11px]">{roleRu}</p>
                  </td>
                  <td className="whitespace-nowrap">
                    {u.createdAt ? formatDate(u.createdAt) : "—"}
                  </td>
                  <td>{u.refSource || "Админы"}</td>
                  <td>
                    {(u.issues || []).length === 0 ? (
                      <span className="tg-muted">—</span>
                    ) : (
                      (u.issues || []).map((iss) => (
                        <p key={iss.id} className="text-[11px]">
                          {iss.product} · {money(iss.premium)}
                        </p>
                      ))
                    )}
                  </td>
                  <td>
                    {isAdm || left.length === 0 || !onIssue ? (
                      <span className="tg-muted">—</span>
                    ) : (
                      <div className="tg-table-actions">
                        {left.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="tg-btn-secondary text-[11px]"
                            disabled={disabled}
                            onClick={() => onIssue(u.id, p.id)}
                          >
                            {p.title}
                          </button>
                        ))}
                        {left.length > 1 ? (
                          <button
                            type="button"
                            className="tg-btn-primary text-[11px]"
                            disabled={disabled}
                            onClick={() => onIssue(u.id, "all")}
                          >
                            все
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
