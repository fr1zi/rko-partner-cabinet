"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { CabinetData } from "./types";
import { bankShort } from "@/lib/banks";
import { formatOrderNumber } from "@/lib/orderNumber";
import { formatDate, matchesUsernameQuery, money, statusLabel } from "./utils";

export type AdminPerson = {
  id: string;
  username: string | null;
  firstName?: string | null;
  telegramId: string;
  role: string;
  balance?: number;
  createdAt?: string;
  refSource?: string | null;
  isBanned?: boolean;
  issues?: Array<{
    id: string;
    status: string;
    productId: string;
    product: string;
    premium: number;
    orderId?: string | null;
  }>;
};

export type AdminProductOpt = {
  id: string;
  title: string;
  bank?: string;
  reward: number;
};

type IssueLine = NonNullable<AdminPerson["issues"]>[number];

function groupIssuesByOrder(issues: IssueLine[]) {
  const groups: Array<{ key: string; orderId: string | null; lines: IssueLine[] }> =
    [];
  const byOrder = new Map<string, IssueLine[]>();
  const singles: IssueLine[] = [];

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


export function PeopleTab({
  referrals,
  allChannel = false,
  people,
  products,
  onIssue,
  onAction,
  disabled,
  loading,
}: {
  referrals: CabinetData["referrals"];
  allChannel?: boolean;
  people?: AdminPerson[];
  products?: AdminProductOpt[];
  onIssue?: (userId: string, productIds: string[] | "all") => void;
  onAction?: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
  loading?: boolean;
}) {
  if (allChannel) {
    return (
      <AdminPeopleTable
        people={people || []}
        products={products || []}
        onIssue={onIssue}
        onAction={onAction}
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
        const handle = r.username
          ? `@${String(r.username).replace(/^@/, "")}`
          : `id ${r.telegramId}`;
        const issues = (r.issues || []) as IssueLine[];
        const groups = groupIssuesByOrder(issues);
        return (
          <div key={r.id} className="tg-card space-y-2">
            <div className="tg-person-row">
              <div className="tg-person-avatar" aria-hidden>
                {handle.replace(/^@/, "").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="tg-card-title truncate">{handle}</p>
                <p className="tg-muted text-xs truncate">клиент</p>
                {r.createdAt ? (
                  <p className="tg-muted text-xs">{formatDate(r.createdAt)}</p>
                ) : null}
              </div>
            </div>
            {groups.length === 0 ? (
              <p className="tg-muted text-xs">Ещё не оформлен</p>
            ) : (
              <div className="space-y-2">
                {groups.map((g) => (
                  <div key={g.key} className="space-y-1">
                    {g.orderId ? (
                      <p className="tg-muted text-xs">
                        Чек {formatOrderNumber(g.orderId)} · {g.lines.length}
                      </p>
                    ) : null}
                    {g.lines.map((iss) => (
                      <div
                        key={iss.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-sm truncate">
                          {iss.product} ×1
                        </span>
                        <span className="tg-muted text-xs shrink-0">
                          {money(iss.premium)} · {statusLabel(iss.status)}
                        </span>
                      </div>
                    ))}
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


function ComposeCheckPanel({
  userId,
  left,
  picked,
  composeBank,
  setComposeBank,
  setSelected,
  disabled,
  onIssue,
  onDone,
}: {
  userId: string;
  left: AdminProductOpt[];
  picked: string[];
  composeBank: string;
  setComposeBank: (b: string) => void;
  setSelected: Dispatch<SetStateAction<Record<string, string[]>>>;
  disabled?: boolean;
  onIssue: (userId: string, productIds: string[] | "all") => void;
  onDone: () => void;
}) {
  const banksLeft = useMemo(() => {
    const set = new Set<string>();
    for (const p of left) {
      const b = (p.bank || "").trim();
      if (b) set.add(b);
    }
    // products without bank go under «Прочее»
    if (left.some((p) => !(p.bank || "").trim())) set.add("Прочее");
    return Array.from(set).sort();
  }, [left]);

  const activeBank =
    composeBank && banksLeft.includes(composeBank)
      ? composeBank
      : banksLeft[0] || "";

  const inBank = left.filter((p) => {
    const b = (p.bank || "").trim() || "Прочее";
    return b === activeBank;
  });

  const pickedProducts = left.filter((p) => picked.includes(p.id));

  function toggle(id: string, checked: boolean) {
    setSelected((s) => {
      const cur = s[userId] || [];
      return {
        ...s,
        [userId]: checked
          ? cur.filter((x) => x !== id)
          : [...cur, id],
      };
    });
  }

  function removeChip(id: string) {
    setSelected((s) => ({
      ...s,
      [userId]: (s[userId] || []).filter((x) => x !== id),
    }));
  }

  return (
    <div className="tg-people-block mt-2 space-y-2">
      {pickedProducts.length > 0 ? (
        <div className="space-y-1">
          <span className="tg-people-meta-label">Выбрано</span>
          <div className="flex flex-wrap gap-1.5">
            {pickedProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                className="tg-chip tg-chip-active"
                disabled={disabled}
                onClick={() => removeChip(p.id)}
                title="Убрать"
              >
                {p.title}
                {p.bank ? ` · ${bankShort(p.bank)}` : ""}
                {" ×"}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {banksLeft.length > 0 ? (
        <div>
          <label className="tg-people-meta-label" htmlFor={`bank-${userId}`}>
            Банк
          </label>
          <select
            id={`bank-${userId}`}
            className="tg-input mt-1"
            value={activeBank}
            disabled={disabled}
            onChange={(e) => setComposeBank(e.target.value)}
          >
            {banksLeft.map((b) => (
              <option key={b} value={b}>
                {b === "Прочее" ? "Прочее" : bankShort(b) !== b ? `${bankShort(b)} (${b})` : b}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="space-y-2">
        {inBank.length === 0 ? (
          <p className="tg-muted text-xs">Нет продуктов в этой категории</p>
        ) : (
          inBank.map((p) => {
            const checked = picked.includes(p.id);
            return (
              <label
                key={p.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(p.id, checked)}
                />
                <span className="truncate flex-1">{p.title}</span>
                <span className="tg-muted text-xs shrink-0">
                  {money(p.reward)}
                </span>
              </label>
            );
          })
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="tg-btn-primary flex-1 text-sm"
          disabled={disabled || picked.length === 0}
          onClick={() => {
            const ids =
              picked.length === left.length && left.length > 1
                ? ("all" as const)
                : picked;
            onIssue(userId, ids);
            onDone();
          }}
        >
          Оформить чек
          {picked.length > 0 ? ` (${picked.length})` : ""}
        </button>
        <button
          type="button"
          className="tg-btn-secondary flex-1 text-sm"
          disabled={disabled || left.length === 0}
          onClick={() => {
            onIssue(userId, "all");
            onDone();
          }}
        >
          Весь оставшийся
        </button>
      </div>
    </div>
  );
}

function AdminPeopleTable({
  people,
  products,
  onIssue,
  onAction,
  disabled,
  loading,
}: {
  people: AdminPerson[];
  products: AdminProductOpt[];
  onIssue?: (userId: string, productIds: string[] | "all") => void;
  onAction?: (body: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [expandedView, setExpandedView] = useState<string | null>(null);
  const [expandedCompose, setExpandedCompose] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [composeBank, setComposeBank] = useState<string>("");
  const [balanceDraft, setBalanceDraft] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "traffer" | "subscriber" | "admin"
  >("all");
  const [issuesFilter, setIssuesFilter] = useState<"all" | "has" | "none">(
    "all"
  );
  const [bankFilter, setBankFilter] = useState<string>("all");

  const banks = useMemo(() => {
    const set = new Set<string>();
    for (const u of people) {
      for (const iss of u.issues || []) {
        const parts = String(iss.product || "").split(" · ");
        if (parts.length > 1) {
          const b = parts[parts.length - 1].trim();
          if (b) set.add(b);
        }
      }
      for (const p of products) {
        const b = (p.bank || "").trim();
        if (b) set.add(b);
      }
    }
    return Array.from(set).sort();
  }, [people, products]);

  const filtered = useMemo(() => {
    return people.filter((u) => {
      if (!matchesUsernameQuery(q, u.username, u.telegramId, u.firstName)) {
        return false;
      }
      const role = (u.role || "").toLowerCase();
      if (roleFilter === "traffer" && role !== "traffer") return false;
      if (roleFilter === "admin" && role !== "admin") return false;
      if (
        roleFilter === "subscriber" &&
        role !== "subscriber" &&
        role !== "client"
      ) {
        return false;
      }
      const issues = u.issues || [];
      if (issuesFilter === "has" && issues.length === 0) return false;
      if (issuesFilter === "none" && issues.length > 0) return false;
      if (bankFilter !== "all") {
        const hasBank = issues.some((iss) => {
          const label = String(iss.product || "");
          return (
            label.includes(` · ${bankFilter}`) ||
            label.endsWith(bankFilter) ||
            label.includes(bankFilter)
          );
        });
        if (!hasBank) return false;
      }
      return true;
    });
  }, [people, q, roleFilter, issuesFilter, bankFilter]);

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
      <h2 className="tg-section-label">
        Люди канала · {filtered.length}
        {filtered.length !== people.length ? ` / ${people.length}` : ""}
      </h2>
      <p className="tg-note-plate">
        Общая база канала: заход, чья рефка, оформление чеком. Несколько
        продуктов — один чек. Премия уходит трафферу.
      </p>
      <input
        className="tg-input"
        placeholder="Поиск @username / id"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="tg-admin-chips">
        {(
          [
            ["all", "Все роли"],
            ["traffer", "Трафферы"],
            ["subscriber", "Подписчики"],
            ["admin", "Админы"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={
              roleFilter === key ? "tg-chip tg-chip-active" : "tg-chip"
            }
            onClick={() => setRoleFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="tg-admin-chips">
        {(
          [
            ["all", "Все заявки"],
            ["has", "Есть заявки"],
            ["none", "Нет заявок"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={
              issuesFilter === key ? "tg-chip tg-chip-active" : "tg-chip"
            }
            onClick={() => setIssuesFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {banks.length > 0 ? (
        <div className="tg-admin-chips">
          <button
            type="button"
            className={
              bankFilter === "all" ? "tg-chip tg-chip-active" : "tg-chip"
            }
            onClick={() => setBankFilter("all")}
          >
            Все банки
          </button>
          {banks.map((b) => (
            <button
              key={b}
              type="button"
              className={
                bankFilter === b ? "tg-chip tg-chip-active" : "tg-chip"
              }
              onClick={() => setBankFilter(b)}
            >
              {b}
            </button>
          ))}
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <div className="tg-empty">Никого по фильтру</div>
      ) : null}
      {filtered.map((u) => {
        const handle = u.username
          ? `@${String(u.username).replace(/^@/, "")}`
          : `id ${u.telegramId}`;
        const roleRu =
          u.role === "admin"
            ? "админ"
            : u.role === "traffer"
              ? "траффер"
              : "подписчик";
        const issues = u.issues || [];
        const issued = new Set(issues.map((x) => x.productId));
        const left = products.filter((p) => !issued.has(p.id));
        const isAdm = u.role === "admin";
        const initial = handle
          .replace(/^@|^id\s+/, "")
          .slice(0, 1)
          .toUpperCase();
        const viewing = expandedView === u.id;
        const composing = expandedCompose === u.id;
        const picked = selected[u.id] || [];
        const groups = groupIssuesByOrder(issues);

        return (
          <article key={u.id} className="tg-card tg-people-card">
            <div className="tg-person-row">
              <div className="tg-person-avatar" aria-hidden>
                {initial || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="tg-card-title truncate">
                  {u.isBanned ? "🚫 " : ""}
                  {handle}
                </p>
                <p className="tg-muted text-xs truncate">{roleRu}</p>
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
            <p className="tg-muted text-xs">
              Баланс: {money(Number(u.balance ?? 0))}
            </p>
            {onAction && !isAdm ? (
              <div className="flex gap-2 items-center flex-wrap">
                <input
                  className="tg-input flex-1 min-w-[100px]"
                  type="number"
                  placeholder="Новый баланс"
                  disabled={disabled}
                  value={balanceDraft[u.id] ?? ""}
                  onChange={(e) =>
                    setBalanceDraft((s) => ({
                      ...s,
                      [u.id]: e.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  className="tg-btn-secondary tg-btn-compact"
                  disabled={
                    disabled ||
                    balanceDraft[u.id] === undefined ||
                    balanceDraft[u.id] === ""
                  }
                  onClick={() => {
                    const bal = Number(balanceDraft[u.id]);
                    if (!Number.isFinite(bal) || bal < 0) {
                      alert("Укажите корректный баланс ≥ 0");
                      return;
                    }
                    if (
                      !confirm(
                        `Установить баланс ${money(bal)} для ${handle}?`
                      )
                    ) {
                      return;
                    }
                    void onAction({
                      action: "set_balance",
                      userId: u.id,
                      balance: bal,
                    }).then(() =>
                      setBalanceDraft((s) => {
                        const next = { ...s };
                        delete next[u.id];
                        return next;
                      })
                    );
                  }}
                >
                  Изменить баланс
                </button>
              </div>
            ) : null}

            <div className="tg-people-block">
              <span className="tg-people-meta-label">
                Оформлено · {issues.length}
              </span>
              {!viewing ? (
                <p className="tg-muted text-xs mt-1">
                  {issues.length === 0
                    ? "Пока ничего"
                    : `${groups.length} чек(ов)`}
                </p>
              ) : groups.length === 0 ? (
                <p className="tg-muted text-xs mt-1">Пока ничего</p>
              ) : (
                <div className="mt-2 space-y-3">
                  {groups.map((g) => (
                    <div key={g.key} className="space-y-1">
                      <p className="tg-muted text-xs">
                        {g.orderId
                          ? `Чек ${formatOrderNumber(g.orderId)}`
                          : "Без чека"}
                      </p>
                      <ul className="tg-people-issues">
                        {g.lines.map((iss) => (
                          <li key={iss.id}>
                            <span className="truncate">
                              {iss.product} ×1
                            </span>
                            <span className="tg-muted shrink-0">
                              {money(iss.premium)} · {statusLabel(iss.status)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-wrap mt-1">
              <button
                type="button"
                className="tg-btn-secondary tg-btn-compact flex-1"
                onClick={() => {
                  setExpandedView((cur) => (cur === u.id ? null : u.id));
                  if (expandedCompose === u.id) setExpandedCompose(null);
                }}
              >
                {viewing ? "Скрыть заявки" : "Посмотреть заявки"}
              </button>
              {!isAdm && left.length > 0 && onIssue ? (
                <button
                  type="button"
                  className="tg-btn-primary tg-btn-compact flex-1"
                  disabled={disabled}
                  onClick={() => {
                    setExpandedCompose((cur) => {
                      if (cur === u.id) return null;
                      const banksLeft = Array.from(
                        new Set(
                          left
                            .map((p) => (p.bank || "").trim())
                            .filter(Boolean)
                        )
                      ).sort();
                      setComposeBank(banksLeft[0] || "");
                      return u.id;
                    });
                    if (expandedView === u.id) setExpandedView(null);
                    setSelected((s) => ({ ...s, [u.id]: s[u.id] || [] }));
                  }}
                >
                  {composing ? "Скрыть чек" : "Оформить чек"}
                </button>
              ) : null}
            </div>

            {composing && !isAdm && left.length > 0 && onIssue ? (
              <ComposeCheckPanel
                userId={u.id}
                left={left}
                picked={picked}
                composeBank={composeBank}
                setComposeBank={setComposeBank}
                setSelected={setSelected}
                disabled={disabled}
                onIssue={onIssue}
                onDone={() => {
                  setSelected((s) => ({ ...s, [u.id]: [] }));
                  setExpandedCompose(null);
                }}
              />
            ) : null}

            {!isAdm && left.length === 0 ? (
              <p className="tg-muted text-xs mt-1">Всё уже оформлено</p>
            ) : null}
            {isAdm ? (
              <p className="tg-muted text-xs mt-1">Админам не оформляем</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
