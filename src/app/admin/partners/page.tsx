import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/status";
import { CreatePartnerForm } from "./CreatePartnerForm";
import { EditPartnerForm } from "./EditPartnerForm";
import { CopyButton } from "@/components/CopyButton";
import { EmptyState } from "@/components/EmptyState";
import {
  isBotConfigured,
  getBotUsername,
  isChannelInviteConfigured,
  getTelegramChannelId,
} from "@/lib/telegram";

export default async function AdminPartnersPage() {
  const session = await requireSession("ADMIN");
  if (!session) redirect("/login");

  const partners = await prisma.partner.findMany({
    include: {
      user: true,
      _count: { select: { clients: true, subscribers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const botOk = isBotConfigured();
  const botUser = getBotUsername();
  const inviteConfigured = isChannelInviteConfigured();
  const channelId = getTelegramChannelId();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="ui-page-title">Профили партнёров</h1>
        <p className="ui-page-sub">
          Создание траффера с одной персональной ссылкой (invite канала или TGK)
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Telegram:{" "}
          {botOk ? (
            <span className="text-emerald-400">
              бот{botUser ? ` @${botUser}` : ""}
              {inviteConfigured
                ? ` · канал ${channelId}`
                : " · канал не задан (TELEGRAM_CHANNEL_ID)"}
            </span>
          ) : (
            <span className="text-amber-400">
              не подключён — доступен ручной TGK URL
            </span>
          )}
        </p>
      </div>

      <CreatePartnerForm inviteConfigured={inviteConfigured} />

      <div className="ui-table-wrap scrollbar-thin hidden lg:block">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Траффер</th>
              <th>Реф. код</th>
              <th>Ссылка</th>
              <th>Клиенты</th>
              <th>Подписчики</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {partners.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState title="Партнёров пока нет" />
                </td>
              </tr>
            ) : (
              partners.map((p) => {
                const name = p.displayName || p.user.name || p.user.username;
                const link =
                  p.telegramInviteLink || p.telegramChannelUrl || null;
                return (
                  <tr key={`row-${p.id}`}>
                    <td>
                      <div className="font-medium text-white">{name}</div>
                      <div className="text-xs text-slate-500">
                        @{p.user.username}
                        {p.telegramUsername ? ` · ${p.telegramUsername}` : ""}
                      </div>
                    </td>
                    <td className="font-mono text-cyan-300">{p.refCode}</td>
                    <td className="max-w-[220px]">
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-400 text-xs break-all hover:underline"
                        >
                          {link}
                        </a>
                      ) : (
                        <span className="text-slate-500 text-xs">нет</span>
                      )}
                    </td>
                    <td className="font-semibold text-white">
                      {p._count.clients}
                    </td>
                    <td className="font-semibold text-white">
                      {p._count.subscribers}
                    </td>
                    <td>
                      {p.active ? (
                        <span className="ui-badge bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
                          Активен
                        </span>
                      ) : (
                        <span className="ui-badge bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30">
                          Отключён
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-4">
        <h2 className="ui-section-title">Редактирование профилей</h2>
        {partners.length === 0 ? (
          <div className="ui-card">
            <EmptyState
              title="Нет партнёров"
              description="Создайте первого партнёра формой выше"
            />
          </div>
        ) : (
          partners.map((p) => {
            const name = p.displayName || p.user.name || p.user.username;
            const primary =
              p.telegramInviteLink ||
              p.telegramChannelUrl ||
              `${baseUrl}/r/${p.refCode}`;
            return (
              <div key={p.id} className="ui-card p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{name}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Логин: {p.user.username} · Код:{" "}
                    <span className="font-mono text-cyan-300">{p.refCode}</span>
                    {" · "}Клиентов: {p._count.clients}
                    {" · "}Подписчиков: {p._count.subscribers}
                    {" · "}Создан: {formatDate(p.createdAt)}
                    {" · "}
                    {p.active ? (
                      <span className="text-emerald-400">Активен</span>
                    ) : (
                      <span className="text-rose-400">Отключён</span>
                    )}
                  </p>
                </div>

                <div className="rounded-xl bg-surface-raised border border-border px-3 py-3 text-sm">
                  <div className="text-xs text-slate-500 mb-1">
                    Персональная ссылка
                    {p.telegramInviteLink
                      ? ` (invite · ${p.telegramInviteLinkName || p.refCode})`
                      : p.telegramChannelUrl
                        ? " (TGK)"
                        : " (веб-реф)"}
                  </div>
                  <div className="font-mono text-cyan-300 break-all text-xs">
                    {primary}
                  </div>
                  <div className="mt-2">
                    <CopyButton text={primary} label="Копировать" />
                  </div>
                </div>

                <EditPartnerForm
                  partner={{
                    id: p.id,
                    refCode: p.refCode,
                    displayName: p.displayName,
                    telegramChannelUrl: p.telegramChannelUrl,
                    telegramUsername: p.telegramUsername,
                    telegramInviteLink: p.telegramInviteLink,
                    telegramInviteLinkName: p.telegramInviteLinkName,
                    defaultCommission: p.defaultCommission,
                    active: p.active,
                    user: { name: p.user.name, username: p.user.username },
                  }}
                  baseUrl={baseUrl}
                  inviteConfigured={inviteConfigured}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
