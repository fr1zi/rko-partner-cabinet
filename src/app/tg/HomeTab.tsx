"use client";

import { useState } from "react";
import type { CabinetData, TgRole } from "./types";
import { LeaderboardList } from "./Leaderboard";
import { formatDate, money, statusLabel } from "./utils";

type AppRow = NonNullable<CabinetData["applications"]>[number];

function groupAppsByOrder(apps: AppRow[]) {
  const groups: Array<{ key: string; orderId: string | null; lines: AppRow[] }> =
    [];
  const byOrder = new Map<string, AppRow[]>();
  const singles: AppRow[] = [];
  for (const a of apps) {
    if (a.orderId) {
      const list = byOrder.get(a.orderId) || [];
      list.push(a);
      byOrder.set(a.orderId, list);
    } else {
      singles.push(a);
    }
  }
  for (const [orderId, lines] of Array.from(byOrder.entries())) {
    groups.push({ key: orderId, orderId, lines });
  }
  for (const a of singles) {
    groups.push({ key: a.id, orderId: null, lines: [a] });
  }
  return groups;
}


export type AdminHomeStats = {
  trafters?: number;
  clients?: number;
  leads?: number;
  channelSubscribers?: number;
  channelMembersTotal?: number;
  credited?: number;
  creditedLabel?: string;
  companyProfit?: number;
  companyProfitLabel?: string;
  paidLeads?: number;
};

