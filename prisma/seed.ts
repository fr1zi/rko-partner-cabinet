import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_PRODUCT_RATES } from "../src/lib/productDefaults";

const prisma = new PrismaClient();

async function main() {
  // Minimal seed — never invent demo traffers/clients (that polluted admin UI on Neon)
  await prisma.settings.upsert({
    where: { id: "default" },
    update: { defaultCommission: 7500 },
    create: { id: "default", defaultCommission: 7500 },
  });

  for (const r of DEFAULT_PRODUCT_RATES) {
    await prisma.productRate.upsert({
      where: { productKey: r.productKey },
      update: {
        productName: r.productName,
        premium: r.premium,
        sortOrder: r.sortOrder,
        active: true,
      },
      create: {
        productKey: r.productKey,
        productName: r.productName,
        premium: r.premium,
        sortOrder: r.sortOrder,
        active: true,
      },
    });
  }

  const adminHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: adminHash,
      role: "ADMIN",
      name: "Администратор",
    },
  });

  console.log("Seed OK: settings + product rates + admin / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
