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
        Общая база канала: заход, чья рефка, оформление. Одно или все. Премия
        уходит трафферу.
      </p>
      {people.map((u) => {
        const name = u.username || u.firstName || u.telegramId;
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
        const initial = String(name).replace(/^@/, "").slice(0, 1).toUpperCase();

        return (
          <article key={u.id} className="tg-card tg-people-card">
            <div className="tg-person-row">
              <div className="tg-person-avatar" aria-hidden>
                {initial || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="tg-card-title truncate">
                  {u.isBanned ? "🚫 " : ""}
                  {name}
                </p>
                <p className="tg-muted text-xs truncate">{handle}</p>
              </div>
              <span className="tg-role-pill">{roleRu}</span>
            </div>

            <div className="tg-people-meta">
              <div>
                <span className="tg-people-meta-label">Заход</span>
                <span className="tg-people-meta-value">
                  {u.createdAt ? formatDate(u.createdAt) : "—"}
                </span>
              </div>
              <div>
                <span className="tg-people-meta-label">Рефка</span>
                <span className="tg-people-meta-value">
                  {u.refSource || "Админы"}
                </span>
              </div>
            </div>

            <div className="tg-people-block">
              <span className="tg-people-meta-label">Оформлено</span>
              {(u.issues || []).length === 0 ? (
                <p className="tg-muted text-xs mt-1">Пока ничего</p>
              ) : (
                <ul className="tg-people-issues">
                  {(u.issues || []).map((iss) => (
                    <li key={iss.id}>
                      <span className="truncate">{iss.product}</span>
                      <span className="tg-muted shrink-0">
                        {money(iss.premium)} · {statusLabel(iss.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="tg-people-block">
              <span className="tg-people-meta-label">Оформить</span>
              {isAdm || left.length === 0 || !onIssue ? (
                <p className="tg-muted text-xs mt-1">
                  {isAdm ? "Админам не оформляем" : "Всё уже оформлено"}
                </p>
              ) : (
                <div className="tg-table-actions mt-2">
                  {left.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="tg-btn-secondary tg-btn-compact"
                      disabled={disabled}
                      onClick={() => onIssue(u.id, p.id)}
                    >
                      {p.title}
                    </button>
                  ))}
                  {left.length > 1 ? (
                    <button
                      type="button"
                      className="tg-btn-primary tg-btn-compact"
                      disabled={disabled}
                      onClick={() => onIssue(u.id, "all")}
                    >
                      все
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