export function HomeTab({
  data,
  role,
  channelMember,
  adminStats,
  onClaimReady,
  onWaitFullOrder,
  claimBusy,
}: {
  data: CabinetData;
  role?: TgRole;
  channelMember?: boolean;
  adminStats?: AdminHomeStats | null;
  onClaimReady?: (orderId: string) => void;
  onWaitFullOrder?: (orderId: string) => void;
  claimBusy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isSubscriber = role === "SUBSCRIBER";
  const isAdmin = role === "ADMIN";
  const channelUrl = data.channelUrl || "https://t.me/w1nstr1k3";

  async function copyRef() {
    try {
      await navigator.clipboard.writeText(data.refLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (isAdmin) {
    const s = adminStats || {};
    const tiles = [
      {
        label: "Подписчики",
        value: String(s.channelSubscribers ?? 0),
        wide: true,
      },
      { label: "Трафферы", value: String(s.trafters ?? 0) },
      { label: "Клиенты", value: String(s.clients ?? 0) },
      { label: "Заявки", value: String(s.leads ?? 0) },
      {
        label: "Начислено",
        value: String(s.creditedLabel ?? money(Number(s.credited ?? 0))),
        wide: true,
      },
      {
        label: "Прибыль компании",
        value: String(
          s.companyProfitLabel ?? money(Number(s.companyProfit ?? 0))
        ),
        wide: true,
      },
    ];
    return (
      <div className="tg-stack">
        <section className="tg-card">
          <h2 className="tg-card-title">Сводка канала</h2>
          <p className="tg-muted text-sm mt-2 leading-relaxed">
            Живые цифры по боту и каналу. Детали — во вкладке «Админ».
          </p>
        </section>
        <section>
          <h2 className="tg-section-label">Итоги</h2>
          <div className="tg-stat-grid">
            {tiles.map((t) => (
              <div
                key={t.label}
                className={t.wide ? "tg-stat-tile tg-stat-wide" : "tg-stat-tile"}
              >
                <p className="tg-stat-label">{t.label}</p>
                <p className="tg-stat-value">{t.value}</p>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="tg-section-label">Лидерборд трафферов</h2>
          <LeaderboardList rows={data.leaderboard} meta={data.leaderboardMeta} limit={10} />
        </section>
        <a
          className="tg-btn-secondary w-full text-center"
          href={channelUrl}
          target="_blank"
          rel="noreferrer"
        >
          Канал @w1nstr1k3
        </a>
      </div>
    );
  }

  if (isSubscriber) {
    const apps = data.applications || [];
    const groups = groupAppsByOrder(apps);
    const activeGroups = groups.filter((g) =>
      g.lines.some((l) => l.status !== "paid" && l.status !== "rejected")
    );
    const archiveGroups = groups.filter((g) =>
      g.lines.every((l) => l.status === "paid" || l.status === "rejected")
    );

    const ReceiptCard = ({
      g,
      archived,
    }: {
      g: ReturnType<typeof groupAppsByOrder>[number];
      archived?: boolean;
    }) => {
      const multi = Boolean(g.orderId) && g.lines.length > 1;
      const ready = g.lines.filter((a) => a.status === "awaiting_payout");
      const readySum = ready.reduce(
        (s, a) => s + Math.max(0, Number(a.subscriberAmount || 0)),
        0
      );
      const hasProcessing = g.lines.some(
        (a) =>
          a.status === "processing" ||
          a.status === "new" ||
          a.status === "duplicate"
      );
      const holding = ready.some((a) => a.holdUntilOrderComplete);
      const canClaimPartial = multi && ready.length > 0 && readySum > 0;
      const showSupport = g.lines.some(
        (a) => a.status === "awaiting_payout" || a.status === "paid"
      );

      return (
        <article className="tg-card space-y-2">
          {g.orderId ? (
            <p className="tg-muted text-xs">
              Чек · {g.lines.length} поз.
              {holding ? " · ждём весь чек" : ""}
            </p>
          ) : null}
          {g.lines.map((a) => (
            <div key={a.id} className="space-y-1 border-b border-white/5 pb-2 last:border-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <p className="tg-card-title">{a.product} ×1</p>
                <span className={`tg-status tg-status-${a.status}`}>
                  {statusLabel(a.status)}
                </span>
              </div>
              {a.subscriberAmount != null &&
              (a.status === "awaiting_payout" || a.status === "paid") ? (
                <p className="tg-muted text-sm">
                  Выплата: {money(a.subscriberAmount)}
                  {a.status === "paid"
                    ? " · начислено"
                    : a.holdUntilOrderComplete
                      ? " · удерживается до всего чека"
                      : " · готово"}
                </p>
              ) : null}
              {a.adminComment ? (
                <p className="tg-muted text-xs">
                  Комментарий: {a.adminComment}
                </p>
              ) : null}
              {a.approvedAt ? (
                <p className="tg-muted text-xs">
                  Обновлено: {formatDate(a.approvedAt)}
                </p>
              ) : a.createdAt ? (
                <p className="tg-muted text-xs">{formatDate(a.createdAt)}</p>
              ) : null}
            </div>
          ))}
          {canClaimPartial && onClaimReady && g.orderId ? (
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                className="tg-btn-primary w-full text-sm"
                disabled={claimBusy}
                onClick={() => onClaimReady(g.orderId!)}
              >
                {hasProcessing
                  ? `Забрать готовое (${money(readySum)})`
                  : `Забрать весь чек (${money(readySum)})`}
              </button>
              {hasProcessing && onWaitFullOrder ? (
                holding ? (
                  <p className="tg-muted text-xs text-center">
                    Ожидаем остальные позиции — начислим сразу, когда чек
                    будет готов целиком.
                  </p>
                ) : (
                  <button
                    type="button"
                    className="tg-btn-secondary w-full text-sm"
                    disabled={claimBusy}
                    onClick={() => onWaitFullOrder(g.orderId!)}
                  >
                    Ждать весь чек
                  </button>
                )
              ) : null}
            </div>
          ) : null}
          {!multi && showSupport && !archived ? (
            <div className="flex gap-2">
              <a
                className="tg-btn-secondary text-xs flex-1 text-center"
                href={data.supportUrl || "https://t.me/f3n1byt666"}
                target="_blank"
                rel="noreferrer"
              >
                Написать в ЛС
              </a>
            </div>
          ) : null}
        </article>
      );
    };

    return (
      <div className="tg-stack">
        <section className="tg-card">
          <h2 className="tg-card-title">Добро пожаловать</h2>
          <p className="tg-muted text-sm mt-2 leading-relaxed">
            Сначала напишите нам в ЛС, потом оставьте заявку на продукт.
            В чеке у каждой позиции свой статус. Готовое можно забрать сразу
            или дождаться всего чека.
          </p>
        </section>
        {!channelMember ? (
          <a
            className="tg-btn-primary w-full text-center"
            href={channelUrl}
            target="_blank"
            rel="noreferrer"
          >
            Вступить в канал @w1nstr1k3
          </a>
        ) : (
          <a
            className="tg-btn-secondary w-full text-center"
            href={channelUrl}
            target="_blank"
            rel="noreferrer"
          >
            Канал @w1nstr1k3
          </a>
        )}
        <section className="tg-card">
          <p className="tg-muted text-xs mb-1">К выплате</p>
          <p className="text-2xl font-semibold text-money tracking-tight">
            {money(data.botUser.balance)}
          </p>
        </section>
        <section>
          <h2 className="tg-section-label">Мои заявки</h2>
          {activeGroups.length === 0 ? (
            <p className="tg-muted text-sm">
              Нет открытых — оставьте из «Продукты».
            </p>
          ) : (
            <div className="tg-stack">
              {activeGroups.map((g) => (
                <ReceiptCard key={g.key} g={g} />
              ))}
            </div>
          )}
        </section>
        <section>
          <h2 className="tg-section-label">Закрытые заказы</h2>
          {archiveGroups.length === 0 ? (
            <p className="tg-muted text-sm">Пока нет закрытых заказов</p>
          ) : (
            <div className="tg-stack">
              {archiveGroups.map((g) => (
                <ReceiptCard key={g.key} g={g} archived />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  const tiles = [
    { label: "Клики", value: String(data.stats.clicks) },
    { label: "Регистрации", value: String(data.stats.registrations) },
    { label: "Заявки", value: String(data.stats.leadsTotal) },
    { label: "Одобрено", value: String(data.stats.approved) },
    { label: "Начислено", value: data.stats.creditedLabel, wide: true },
  ];

  return (
    <div className="tg-stack">
      <section className="tg-balance-card">
        <p className="tg-balance-label">Доступно к выводу</p>
        <p className="tg-balance-value">{money(data.botUser.balance)}</p>
        <p className="tg-balance-hint">Премии · ИП / ООО</p>
      </section>

      <section className="tg-card">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="tg-card-title">Реф-ссылка</h2>
            <p className="tg-muted text-xs mt-1">
              ?start=ref_&lt;ваш id&gt;
            </p>
          </div>
          <button type="button" className="tg-btn-sm" onClick={copyRef}>
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>
        <code className="tg-ref-code">{data.refLink}</code>
      </section>

      <section>
        <h2 className="tg-section-label">Статистика</h2>
        <div className="tg-stat-grid">
          {tiles.map((t) => (
            <div
              key={t.label}
              className={t.wide ? "tg-stat-tile tg-stat-wide" : "tg-stat-tile"}
            >
              <p className="tg-stat-label">{t.label}</p>
              <p className="tg-stat-value">{t.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="tg-section-label">Лидерборд</h2>
        <LeaderboardList
          rows={data.leaderboard}
          meta={data.leaderboardMeta}
          highlightUserId={data.botUser.id}
          limit={10}
        />
      </section>
    </div>
  );
}
