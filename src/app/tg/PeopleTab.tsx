"use client";

import type { CabinetData } from "./types";
import { statusLabel } from "./utils";

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
      <h2 className="tg-section-label">Рефералы</h2>
      {referrals.map((r) => {
        const name = r.firstName || r.username || r.telegramId;
        const handle = r.username ? `@${r.username}` : `id ${r.telegramId}`;
        return (
          <div key={r.id} className="tg-card tg-person-row">
            <div className="tg-person-avatar" aria-hidden>
              {String(name).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="tg-card-title truncate">{name}</p>
              <p className="tg-muted text-xs truncate">{handle}</p>
            </div>
            <span className={`tg-status tg-status-${r.status}`}>
              {statusLabel(r.status)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
