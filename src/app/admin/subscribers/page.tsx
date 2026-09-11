import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/status";
import { EmptyState } from "@/components/EmptyState";
import { isBotConfigured, getTelegramChannelId } from "@/lib/telegram";

export default async function AdminSubscribersPage({
  searchParams,
}: {
  searchParams: { partnerId?: string };
}) {
  const session = await requireSession("ADMIN");
  if (!session) redirect("/login");

  const botOk = isBotConfigured();
  const channelId = getTelegramChannelId();
  const partnerFilter = searchParams.partnerId || "";

  const partners = await prisma.partner.findMany({
    select: {
      id: true,
      displayName: true,
      refCode: true,
      user: { select: { name: true, username: true } },
      _count: { select: { subscribers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const subscribers = await prisma.subscriber.findMany({
    where: partnerFilter ? { partnerId: partnerFilter } : undefined,
    include: {
      partner: {
        select: {
          id: true,
          displayName: true,
          refCode: true,
          telegramInviteLink: true,
          user: { select: { name: true, username: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const demoCount = subscribers.filter((s) => s.isDemo).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="ui-page-title">Подписчики</h1>
        <p className="ui-page-sub">
          Входы в канал по уникальным invite-ссылкам трафферов
        </p>
      </div>

      {!botOk ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 space-y-1">
          <p className="font-medium">Подключите бота</p>
          <p className="text-amber-200/80">
            Задайте <code className="font-mono text-xs">TELEGRAM_BOT_TOKEN</code>,{" "}
            <code className="font-mono text-xs">TELEGRAM_BOT_USERNAME</code> и{" "}
            <code className="font-mono text-xs">TELEGRAM_CHANNEL_ID</code>, добавьте
            бота админом канала и вызовите setWebhook с{" "}
            <code className="font-mono text-xs">{`allowed_updates=["message","chat_member"]`}</code>
            . Пока ниже — заглушка
            {demoCount > 0 ? " и демо-строки" : ""}.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Бот подключён
          {channelId ? (
            <>
              {" · "}канал{" "}
              <span className="font-mono text-xs">{channelId}</span>
            </>
          ) : (
            <span className="text-amber-300">
              {" "}
              · не задан TELEGRAM_CHANNEL_ID — авто-invite недоступен
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-slate-500 mr-1">
          Траффер:
        </span>
        <Link
          href="/admin/subscribers"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            !partnerFilter
              ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
              : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
          }`}
        >
          Все ({partners.reduce((s, p) => s + p._count.subscribers, 0)})
        </Link>
        {partners.map((p) => {
          const name = p.displayName || p.user.name || p.user.username;
          const active = partnerFilter === p.id;
          return (
            <Link
              key={p.id}
              href={`/admin/subscribers?partnerId=${p.id}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition whitespace-nowrap ${
                active
                  ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {name}{" "}
              <span className="text-slate-500">({p._count.subscribers})</span>
            </Link>
          );
        })}
      </div>

      <div className="ui-table-wrap scrollbar-thin">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Telegram ID</th>
              <th>Дата входа</th>
              <th>Траффер</th>
              <th>Invite / refCode</th>
            </tr>
          </thead>
          <tbody>
            {subscribers.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title={
                      botOk
                        ? "Подписчиков пока нет"
                        : "Нет данных — подключите бота"
                    }
                    description={
                      botOk
                        ? "Новые входы появятся после join по invite-ссылке траффера"
                        : "Демо-строки появятся после seed без токена, либо настройте webhook"
                    }
                  />
                </td>
              </tr>
            ) : (
              subscribers.map((s) => {
                const trafferName = s.partner
                  ? s.partner.displayName ||
                    s.partner.user.name ||
                    s.partner.user.username
                  : "—";
                const linkOrCode =
                  s.inviteLink ||
                  s.inviteLinkName ||
                  s.partner?.telegramInviteLink ||
                  s.partner?.refCode ||
                  "—";
                return (
                  <tr key={s.id}>
                    <td className="font-medium text-cyan-300">
                      {s.username || "—"}
                      {s.isDemo ? (
                        <span className="ml-2 ui-badge bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 text-[10px]">
                          демо
                        </span>
                      ) : null}
                    </td>
                    <td className="font-mono text-xs text-slate-400">
                      {s.telegramId}
                    </td>
                    <td className="text-slate-300 whitespace-nowrap">
                      {formatDate(s.joinedAt)}
                    </td>
                    <td>
                      <div className="text-white">{trafferName}</div>
                      {s.partner?.refCode ? (
                        <div className="text-xs font-mono text-slate-500">
                          {s.partner.refCode}
                        </div>
                      ) : null}
                    </td>
                    <td className="max-w-[240px]">
                      <div className="text-xs text-slate-300 break-all">
                        {linkOrCode}
                      </div>
                      {s.inviteLinkName && s.inviteLink ? (
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          name: {s.inviteLinkName}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="mobile-cards space-y-3 lg:hidden">
        {subscribers.map((s) => {
          const trafferName = s.partner
            ? s.partner.displayName ||
              s.partner.user.name ||
              s.partner.user.username
            : "—";
          return (
            <div key={`m-${s.id}`} className="ui-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-cyan-300">
                  {s.username || "без @"}
                </div>
                {s.isDemo ? (
                  <span className="ui-badge bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 text-[10px]">
                    демо
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-slate-500 font-mono">
                id: {s.telegramId}
              </div>
              <div className="text-sm text-slate-300">
                {formatDate(s.joinedAt)} · {trafferName}
              </div>
              <div className="text-xs text-slate-400 break-all">
                {s.inviteLink || s.inviteLinkName || "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
