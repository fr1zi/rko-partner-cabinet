import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export { formatOrderNumber } from "@/lib/orderNumber";

/** Searchable short code: RKO-YYMM-XXXX (prefix + year/month + 4 hex). */
function createId() {
  const d = new Date();
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const suffix = randomBytes(2).toString("hex").toUpperCase();
  return `RKO-${yy}${mm}-${suffix}`;
}

async function ensureOrderIdColumn() {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "BotLead" ADD COLUMN IF NOT EXISTS "orderId" TEXT`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "BotLead_orderId_idx" ON "BotLead"("orderId")`
    );
  } catch {
    /* ignore */
  }
}

/** Escape for Telegram HTML parse_mode so multi-line receipts never fail silently. */
export function escapeTgHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type OrderLineInput = {
  productId: string;
};

/** Create one receipt (order) with several product lines as BotLead rows. */
export async function createProductOrder(opts: {
  clientId: string;
  referrerId?: string | null;
  fullName: string;
  phone?: string;
  productIds: string[];
  adminComment?: string;
}) {
  await ensureOrderIdColumn();
  // Preserve caller order; Set keeps insertion order
  const ids = Array.from(
    new Set(opts.productIds.map(String).filter(Boolean))
  );
  if (ids.length === 0) {
    return { error: "нет продуктов" as const };
  }

  const found = await prisma.botProduct.findMany({
    where: { id: { in: ids }, isActive: true },
  });
  // Map by id — Prisma findMany order is undefined
  const byId = new Map(found.map((p) => [p.id, p]));
  const products = ids
    .map((id) => byId.get(id))
    .filter((p): p is (typeof found)[number] => Boolean(p));

  if (products.length === 0) {
    return { error: "продукты недоступны" as const };
  }

  const orderId = createId();
  const created: string[] = [];
  const lines: Array<{ title: string; bank: string }> = [];
  const skippedInactive = ids.filter((id) => !byId.has(id));
  const skippedDup: string[] = [];

  // Sequential creates in input order (same orderId groups the чек)
  for (const product of products) {
    const dup = await prisma.botLead.findFirst({
      where: {
        clientId: opts.clientId,
        productId: product.id,
        status: { not: "rejected" },
      },
    });
    if (dup) {
      skippedDup.push(product.id);
      continue;
    }

    const lead = await prisma.botLead.create({
      data: {
        orderId,
        clientId: opts.clientId,
        referrerId: opts.referrerId || null,
        productId: product.id,
        fullName: opts.fullName,
        phone: opts.phone || "",
        status: "processing",
        adminComment: opts.adminComment || null,
      },
    });
    created.push(lead.id);
    lines.push({ title: product.title, bank: product.bank || "" });
  }

  if (created.length === 0) {
    return { error: "заявки по выбранным продуктам уже есть" as const };
  }

  return {
    orderId,
    created,
    lines,
    skippedInactive,
    skippedDup,
    requested: ids.length,
  };
}

export function formatOrderReceipt(
  lines: Array<{ title: string; bank?: string | null; qty?: number }>,
  opts?: { html?: boolean }
) {
  const html = opts?.html !== false;
  return lines
    .map((l, i) => {
      const rawName = l.bank ? `${l.title} · ${l.bank}` : l.title;
      const name = html ? escapeTgHtml(rawName) : rawName;
      const qty = l.qty ?? 1;
      // ASCII "x" avoids rare HTML/client glitches with "×" on long messages
      return `${i + 1}. ${name} x${qty}`;
    })
    .join("\n");
}
