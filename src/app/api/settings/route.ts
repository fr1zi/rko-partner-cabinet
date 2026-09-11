import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  const session = await requireSession("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.settings.create({
      data: { id: "default", defaultCommission: 3000 },
    });
  }
  return NextResponse.json(settings);
}

const schema = z.object({
  defaultCommission: z.number().min(0),
});

export async function PATCH(req: NextRequest) {
  const session = await requireSession("ADMIN");
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
    }
    const settings = await prisma.settings.upsert({
      where: { id: "default" },
      update: { defaultCommission: parsed.data.defaultCommission },
      create: {
        id: "default",
        defaultCommission: parsed.data.defaultCommission,
      },
    });
    return NextResponse.json(settings);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
