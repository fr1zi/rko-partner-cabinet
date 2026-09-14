import { NextRequest, NextResponse } from "next/server";
import { buildAndSendDailyDigest } from "@/lib/bot/dailyDigest";

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const bearer =
    auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
  const querySecret = req.nextUrl.searchParams.get("secret") || "";

  if (secret) {
    return bearer === secret || querySecret === secret;
  }
  // Dev only: allow when CRON_SECRET unset
  return process.env.NODE_ENV === "development";
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await buildAndSendDailyDigest();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "digest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
