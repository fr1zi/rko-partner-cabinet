/**
 * Local Telegram long-poller: getUpdates → POST /api/telegram/webhook
 */
import fs from "fs";
import path from "path";

function loadEnvLocal(): Record<string, string> {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const env = loadEnvLocal();
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN missing in .env.local");
    process.exit(1);
  }
  const webhookUrl =
    process.env.WEBHOOK_URL || "http://127.0.0.1:3000/api/telegram/webhook";
  let offset = 0;
  console.log("telegram poller started →", webhookUrl);

  while (true) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offset,
          timeout: 25,
          allowed_updates: ["message", "callback_query", "chat_member"],
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        description?: string;
        result?: Array<{ update_id: number }>;
      };
      if (!data.ok) {
        console.error("getUpdates fail:", data.description);
        await sleep(4000);
        continue;
      }
      for (const upd of data.result || []) {
        offset = upd.update_id + 1;
        try {
          const wr = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(upd),
          });
          const body = await wr.text();
          console.log("update", upd.update_id, wr.status, body.slice(0, 180));
        } catch (e) {
          console.error("forward fail", e);
        }
      }
    } catch (e) {
      console.error("poll error", e);
      await sleep(4000);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
