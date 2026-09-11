"use client";

import { roleLabel } from "./utils";

export function TgHeader({
  firstName,
  role,
  isDemo,
}: {
  firstName: string;
  role: string | null;
  isDemo?: boolean;
}) {
  return (
    <header className="tg-header">
      <div className="flex items-center gap-3 min-w-0">
        <div className="tg-avatar" aria-hidden>
          {(firstName || "Р").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="tg-header-name truncate">{firstName || "Партнёр"}</h1>
          <p className="tg-header-role">
            {roleLabel(role)}
            {isDemo ? " · демо" : ""}
            <span className="tg-dot">·</span>
            РКО
          </p>
        </div>
      </div>
    </header>
  );
}

export function PreviewBanner() {
  return (
    <div className="tg-preview-banner" role="status">
      <span className="tg-preview-dot" />
      Превью — открой из бота
    </div>
  );
}
