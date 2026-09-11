"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";

function genRefCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function CreatePartnerForm({
  inviteConfigured = false,
}: {
  inviteConfigured?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    refCode: genRefCode(),
    defaultCommission: "3500",
    telegramChannelUrl: "",
    telegramUsername: "",
  });
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{
    displayName: string;
    refCode: string;
    webRef: string;
    telegramChannelUrl: string | null;
    telegramInviteLink: string | null;
    inviteWarning: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const previewRef = useMemo(() => {
    const code = (form.refCode || "").trim().toUpperCase();
    return code ? `${baseUrl}/r/${code}` : "";
  }, [form.refCode, baseUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreated(null);
    setLoading(true);
    try {
      const refCode = form.refCode.trim().toUpperCase();
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          name: form.name,
          displayName: form.name,
          refCode,
          defaultCommission: Number(form.defaultCommission) || 3500,
          telegramChannelUrl: form.telegramChannelUrl.trim() || null,
          telegramUsername: form.telegramUsername.trim() || null,
          generateInviteLink: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      const partner = data.user?.partner;
      setCreated({
        displayName: form.name,
        refCode,
        webRef: `${baseUrl}/r/${refCode}`,
        telegramChannelUrl:
          partner?.telegramChannelUrl ||
          (form.telegramChannelUrl.trim() || null),
        telegramInviteLink: partner?.telegramInviteLink || null,
        inviteWarning: data.inviteWarning || null,
      });
      setForm({
        name: "",
        username: "",
        password: "",
        refCode: genRefCode(),
        defaultCommission: "3500",
        telegramChannelUrl: "",
        telegramUsername: "",
      });
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ui-card p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white text-lg">
            Создать траффера и закрепить ссылки
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Логин, пароль, имя и ссылки — в одном шаге.{" "}
            <span className="text-cyan-300 font-medium">
              {inviteConfigured
                ? "Именная invite-ссылка канала создаётся автоматически"
                : "Можно указать ручной TGK URL (бот/канал не настроены)"}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={open ? "ui-btn-secondary shrink-0" : "ui-btn-primary shrink-0"}
        >
          {open ? "Скрыть форму" : "Новый траффер"}
        </button>
      </div>

      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2.5 text-sm text-cyan-200">
        {inviteConfigured ? (
          <>
            При создании вызывается Telegram{" "}
            <span className="font-mono text-xs">createChatInviteLink</span> с
            именем = реф. код. Ручной TGK URL — запасной вариант.
          </>
        ) : (
          <>
            Бот или TELEGRAM_CHANNEL_ID не заданы — укажите ручной TGK URL при
            необходимости. Авто-invite появится после настройки env.
          </>
        )}
      </div>

      {created ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
          <p className="text-sm font-medium text-emerald-300">
            Траффер «{created.displayName}» создан — ссылки уже закреплены
          </p>
          {created.inviteWarning ? (
            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1.5">
              Invite: {created.inviteWarning}
            </p>
          ) : null}
          <div className="rounded-lg border border-border bg-surface p-3 space-y-2 text-sm">
            <div className="text-xs text-slate-500">
              Персональная ссылка
              {created.telegramInviteLink
                ? " (invite канала)"
                : created.telegramChannelUrl
                  ? " (TGK)"
                  : " (веб-реф)"}
            </div>
            <div className="font-mono text-cyan-300 break-all text-xs">
              {created.telegramInviteLink ||
                created.telegramChannelUrl ||
                created.webRef}
            </div>
            <CopyButton
              text={
                created.telegramInviteLink ||
                created.telegramChannelUrl ||
                created.webRef
              }
              label="Копировать"
            />
            <p className="text-[11px] text-slate-500">
              Код {created.refCode} · веб-путь /r/{created.refCode} (запасной)
            </p>
          </div>
        </div>
      ) : null}

      {open ? (
        <form onSubmit={onSubmit} className="space-y-5 border-t border-border pt-5">
          {error ? (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm px-3 py-2">
              {error}
            </div>
          ) : null}

          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-3">
              1. Учётная запись
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="ui-label text-xs">Имя (displayName) *</label>
                <input
                  className="ui-input"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Иванов Сергей"
                />
              </div>
              <div>
                <label className="ui-label text-xs">Логин *</label>
                <input
                  className="ui-input"
                  required
                  minLength={3}
                  value={form.username}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                  placeholder="traffer"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="ui-label text-xs">Пароль *</label>
                <input
                  type="password"
                  className="ui-input"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder="минимум 6 символов"
                  autoComplete="new-password"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">
              2. Веб-ссылка (реф. код)
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Код = имя invite-ссылки в Telegram · лендинг{" "}
              <span className="font-mono text-slate-400">/r/{"{код}"}</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className="ui-label text-xs">Реф. код *</label>
                <input
                  className="ui-input font-mono uppercase"
                  required
                  minLength={3}
                  maxLength={20}
                  value={form.refCode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      refCode: e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, ""),
                    })
                  }
                  placeholder="DEMO01"
                />
              </div>
              <button
                type="button"
                className="ui-btn-secondary"
                onClick={() =>
                  setForm({ ...form, refCode: genRefCode() })
                }
              >
                Сгенерировать
              </button>
            </div>
            {previewRef ? (
              <div className="mt-3 rounded-xl border border-border bg-surface-raised px-3 py-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Ссылка будет закреплена
                  </div>
                  <code className="text-sm text-cyan-300 break-all font-mono">
                    {previewRef}
                  </code>
                </div>
                <CopyButton text={previewRef} label="Копировать" />
              </div>
            ) : null}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">
              3. Telegram / TGK
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              {inviteConfigured
                ? "Ручной TGK URL — fallback, если авто-invite не нужен отдельно"
                : "Ручной URL канала/чата (fallback без бота)"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="ui-label text-xs">
                  Ссылка TGK вручную (t.me / telegram.me)
                </label>
                <input
                  className="ui-input"
                  value={form.telegramChannelUrl}
                  onChange={(e) =>
                    setForm({ ...form, telegramChannelUrl: e.target.value })
                  }
                  placeholder="https://t.me/channel"
                />
              </div>
              <div>
                <label className="ui-label text-xs">Telegram @username</label>
                <input
                  className="ui-input"
                  value={form.telegramUsername}
                  onChange={(e) =>
                    setForm({ ...form, telegramUsername: e.target.value })
                  }
                  placeholder="@handle"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Нужен для Mini App: при первом входе по @username сохранится telegramId
                </p>
              </div>
              <div>
                <label className="ui-label text-xs">Комиссия по умолчанию ₽</label>
                <input
                  type="number"
                  className="ui-input"
                  value={form.defaultCommission}
                  onChange={(e) =>
                    setForm({ ...form, defaultCommission: e.target.value })
                  }
                  min={0}
                />
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading} className="ui-btn-primary w-full sm:w-auto px-6">
            {loading
              ? "Создание…"
              : inviteConfigured
                ? "Создать траффера + invite-ссылку"
                : "Создать траффера и закрепить ссылки"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
