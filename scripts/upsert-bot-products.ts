import { PrismaClient } from "@prisma/client";
import { DEFAULT_PRODUCT_RATES } from "../src/lib/productDefaults";

const prisma = new PrismaClient();
const TITLE: Record<string, string> = {
  rko: "РКО (открытие счёта)",
  debit_card: "Дебетовая карта",
  credit_card: "Кредитная карта",
  acquiring: "Эквайринг",
  salary_project: "Зарплатный проект",
  deposit: "Депозит для бизнеса",
};

async function main() {
  for (const r of DEFAULT_PRODUCT_RATES) {
    const title = TITLE[r.productKey] || r.productName;
    const existing = await prisma.botProduct.findFirst({ where: { title } });
    if (existing) {
      const subscriberPrice =
        existing.subscriberPrice && existing.subscriberPrice > 0
          ? existing.subscriberPrice
          : existing.reward || r.premium;
      await prisma.botProduct.update({
        where: { id: existing.id },
        data: {
          reward: r.premium,
          subscriberPrice,
          rewardType: "fixed",
          isActive: true,
        },
      });
      console.log("updated", title);
    } else {
      await prisma.botProduct.create({
        data: {
          title,
          bank: "",
          description: r.productName,
          reward: r.premium,
          subscriberPrice: r.premium,
          rewardType: "fixed",
          url: "",
          isActive: true,
        },
      });
      console.log("created", title);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
