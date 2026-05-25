import { config } from "dotenv";

config();

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:4000";
const internalSyncToken = process.env.INTERNAL_SYNC_TOKEN ?? "internal_sync_token_change_me";
const intervalMs = Number(process.env.SYNC_INTERVAL_MS ?? 300000);

async function runSyncRound() {
  const response = await fetch(`${apiBaseUrl}/api/internal/sync/all`, {
    method: "POST",
    headers: {
      "x-internal-token": internalSyncToken
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Worker sync request failed (${response.status}): ${body}`);
  }
  const payload = await response.json();
  console.log(`[worker] sync completed`, payload);
}

async function start() {
  console.log(`[worker] started, interval=${intervalMs}ms`);
  try {
    await runSyncRound();
  } catch (error) {
    console.error(`[worker] initial sync failed`, error);
  }

  setInterval(async () => {
    try {
      await runSyncRound();
    } catch (error) {
      console.error(`[worker] scheduled sync failed`, error);
    }
  }, intervalMs);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
