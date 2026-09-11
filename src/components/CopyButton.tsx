"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Копировать",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* ignore */
        }
      }}
      className={
        className ||
        "rounded-lg border border-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-border-strong hover:text-white transition"
      }
    >
      {copied ? "Скопировано" : label}
    </button>
  );
}
