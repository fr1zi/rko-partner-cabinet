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

export function LeaderboardList({
  rows,
  highlightUserId,
  limit,
  emptyText = "Пока пусто — появятся после первых премий.",
}: {
  rows?: LeaderboardRow[] | null;
  highlightUserId?: string;
  limit?: number;
  emptyText?: string;
}) {
  const list = (rows || []).slice(0, limit ?? rows?.length ?? 0);
  if (!list.length) {
    return <p className="tg-muted text-sm">{emptyText}</p>;
  }
  return (
    <div className="tg-stack">
      {list.map((r) => {
        const mine = highlightUserId && r.userId === highlightUserId;
        return (
          <article
            key={r.userId}
            className={mine ? "tg-card space-y-1 ring-1 ring-emerald-500/40" : "tg-card space-y-1"}
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
            <p className="tg-muted text-xs">
              Успешных заявок: {r.leadsPaid}
            </p>
          </article>
        );
      })}
    </div>
  );
}
