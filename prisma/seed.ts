import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_PRODUCT_RATES } from "../src/lib/productDefaults";

const prisma = new PrismaClient();

async function main() {
  await prisma.client.deleteMany();
  await prisma.subscriber.deleteMany();
  await prisma.telegramUser.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.user.deleteMany();
  await prisma.settings.deleteMany();
  await prisma.productRate.deleteMany();

  await prisma.settings.create({
    data: { id: "default", defaultCommission: 3500 },
  });

  await prisma.productRate.createMany({
    data: DEFAULT_PRODUCT_RATES.map((r) => ({
      productKey: r.productKey,
      productName: r.productName,
      premium: r.premium,
      sortOrder: r.sortOrder,
      active: true,
    })),
  });

  const adminHash = await bcrypt.hash("admin123", 10);
  await prisma.user.create({
    data: {
      username: "admin",
      passwordHash: adminHash,
      role: "ADMIN",
      name: "Администратор",
    },
  });

  const partnerHash = await bcrypt.hash("partner123", 10);
  const partnerUser = await prisma.user.create({
    data: {
      username: "partner",
      passwordHash: partnerHash,
      role: "PARTNER",
      name: "Демо Партнёр",
      partner: {
        create: {
          refCode: "DEMO01",
          displayName: "Демо Партнёр",
          telegramChannelUrl: "https://t.me/+demoDEMO01",
          telegramInviteLink: "https://t.me/+demoDEMO01",
          telegramInviteLinkName: "DEMO01",
          telegramUsername: "@demo_traffer",
          defaultCommission: 3500,
          active: true,
        },
      },
    },
    include: { partner: true },
  });

  const partner2 = await prisma.user.create({
    data: {
      username: "traffer2",
      passwordHash: partnerHash,
      role: "PARTNER",
      name: "Иванов Сергей",
      partner: {
        create: {
          refCode: "IVAN02",
          displayName: "Иванов Сергей",
          telegramChannelUrl: "https://t.me/+demoIVAN02",
          telegramInviteLink: "https://t.me/+demoIVAN02",
          telegramInviteLinkName: "IVAN02",
          telegramUsername: "@ivan_traffer",
          defaultCommission: 3500,
          active: true,
        },
      },
    },
    include: { partner: true },
  });

  const partner3 = await prisma.user.create({
    data: {
      username: "traffer3",
      passwordHash: partnerHash,
      role: "PARTNER",
      name: "Петрова Анна",
      partner: {
        create: {
          refCode: "ANNA03",
          displayName: "Петрова Анна",
          telegramChannelUrl: "https://t.me/+demoANNA03",
          telegramInviteLink: "https://t.me/+demoANNA03",
          telegramInviteLinkName: "ANNA03",
          telegramUsername: "@anna_biz",
          defaultCommission: 3500,
          active: true,
        },
      },
    },
    include: { partner: true },
  });

  const partnerId = partnerUser.partner!.id;
  const partner2Id = partner2.partner!.id;
  const partner3Id = partner3.partner!.id;

  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  };

  await prisma.client.createMany({
    data: [
      {
        partnerId,
        name: "ИП Смирнов Алексей Петрович",
        phone: "tg:@smirnov_biz",
        inn: "667001234567",
        comment: "Из Telegram-чата",
        product: "РКО (открытие счёта)",
        status: "new",
        commission: 3500,
        commissionStatus: "pending",
        createdAt: daysAgo(1),
      },
      {
        partnerId,
        name: "ООО «СеверТрейд»",
        phone: "+7 495 111-22-33",
        inn: "7701234567",
        comment: "Счёт для оптовых поставок",
        product: "РКО (открытие счёта)",
        amount: 0,
        status: "application",
        commission: 3500,
        commissionStatus: "pending",
        createdAt: daysAgo(3),
      },
      {
        partnerId,
        name: "ИП Ковалёва Марина Сергеевна",
        phone: "+7 903 777-88-99",
        inn: "500998877665",
        comment: "Салон красоты, Москва",
        product: "Дебетовая карта",
        amount: 150000,
        status: "issued",
        commission: 1500,
        commissionStatus: "paid",
        createdAt: daysAgo(12),
      },
      {
        partnerId,
        name: "ООО «ЛогистикПлюс»",
        phone: "+7 812 333-44-55",
        inn: "7812345678",
        comment: "Зарплатный проект на 45 сотрудников",
        product: "Зарплатный проект",
        status: "approved",
        commission: 1800,
        commissionStatus: "pending",
        createdAt: daysAgo(5),
      },
      {
        partnerId,
        name: "ИП Орлов Дмитрий",
        phone: "+7 916 200-30-40",
        product: "Кредитная карта",
        status: "rejected",
        commission: 2500,
        commissionStatus: "pending",
        comment: "Отказ банка по скорингу",
        createdAt: daysAgo(8),
      },
      {
        partnerId,
        name: "ООО «ФудМаркет»",
        phone: "+7 495 888-77-66",
        inn: "7709988776",
        product: "Эквайринг",
        status: "paid",
        commission: 2000,
        commissionStatus: "paid",
        amount: 0,
        createdAt: daysAgo(20),
      },
      {
        partnerId: partner2Id,
        name: "ООО «УралСтрой»",
        phone: "+7 343 200-11-22",
        inn: "6671122334",
        comment: "Эквайринг для строймагазина",
        product: "Эквайринг",
        status: "approved",
        commission: 2000,
        commissionStatus: "pending",
        createdAt: daysAgo(2),
      },
      {
        partnerId: partner2Id,
        name: "ИП Петров Николай",
        phone: "tg:@petrov_n",
        product: "Кредитная карта",
        status: "new",
        commission: 2500,
        commissionStatus: "pending",
        createdAt: daysAgo(0),
      },
      {
        partnerId: partner2Id,
        name: "ИП Белова Елена",
        phone: "+7 343 900-10-20",
        inn: "667009988776",
        product: "РКО (открытие счёта)",
        status: "issued",
        commission: 3500,
        commissionStatus: "paid",
        createdAt: daysAgo(15),
      },
      {
        partnerId: partner2Id,
        name: "ООО «МеталлСервис»",
        phone: "+7 343 111-00-99",
        product: "Депозит для бизнеса",
        status: "application",
        commission: 1200,
        commissionStatus: "pending",
        createdAt: daysAgo(4),
      },
      {
        partnerId: partner3Id,
        name: "ИП Кузнецов Игорь",
        phone: "tg:@kuz_igor",
        inn: "500112233445",
        product: "РКО (открытие счёта)",
        status: "new",
        commission: 3500,
        commissionStatus: "pending",
        comment: "Интернет-магазин, Казань",
        createdAt: daysAgo(1),
      },
      {
        partnerId: partner3Id,
        name: "ООО «BeautyLab»",
        phone: "+7 843 200-55-66",
        product: "Дебетовая карта",
        status: "issued",
        commission: 1500,
        commissionStatus: "pending",
        createdAt: daysAgo(7),
      },
      {
        partnerId: partner3Id,
        name: "ИП Морозова Ольга",
        phone: "+7 917 333-22-11",
        product: "Эквайринг",
        status: "paid",
        commission: 2000,
        commissionStatus: "paid",
        createdAt: daysAgo(18),
      },
    ],
  });

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    // Demo channel subscribers when bot is not connected
    await prisma.subscriber.createMany({
      data: [
        {
          telegramId: "100001",
          username: "@demo_sub1",
          partnerId,
          inviteLink: "https://t.me/+demoDEMO01",
          inviteLinkName: "DEMO01",
          joinedAt: daysAgo(2),
          isDemo: true,
        },
        {
          telegramId: "100002",
          username: "@demo_sub2",
          partnerId,
          inviteLink: "https://t.me/+demoDEMO01",
          inviteLinkName: "DEMO01",
          joinedAt: daysAgo(5),
          isDemo: true,
        },
        {
          telegramId: "100003",
          username: "@ivan_lead",
          partnerId: partner2Id,
          inviteLink: "https://t.me/+demoIVAN02",
          inviteLinkName: "IVAN02",
          joinedAt: daysAgo(1),
          isDemo: true,
        },
        {
          telegramId: "100004",
          username: "@anna_sub",
          partnerId: partner3Id,
          inviteLink: "https://t.me/+demoANNA03",
          inviteLinkName: "ANNA03",
          joinedAt: daysAgo(3),
          isDemo: true,
        },
      ],
    });
    console.log("  + 4 demo subscribers (бот не подключён)");
  }

  console.log("Seed OK:");
  console.log("  admin / admin123");
  console.log("  partner / partner123 (ref DEMO01)");
  console.log("  traffer2 / partner123 (ref IVAN02)");
  console.log("  traffer3 / partner123 (ref ANNA03)");
  console.log("  product rates + 13 demo clients");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
