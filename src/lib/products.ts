import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PRODUCT_RATES,
  LEGACY_FLAT_PRODUCT_KEYS,
} from "@/lib/productDefaults";

export { DEFAULT_PRODUCT_RATES };

/** Upsert catalog premiums so web ProductRate stays aligned with DEFAULT_PRODUCT_RATES. */
export async function ensureProductRates() {
  const catalogKeys = new Set(DEFAULT_PRODUCT_RATES.map((r) => r.productKey));

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

  // Remove pre–per-bank flat rows (rko, debit_card, …); deactivate other stale keys.
  await prisma.productRate.deleteMany({
    where: { productKey: { in: [...LEGACY_FLAT_PRODUCT_KEYS] } },
  });
  await prisma.productRate.updateMany({
    where: {
      productKey: { notIn: Array.from(catalogKeys) },
      active: true,
    },
    data: { active: false },
  });
}

export async function getActiveProductRates() {
  await ensureProductRates();
  return prisma.productRate.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getAllProductRates() {
  await ensureProductRates();
  return prisma.productRate.findMany({
    orderBy: { sortOrder: "asc" },
  });
}

/** Resolve premium (комиссия/премия) for a product name from current price list. */
export async function getPremiumForProduct(
  productName: string | null | undefined
): Promise<number> {
  await ensureProductRates();
  if (productName) {
    const byName = await prisma.productRate.findFirst({
      where: { productName, active: true },
    });
    if (byName) return byName.premium;

    const byKey = await prisma.productRate.findFirst({
      where: { productKey: productName, active: true },
    });
    if (byKey) return byKey.premium;
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });
  if (settings) return settings.defaultCommission;

  const first = await prisma.productRate.findFirst({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  return first?.premium ?? 3000;
}
