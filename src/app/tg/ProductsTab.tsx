"use client";

import { useEffect, useMemo, useState } from "react";
import { BANKS } from "@/lib/banks";
import type { CabinetData, ProductsViewMode } from "./types";
import { money } from "./utils";

export function ProductsTab({
  products,
  mode = "premiums",
  channelUrl,
  channelMember,
  editable = false,
  onSave,
  onApply,
  applyingId,
  disabled,
  previewNote,
}: {
  products: CabinetData["products"];
  mode?: ProductsViewMode;
  channelUrl?: string;
  channelMember?: boolean;
  editable?: boolean;
  onSave?: (id: string, value: number) => Promise<void> | void;
  onApply?: (id: string) => Promise<void> | void;
  applyingId?: string | null;
  disabled?: boolean;
  previewNote?: string;
}) {
  const isShop = mode === "shop";
  const title = isShop ? "Продукты" : "Премии";
  const [bank, setBank] = useState<string>(BANKS[0].label);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const bankOptions = useMemo(() => {
    const present = new Set(
      products.map((p) => p.bank).filter((b): b is string => Boolean(b))
    );
    const known = BANKS.filter((b) => present.has(b.label));
    const extras = Array.from(present)
      .filter((label) => !BANKS.some((b) => b.label === label))
      .sort()
      .map((label) => ({ key: label, label, short: label }));
    return [...known, ...extras];
  }, [products]);

  useEffect(() => {
    if (bankOptions.length === 0) return;
    if (!bankOptions.some((b) => b.label === bank)) {
      setBank(bankOptions[0].label);
    }
  }, [bankOptions, bank]);

  const filtered = useMemo(() => {
    return products.filter((p) => p.bank === bank);
  }, [products, bank]);

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
            ? "Так видит подписчик. Фильтр по банку — свои цены. Сохраняйте у карточки."
            : "Так видит траффер. Фильтр по банку — свои премии. Сохраняйте у карточки."}
        </p>
      ) : (
        <p className="tg-note-plate">
          {isShop
            ? "У каждого банка свои цены и выплаты."
            : "У каждого банка своя премия трафферу."}
        </p>
      )}

      <div className="tg-bank-filters" role="tablist" aria-label="Банки">
        {bankOptions.map((b) => (
          <button
            key={b.key}
            type="button"
            className={bank === b.label ? "tg-chip tg-chip-active" : "tg-chip"}
            onClick={() => setBank(b.label)}
          >
            {b.short}
          </button>
        ))}
      </div>

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

      {filtered.length === 0 ? (
        <EmptyState text="Нет продуктов для этого банка" />
      ) : (
        filtered.map((p) => {
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
                <>
                  <div className="tg-money-plate">
                    <span className="tg-money-plate-label">{amountLabel}</span>
                    <span className="tg-money-plate-value">{money(amount)}</span>
                  </div>
                  {isShop && onApply ? (
                    <button
                      type="button"
                      className="tg-btn-primary w-full text-sm"
                      disabled={disabled || applyingId === p.id}
                      onClick={() => void onApply(p.id)}
                    >
                      {applyingId === p.id ? "Отправляю…" : "Оставить заявку"}
                    </button>
                  ) : null}
                </>
              )}
            </article>
          );
        })
      )}
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
