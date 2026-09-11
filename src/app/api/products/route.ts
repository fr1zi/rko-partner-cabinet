import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { getActiveProductRates, getAllProductRates, ensureProductRates } from "@/lib/products";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all") === "1";
  if (all) {
    const session = await requireSession("ADMIN");
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rates = await getAllProductRates();
    return NextResponse.json(rates);
  }
  const rates = await getActiveProductRates();
  return NextResponse.json(rates);
}

const upsertSchema = z.object({
  id: z.string().optional(),
  productKey: z.string().min(1).optional(),
  productName: z.string().min(1),
  premium: z.number().min(0),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await requireSession("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ensureProductRates();
    const body = await req.json();

    if (Array.isArray(body.rates)) {
      const updated = [];
      for (const item of body.rates) {
        const parsed = upsertSchema.safeParse(item);
        if (!parsed.success) {
          return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
        }
        const d = parsed.data;
        if (d.id) {
          const row = await prisma.productRate.update({
            where: { id: d.id },
            data: {
              productName: d.productName,
              premium: d.premium,
              ...(d.sortOrder != null ? { sortOrder: d.sortOrder } : {}),
              ...(d.active != null ? { active: d.active } : {}),
            },
          });
          updated.push(row);
        } else if (d.productKey) {
          const row = await prisma.productRate.upsert({
            where: { productKey: d.productKey },
            update: {
              productName: d.productName,
              premium: d.premium,
              sortOrder: d.sortOrder ?? 0,
              active: d.active ?? true,
            },
            create: {
              productKey: d.productKey,
              productName: d.productName,
              premium: d.premium,
              sortOrder: d.sortOrder ?? 0,
              active: d.active ?? true,
            },
          });
          updated.push(row);
        }
      }
      return NextResponse.json({ ok: true, rates: updated });
    }

    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success || !parsed.data.id) {
      return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
    }
    const d = parsed.data;
    const row = await prisma.productRate.update({
      where: { id: d.id },
      data: {
        productName: d.productName,
        premium: d.premium,
        ...(d.sortOrder != null ? { sortOrder: d.sortOrder } : {}),
        ...(d.active != null ? { active: d.active } : {}),
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
