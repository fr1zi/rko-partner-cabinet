"use client";

import type { AppTab, TgRole } from "./types";

const ICONS: Record<AppTab, React.ReactNode> = {
  home: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  ),
  products: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M12 12 4 7.5M12 12l8-4.5M12 12v9" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  ),
  premiums: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 7.5v9M9.5 9.5h4a2 2 0 1 1 0 4h-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  ),
  people: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M3.5 18.5c.6-2.8 2.7-4.5 5.5-4.5s4.9 1.7 5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M16 14c2 .3 3.5 1.6 4 3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  ),
  withdraw: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="6"
        width="18"
        height="12"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16.5" cy="14.5" r="1.25" fill="currentColor" />
    </svg>
  ),
  admin: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3 4.5 6.5v5.2c0 4.4 3.1 8.3 7.5 9.3 4.4-1 7.5-4.9 7.5-9.3V6.5L12 3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

function labelFor(tab: AppTab, role: TgRole | undefined): string {
  if (tab === "products") {
    if (role === "PARTNER") return "Премии";
    return "Продукты";
  }
  if (tab === "premiums") return "Премии";
  const base: Record<AppTab, string> = {
    home: "Главная",
    products: "Продукты",
    premiums: "Премии",
    people: "Люди",
    withdraw: "Вывод",
    admin: "Админ",
  };
  return base[tab];
}

export function TgTabBar({
  tabs,
  active,
  onChange,
  role,
}: {
  tabs: AppTab[];
  active: AppTab;
  onChange: (t: AppTab) => void;
  role?: TgRole;
}) {
  return (
    <nav className="tg-tabbar" aria-label="Навигация">
      <div className="tg-tabbar-inner">
        {tabs.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              type="button"
              className={isActive ? "tg-tab tg-tab-active" : "tg-tab"}
              onClick={() => onChange(tab)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="tg-tab-icon">{ICONS[tab]}</span>
              <span className="tg-tab-label">{labelFor(tab, role)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
