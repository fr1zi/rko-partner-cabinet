import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "rko_session";
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "rko-partner-cabinet-dev-secret-change-in-prod"
);

async function getPayload(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as { role?: string };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await getPayload(req);

  if (pathname.startsWith("/partner")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (session.role !== "PARTNER") {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
  }

  if (pathname.startsWith("/admin")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (session.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/partner", req.url));
    }
  }

  if (pathname === "/login" && session) {
    const dest = session.role === "ADMIN" ? "/admin" : "/partner";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/partner/:path*", "/admin/:path*", "/login"],
};
