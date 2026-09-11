"use client";

import type { CabinetData } from "./types";
import { formatDate, money, statusLabel } from "./utils";

export function PeopleTab({
  referrals,
}: {
  referrals: CabinetData["referrals"];
}) {
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
        const handle = r.username ? `@${r.username.replace(/^@/, "")}` : `id ${r.telegramId}`;
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
                  <div key={iss.id} className="flex items-center justify-between gap-2">
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
