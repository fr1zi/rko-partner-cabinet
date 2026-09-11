import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Role } from "./types";

const COOKIE_NAME = "rko_session";
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "rko-partner-cabinet-dev-secret-change-in-prod"
);

export type SessionPayload = {
  userId: string;
  username: string;
  role: Role;
  partnerId?: string;
  refCode?: string;
  telegramId?: string;
};

function cookieOpts(maxAge: number) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const https = appUrl.startsWith("https://");
  return {
    httpOnly: true,
    secure: https || process.env.NODE_ENV === "production",
    // Mini App on HTTPS needs SameSite=None for Telegram WebView cookies
    sameSite: (https ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge,
  };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function createSession(payload: SessionPayload) {
  const token = await signSessionToken(payload);
  cookies().set(COOKIE_NAME, token, cookieOpts(60 * 60 * 24 * 7));
}

export async function destroySession() {
  cookies().set(COOKIE_NAME, "", {
    ...cookieOpts(0),
    maxAge: 0,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function requireSession(role?: Role) {
  const session = await getSession();
  if (!session) return null;
  if (role && session.role !== role) return null;
  return session;
}

export async function loginUser(username: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { partner: true },
  });
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  const payload: SessionPayload = {
    userId: user.id,
    username: user.username,
    role: user.role as Role,
  };
  if (user.partner) {
    payload.partnerId = user.partner.id;
    payload.refCode = user.partner.refCode;
  }
  await createSession(payload);
  return payload;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}

export { COOKIE_NAME };
