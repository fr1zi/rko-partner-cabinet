import { PrismaClient } from "@prisma/client";
import { catalogEntries } from "../src/lib/productDefaults";

const prisma = new PrismaClient();

async function main() {
  await prisma.botProduct.updateMany({
    where: { bank: "" },
    data: { isActive: false },
  });

  for (const entry of catalogEntries()) {
    const existing = await prisma.botProduct.findFirst({
      where: { title: entry.title, bank: entry.bank },
    });
    if (existing) {
      await prisma.botProduct.update({
        where: { id: existing.id },
        data: {
          description: existing.description || entry.description,
          isActive: true,
          rewardType: "fixed",
        },
      });
      console.log("keep", entry.bank, entry.title, existing.reward, existing.subscriberPrice);
    } else {
      await prisma.botProduct.create({
        data: {
          title: entry.title,
          bank: entry.bank,
          description: entry.description,
          reward: entry.reward,
          subscriberPrice: entry.subscriberPrice,
          rewardType: "fixed",
          url: "",
          isActive: true,
        },
      });
      console.log("create", entry.bank, entry.title);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
