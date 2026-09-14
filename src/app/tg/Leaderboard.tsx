"use client";

import { tgHandle } from "./utils";

export type LeaderboardRow = {
  rank: number;
  userId: string;
  username: string | null;
  telegramId: string;
  earned: number;
  earnedLabel: string;
  leadsPaid: number;
};

export type LeaderboardMeta = {
  speech?: string;
  prize?: string;
  periodDays?: number;
  periodStart?: string;
  periodEndsAt?: string | null;
  daysLeft?: number | null;
};

export function LeaderboardList({
  rows,
  meta,
  highlightUserId,
  limit,
  emptyText = "Пока пусто — появятся после первых премий за период.",
}: {
  rows?: LeaderboardRow[] | null;
  meta?: LeaderboardMeta | null;
  highlightUserId?: string;
  limit?: number;
  emptyText?: string;
}) {
  const list = (rows || []).slice(0, limit ?? rows?.length ?? 0);
  return (
    <div className="tg-stack">
      {meta?.prize ? (
        <section className="tg-card space-y-1">
          <p className="tg-muted text-xs">Награда</p>
          <p className="tg-card-title text-base">{meta.prize}</p>
          {meta.daysLeft != null ? (
            <p className="tg-muted text-xs">
              До конца периода: {meta.daysLeft} дн. · окно {meta.periodDays} дн.
            </p>
          ) : null}
        </section>
      ) : null}
      {meta?.speech ? (
        <p className="tg-muted text-sm leading-relaxed">{meta.speech}</p>
      ) : null}
      {!list.length ? (
        <p className="tg-muted text-sm">{emptyText}</p>
      ) : (
        list.map((r) => {
          const mine = highlightUserId && r.userId === highlightUserId;
          return (
            <article
              key={r.userId}
              className={
                mine
                  ? "tg-card space-y-1 ring-1 ring-emerald-500/40"
                  : "tg-card space-y-1"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <p className="tg-card-title">
                  <span className="tg-muted font-normal mr-2">#{r.rank}</span>
                  {tgHandle(r.username, r.telegramId)}
                  {mine ? (
                    <span className="tg-muted text-xs font-normal ml-2">вы</span>
                  ) : null}
                </p>
                <p className="text-money font-semibold whitespace-nowrap">
                  {r.earnedLabel}
                </p>
              </div>
              <p className="tg-muted text-xs">Успешных заявок: {r.leadsPaid}</p>
            </article>
          );
        })
      )}
    </div>
  );
}
