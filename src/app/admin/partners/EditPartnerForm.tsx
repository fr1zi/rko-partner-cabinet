"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";

type PartnerRow = {
  id: string;
  refCode: string;
  displayName: string | null;
  telegramChannelUrl: string | null;
  telegramUsername: string | null;
  telegramInviteLink: string | null;
  telegramInviteLinkName: string | null;
  defaultCommission: number;
  active: boolean;
  user: { name: string | null; username: string };
};

export function EditPartnerForm({
  partner,
  baseUrl,
  inviteConfigured = false,
}: {
  partner: PartnerRow;
  baseUrl: string;
  inviteConfigured?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    displayName: partner.displayName || partner.user.name || "",
    telegramChannelUrl: partner.telegramChannelUrl || "",
    telegramUsername: partner.telegramUsername || "",
    defaultCommission: String(partner.defaultCommission),
    active: partner.active,
  });
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(false);

  const webRef = `${baseUrl}/r/${partner.refCode}`;
  const invite = partner.telegramInviteLink;

  async function save(extra?: { regenerateInviteLink?: boolean }) {
    setError("");
    setOk("");
    setLoading(true);
    try {
      const res = await fetch(`/api/partners/${partner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName,
          name: form.displayName,
          telegramChannelUrl: form.telegramChannelUrl || null,
          telegramUsername: form.telegramUsername || null,
          defaultCommission: Number(form.defaultCommission) || 3000,
          active: form.active,
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      if (data.inviteWarning) {
        setOk(`Сохранено · invite: ${data.inviteWarning}`);
      } else {
        setOk(
          extra?.regenerateInviteLink
            ? "Сохранено, invite-ссылка обновлена"
            : "Сохранено"
        );
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await save();
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap gap-2 items-center">
        <CopyButton text={webRef} label="Копировать /r/" />
        {invite ? (
          <CopyButton text={invite} label="Копировать invite" />
        ) : partner.telegramChannelUrl ? (
          <CopyButton text={partner.telegramChannelUrl} label="Копировать TGK" />
        ) : null}
        {inviteConfigured ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => save({ regenerateInviteLink: true })}
            className="rounded-lg bg-cyan-500/15 ring-1 ring-cyan-500/40 px-3 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25 transition"
          >
            {partner.telegramInviteLink
              ? "Пересоздать invite"
              : "Создать invite"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/40 px-3 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30 transition"
        >
          {open ? "Закрыть" : "Редактировать"}
        </button>
      </div>
      {ok && !open ? (
        <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1.5">
          {ok}
        </div>
      ) : null}
      {open ? (
        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-border bg-surface-raised p-4 space-y-3"
        >
          {error ? (
            <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2 py-1.5">
              {error}
            </div>
          ) : null}
          {ok ? (
            <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1.5">
              {ok}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="ui-label text-xs">Имя профиля</label>
              <input
                className="ui-input"
                value={form.displayName}
                onChange={(e) =>
                  setForm({ ...form, displayName: e.target.value })
                }
              />
            </div>
            <div>
              <label className="ui-label text-xs">Telegram @username</label>
              <input
                className="ui-input"
                placeholder="@handle"
                value={form.telegramUsername}
                onChange={(e) =>
                  setForm({ ...form, telegramUsername: e.target.value })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <label className="ui-label text-xs">
                Ссылка TGK вручную (fallback)
              </label>
              <input
                className="ui-input"
                placeholder="https://t.me/..."
                value={form.telegramChannelUrl}
                onChange={(e) =>
                  setForm({ ...form, telegramChannelUrl: e.target.value })
                }
              />
            </div>
            {partner.telegramInviteLink ? (
              <div className="sm:col-span-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs">
                <div className="text-slate-500 mb-1">
                  Invite (name:{" "}
                  {partner.telegramInviteLinkName || partner.refCode})
                </div>
                <div className="text-cyan-300 break-all font-mono">
                  {partner.telegramInviteLink}
                </div>
              </div>
            ) : null}
            <div>
              <label className="ui-label text-xs">Комиссия (₽)</label>
              <input
                type="number"
                className="ui-input"
                value={form.defaultCommission}
                onChange={(e) =>
                  setForm({ ...form, defaultCommission: e.target.value })
                }
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                />
                Активен
              </label>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="ui-btn-primary"
          >
            {loading ? "Сохранение…" : "Сохранить профиль"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
