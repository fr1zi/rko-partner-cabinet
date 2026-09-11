"use client";

import { useEffect, useState } from "react";
import type { CabinetData, ProductsViewMode } from "./types";
import { money } from "./utils";

export function ProductsTab({
  products,
  mode = "premiums",
  channelUrl,
  channelMember,
  editable = false,
  onSave,
  disabled,
  previewNote,
}: {
  products: CabinetData["products"];
  mode?: ProductsViewMode;
  channelUrl?: string;
  channelMember?: boolean;
  editable?: boolean;
  onSave?: (id: string, value: number) => Promise<void> | void;
  disabled?: boolean;
  previewNote?: string;
}) {
  const isShop = mode === "shop";
  const title = isShop ? "Продукты" : "Премии";
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const p of products) {
      next[p.id] = String(isShop ? p.subscriberPrice : p.reward);
    }
    setDrafts(next);
  }, [products, isShop]);

  if (products.length === 0) {
    return (
      <EmptyState
        text={isShop ? "Пока нет активных продуктов" : "Пока нет премий"}
      />
    );
  }

  return (
    <div className="tg-stack">
      <h2 className="tg-section-label">{title}</h2>
      {previewNote ? <p className="tg-note-plate">{previewNote}</p> : null}
      {editable ? (
        <p className="tg-note-plate">
          {isShop
            ? "Так видит подписчик. Меняйте цену у текущего продукта и сохраняйте."
            : "Так видит траффер. Меняйте премию у текущего продукта и сохраняйте."}
        </p>
      ) : null}
      {isShop && !channelMember && !editable ? (
        <a
          className="tg-btn-primary w-full text-center"
          href={channelUrl || "https://t.me/w1nstr1k3"}
          target="_blank"
          rel="noreferrer"
        >
          Вступить в канал @w1nstr1k3
        </a>
      ) : null}
      {products.map((p) => {
        const amountLabel = isShop
          ? "Цена"
          : p.rewardType === "percent"
            ? "% премия"
            : "Премия";
        const amount = isShop ? p.subscriberPrice : p.reward;
        return (
          <article key={p.id} className="tg-card tg-product">
            <div className="tg-product-top">
              <div className="tg-product-copy">
                <div className="tg-product-title-row">
                  <h3 className="tg-card-title">{p.title}</h3>
                  {p.hot ? <span className="tg-hot-badge">HOT</span> : null}
                </div>
                {p.bank ? <p className="tg-product-bank">{p.bank}</p> : null}
              </div>
            </div>
            {p.hot && p.hotText ? (
              <p className="tg-hot-text">{p.hotText}</p>
            ) : null}
            {p.description ? (
              <p className="tg-product-desc">{p.description}</p>
            ) : null}
            {editable ? (
              <div className="tg-edit-block">
                <label className="tg-label">
                  {isShop ? "Цена для подписчика, ₽" : "Премия трафферу, ₽"}
                </label>
                <input
                  className="tg-input"
                  type="number"
                  value={drafts[p.id] ?? ""}
                  disabled={disabled || saving === p.id}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="tg-btn-primary w-full text-sm"
                  disabled={disabled || saving === p.id || !onSave}
                  onClick={async () => {
                    if (!onSave) return;
                    const v = Number(drafts[p.id]);
                    if (!Number.isFinite(v) || v < 0) return;
                    setSaving(p.id);
                    try {
                      await onSave(p.id, v);
                    } finally {
                      setSaving(null);
                    }
                  }}
                >
                  {saving === p.id ? "Сохраняю…" : "Сохранить"}
                </button>
              </div>
            ) : (
              <div className="tg-money-plate">
                <span className="tg-money-plate-label">{amountLabel}</span>
                <span className="tg-money-plate-value">{money(amount)}</span>
              </div>
            )}
          </article>
        );
      })}
      {isShop && !editable ? (
        <a
          className="tg-btn-secondary w-full text-center"
          href={channelUrl || "https://t.me/w1nstr1k3"}
          target="_blank"
          rel="noreferrer"
        >
          Канал @w1nstr1k3
        </a>
      ) : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="tg-empty">
      <p>{text}</p>
    </div>
  );
}
