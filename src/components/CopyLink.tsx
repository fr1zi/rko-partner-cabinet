"use client";

import { useState } from "react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
      <code className="flex-1 rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-sm text-cyan-200/90 break-all font-mono">
        {url}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* ignore */
          }
        }}
        className="ui-btn-primary whitespace-nowrap"
      >
        {copied ? "Скопировано" : "Копировать"}
      </button>
    </div>
  );
}
