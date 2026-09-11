import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPremiumForProduct, getActiveProductRates } from "@/lib/products";
import { z } from "zod";

const schema = z.object({
  refCode: z.string().min(1),
  name: z.string().min(2, "Укажите имя"),
  phone: z.string().min(6, "Укажите телефон"),
  inn: z.string().optional(),
  comment: z.string().optional(),
  product: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Неверные данные" },
        { status: 400 }
      );
    }

    const { refCode, name, phone, inn, comment } = parsed.data;
    const partner = await prisma.partner.findUnique({ where: { refCode } });
    if (!partner || !partner.active) {
      return NextResponse.json(
        { error: "Реферальная ссылка недействительна" },
        { status: 404 }
      );
    }

    const rates = await getActiveProductRates();
    const defaultProduct =
      rates[0]?.productName || "РКО (открытие счёта)";
    const product = parsed.data.product || defaultProduct;
    const known = rates.some((r) => r.productName === product);
    const finalProduct = known ? product : defaultProduct;

    const commission = await getPremiumForProduct(finalProduct);

    const client = await prisma.client.create({
      data: {
        partnerId: partner.id,
        name,
        phone,
        inn: inn || null,
        comment: comment || null,
        status: "new",
        commission,
        commissionStatus: "pending",
        product: finalProduct,
      },
    });

    return NextResponse.json({ ok: true, id: client.id, commission });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
