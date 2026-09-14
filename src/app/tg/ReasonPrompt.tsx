"use client";

import { useEffect, useState } from "react";

export const REASON_PRESETS = [
  "Клиент отказался",
  "Некорректные данные",
  "Дубль заявки",
  "Банк отклонил",
  "Не проходит по условиям",
  "Другое",
] as const;

type PendingAsk = {
  title: string;
  placeholder?: string;
  resolve: (value: string | null) => void;
};

let setHostPending: ((p: PendingAsk | null) => void) | null = null;

/**
 * Promise-based reason dialog with preset chips.
 * Falls back to window.prompt if host is not mounted.
 */
export function askReason(opts: {
  title: string;
  placeholder?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    if (!setHostPending) {
      const raw = String(
        typeof window !== "undefined"
          ? window.prompt(opts.title, "") || ""
          : ""
      ).trim();
      resolve(raw || null);
      return;
    }
    setHostPending({
      title: opts.title,
      placeholder: opts.placeholder,
      resolve,
    });
  });
}

export function ReasonChips({
  value,
  onPick,
}: {
  value: string;
  onPick: (next: string) => void;
}) {
  return (
    <div className="tg-reason-chips">
      {REASON_PRESETS.map((preset) => {
        const isOther = preset === "Другое";
        const known = REASON_PRESETS.filter((p) => p !== "Другое") as readonly string[];
        const active = isOther
          ? value !== "" && !known.includes(value)
          : value === preset;
        return (
          <button
            key={preset}
            type="button"
            className={
              active ? "tg-reason-chip tg-reason-chip-active" : "tg-reason-chip"
            }
            onClick={() => onPick(isOther ? (active ? value : "") : preset)}
          >
            {preset}
          </button>
        );
      })}
    </div>
  );
}

/** Mount once near AdminTab root so askReason() works. */
export function ReasonPromptHost() {
  const [pending, setPending] = useState<PendingAsk | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    setHostPending = (p) => {
      setText("");
      setPending(p);
    };
    return () => {
      setHostPending = null;
    };
  }, []);

  if (!pending) return null;

  const trimmed = text.trim();
  const close = (value: string | null) => {
    const r = pending.resolve;
    setPending(null);
    setText("");
    r(value);
  };

  return (
    <div
      className="tg-reason-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={pending.title}
      onClick={(e) => {
        if (e.target === e.currentTarget) close(null);
      }}
    >
      <div className="tg-reason-modal">
        <p className="tg-card-title text-base">{pending.title}</p>
        <p className="tg-muted text-xs mt-1 mb-3">
          Выберите шаблон или введите свою причину
        </p>
        <ReasonChips value={text} onPick={setText} />
        <textarea
          className="tg-input tg-reason-textarea mt-3"
          rows={3}
          placeholder={pending.placeholder || "Причина (обязательно)"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            className="tg-btn-secondary text-sm flex-1"
            onClick={() => close(null)}
          >
            Отмена
          </button>
          <button
            type="button"
            className="tg-btn-primary text-sm flex-1"
            disabled={!trimmed}
            onClick={() => {
              if (!trimmed) return;
              close(trimmed);
            }}
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}
