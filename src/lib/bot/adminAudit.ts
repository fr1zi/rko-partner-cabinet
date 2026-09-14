import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";
import { formatOrderNumber } from "@/lib/orderNumber";
import { formatMoney } from "@/lib/bot/users";

export {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  type AuditAction,
} from "./adminAuditLabels";

const STATUS_RU: Record<string, string> = {
  processing: "в обработке",
  awaiting_payout: "ждём выплату",
  paid: "выплачено",
  rejected: "отклонено",
  new: "новый",
  approved: "одобрен",
};

let ensurePromise: Promise<void> | null = null;

/**
 * Ensure AdminAuditLog exists on prod even if migrate lagged (Vercel).
 */
export async function ensureAdminAuditLogTable() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      try {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
            "id" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "actorTelegramId" TEXT NOT NULL,
            "actorUsername" TEXT,
            "action" TEXT NOT NULL,
            "targetSummary" TEXT NOT NULL,
            "note" TEXT,
            "metadata" JSONB,
            CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
          )
        `);
      } catch {
        /* ignore */
      }
      try {
        await prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt")`
        );
      } catch {
        /* ignore */
      }
      try {
        await prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_idx" ON "AdminAuditLog"("action")`
        );
      } catch {
        /* ignore */
      }
      try {
        await prisma.$executeRawUnsafe(
          `CREATE INDEX IF NOT EXISTS "AdminAuditLog_actorTelegramId_idx" ON "AdminAuditLog"("actorTelegramId")`
        );
      } catch {
        /* ignore */
      }
    })();
  }
  await ensurePromise;
}

export function statusRu(status: string) {
  return STATUS_RU[status] || status;
}

export function actorFromSession(session: SessionPayload) {
  return {
    actorTelegramId: String(session.telegramId || session.userId || "unknown"),
    actorUsername: session.username || null,
  };
}

export async function writeAdminAudit(opts: {
  session: SessionPayload;
  action: string;
  targetSummary: string;
  note?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}) {
  try {
    await ensureAdminAuditLogTable();
    const actor = actorFromSession(opts.session);
    await prisma.adminAuditLog.create({
      data: {
        actorTelegramId: actor.actorTelegramId,
        actorUsername: actor.actorUsername,
        action: opts.action,
        targetSummary: opts.targetSummary,
        note: opts.note?.trim() ? opts.note.trim() : null,
        metadata: opts.metadata ?? undefined,
      },
    });
  } catch (err) {
    console.error("[adminAudit] write failed", err);
  }
}

export function leadTargetSummary(lead: {
  id: string;
  orderId?: string | null;
  status?: string;
  fullName?: string | null;
  product?: { title?: string | null; bank?: string | null } | null;
  client?: { username?: string | null; telegramId?: string | null } | null;
}) {
  const order =
    lead.orderId != null ? formatOrderNumber(lead.orderId) : lead.id.slice(0, 8);
  const product =
    [lead.product?.bank, lead.product?.title].filter(Boolean).join(" · ") ||
    "продукт";
  const user =
    lead.client?.username
      ? `@${String(lead.client.username).replace(/^@/, "")}`
      : lead.client?.telegramId
        ? `tg:${lead.client.telegramId}`
        : lead.fullName || "клиент";
  return `Заявка ${order} · ${product} · ${user}`;
}

export function userTargetSummary(u: {
  username?: string | null;
  telegramId?: string;
  firstName?: string | null;
  balance?: number;
}) {
  const handle = u.username
    ? `@${String(u.username).replace(/^@/, "")}`
    : u.telegramId
      ? `tg:${u.telegramId}`
      : u.firstName || "юзер";
  if (typeof u.balance === "number") {
    return `${handle} · баланс ${formatMoney(u.balance)}`;
  }
  return handle;
}

export function productTargetSummary(p: {
  title?: string | null;
  bank?: string | null;
  id?: string;
}) {
  const label =
    [p.bank, p.title].filter(Boolean).join(" · ") || p.id || "оффер";
  return label;
}
