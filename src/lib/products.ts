import { prisma } from "@/lib/prisma";
import { DEFAULT_PRODUCT_RATES } from "@/lib/productDefaults";

export { DEFAULT_PRODUCT_RATES };

export async function ensureProductRates() {
  const count = await prisma.productRate.count();
  if (count === 0) {
    await prisma.productRate.createMany({
      data: DEFAULT_PRODUCT_RATES.map((r) => ({
        productKey: r.productKey,
        productName: r.productName,
        premium: r.premium,
        sortOrder: r.sortOrder,
        active: true,
      })),
    });
  }
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
