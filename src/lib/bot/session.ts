import { prisma } from "@/lib/prisma";

export type SessionPayload = Record<string, unknown>;

export async function getSession(telegramId: string) {
  return prisma.botSession.upsert({
    where: { telegramId },
    create: { telegramId, scene: "idle", payload: "{}" },
    update: {},
  });
}

export async function setScene(
  telegramId: string,
  scene: string,
  payload: SessionPayload = {}
) {
  return prisma.botSession.upsert({
    where: { telegramId },
    create: {
      telegramId,
      scene,
      payload: JSON.stringify(payload),
    },
    update: {
      scene,
      payload: JSON.stringify(payload),
    },
  });
}

export async function clearScene(telegramId: string) {
  return setScene(telegramId, "idle", {});
}

export function parsePayload(raw: string): SessionPayload {
  try {
    return JSON.parse(raw || "{}") as SessionPayload;
  } catch {
    return {};
  }
}
