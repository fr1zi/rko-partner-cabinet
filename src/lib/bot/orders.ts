import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

function createId() {
  return `ord_${randomBytes(10).toString("hex")}`;
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
  const ids = Array.from(
    new Set(opts.productIds.map(String).filter(Boolean))
  );
  if (ids.length === 0) {
    return { error: "нет продуктов" as const };
  }

  const products = await prisma.botProduct.findMany({
    where: { id: { in: ids }, isActive: true },
  });
  if (products.length === 0) {
    return { error: "продукты недоступны" as const };
  }

  const orderId = createId();
  const created: string[] = [];
  const lines: Array<{ title: string; bank: string }> = [];

  for (const product of products) {
    const dup = await prisma.botLead.findFirst({
      where: {
        clientId: opts.clientId,
        productId: product.id,
        status: { not: "rejected" },
      },
    });
    if (dup) continue;

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

  return { orderId, created, lines };
}

export function formatOrderReceipt(
  lines: Array<{ title: string; bank?: string | null; qty?: number }>
) {
  return lines
    .map((l) => {
      const name = l.bank ? `${l.title} · ${l.bank}` : l.title;
      return `${name} ×${l.qty ?? 1}`;
    })
    .join("\n");
}
