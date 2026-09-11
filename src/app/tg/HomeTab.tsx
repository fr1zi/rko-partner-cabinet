"use client";

import { useState } from "react";
import type { CabinetData, TgRole } from "./types";
import { money } from "./utils";

export type AdminHomeStats = {
  trafters?: number;
  clients?: number;
  leads?: number;
  credited?: number;
  creditedLabel?: string;
};

export function HomeTab({
  data,
  role,
  channelMember,
  adminStats,
}: {
  data: CabinetData;
  role?: TgRole;
  channelMember?: boolean;
  adminStats?: AdminHomeStats | null;
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
      { label: "Трафферы", value: String(s.trafters ?? 0) },
      { label: "Клиенты", value: String(s.clients ?? 0) },
      { label: "Заявки", value: String(s.leads ?? 0) },
      {
        label: "Начислено",
        value: String(s.creditedLabel ?? money(Number(s.credited ?? 0))),
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
    return (
      <div className="tg-stack">
        <section className="tg-card">
          <h2 className="tg-card-title">Добро пожаловать</h2>
          <p className="tg-muted text-sm mt-2 leading-relaxed">
            Кабинет подписчика: смотрите продукты и цены. Реф-ссылка и вывод
            доступны только трафферам — их назначает админ канала.
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
        <section>
          <h2 className="tg-section-label">Продукты</h2>
          <div className="tg-stack">
            {data.products.slice(0, 3).map((p) => (
              <article key={p.id} className="tg-card tg-product">
                <div className="tg-product-title-row">
                  <p className="tg-card-title">{p.title}</p>
                  {p.hot ? <span className="tg-hot-badge">HOT</span> : null}
                </div>
                {p.description ? (
                  <p className="tg-product-desc">{p.description}</p>
                ) : null}
                <div className="tg-money-plate">
                  <span className="tg-money-plate-label">Цена</span>
                  <span className="tg-money-plate-value">
                    {money(p.subscriberPrice)}
                  </span>
                </div>
              </article>
            ))}
          </div>
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
    </div>
  );
}
