import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { getPremiumForProduct, getActiveProductRates } from "@/lib/products";
import { z } from "zod";
import type { ClientStatus, CommissionStatus } from "@/lib/types";

export async function GET(req: NextRequest) {
  const session = await requireSession("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = req.nextUrl.searchParams.get("status");
  const clients = await prisma.client.findMany({
    where: status ? { status } : undefined,
    include: {
      partner: {
        include: { user: { select: { name: true, username: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(clients);
}

const updateSchema = z.object({
  id: z.string(),
  status: z
    .enum(["new", "application", "approved", "issued", "paid", "rejected"])
    .optional(),
  commission: z.number().optional(),
  commissionStatus: z.enum(["pending", "paid"]).optional(),
  amount: z.number().nullable().optional(),
  product: z.string().optional(),
  applyPriceList: z.boolean().optional(),
});


const createSchema = z.object({
  partnerId: z.string().min(1),
  name: z.string().min(1),
  telegramUsername: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  product: z.string().optional(),
  status: z
    .enum(["new", "application", "approved", "issued", "paid", "rejected"])
    .optional(),
  commission: z.number().optional(),
  comment: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await requireSession("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
    }
    const data = parsed.data;
    const partner = await prisma.partner.findUnique({
      where: { id: data.partnerId },
    });
    if (!partner || !partner.active) {
      return NextResponse.json({ error: "Траффер не найден" }, { status: 404 });
    }

    const rates = await getActiveProductRates();
    const defaultProduct = rates[0]?.productName || "РКО (открытие счёта)";
    const product = data.product || defaultProduct;
    const commission =
      data.commission != null
        ? data.commission
        : await getPremiumForProduct(product);

    const tg = data.telegramUsername?.trim().replace(/^@+/, "") || null;
    const phone =
      data.phone?.trim() ||
      (tg ? `tg:@${tg}` : "telegram");

    const client = await prisma.client.create({
      data: {
        partnerId: partner.id,
        name: data.name.trim(),
        phone,
        comment:
          data.comment?.trim() ||
          (tg ? `Telegram @${tg}` : "Лид из Telegram (вручную)"),
        product,
        status: data.status || "new",
        commission,
        commissionStatus: "pending",
        telegramId: tg ? `username:${tg}` : null,
      },
    });
    return NextResponse.json({ ok: true, client });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
    }
    const { id, applyPriceList, ...data } = parsed.data;

    let commission = data.commission;
    if (data.product && applyPriceList) {
      commission = await getPremiumForProduct(data.product);
    }

    const client = await prisma.client.update({
      where: { id },
      data: {
        ...(data.status != null ? { status: data.status } : {}),
        ...(commission != null ? { commission } : {}),
        ...(data.commissionStatus != null
          ? { commissionStatus: data.commissionStatus }
          : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.product != null ? { product: data.product } : {}),
      } as {
        status?: ClientStatus;
        commission?: number;
        commissionStatus?: CommissionStatus;
        amount?: number | null;
        product?: string;
      },
    });
    return NextResponse.json(client);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
