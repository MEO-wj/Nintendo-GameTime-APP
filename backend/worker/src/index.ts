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

async function runCatalogRefresh() {
  const response = await fetch(`${apiBaseUrl}/api/internal/catalog/refresh`, {
    method: "POST",
    headers: {
      "x-internal-token": internalSyncToken
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Worker catalog refresh failed (${response.status}): ${body}`);
  }
  const payload = await response.json();
  console.log(`[worker] catalog refresh completed`, payload);
}

async function runCrawlerStatus() {
  const response = await fetch(`${apiBaseUrl}/api/internal/crawler/status`, {
    headers: { "x-internal-token": internalSyncToken }
  });
  if (response.ok) {
    const status = await response.json();
    console.log(`[worker] crawler status`, status);
  }
}

const catalogRefreshMs = Number(process.env.CATALOG_REFRESH_MS ?? 1800000); // 30 min

async function start() {
  console.log(`[worker] started, syncInterval=${intervalMs}ms, catalogRefresh=${catalogRefreshMs}ms`);
  try {
    await runSyncRound();
  } catch (error) {
    console.error(`[worker] initial sync failed`, error);
  }

  // Sync loop
  setInterval(async () => {
    try {
      await runSyncRound();
    } catch (error) {
      console.error(`[worker] scheduled sync failed`, error);
    }
  }, intervalMs);

  // Catalog refresh loop (less frequent)
  setInterval(async () => {
    try {
      await runCatalogRefresh();
    } catch (error) {
      console.error(`[worker] catalog refresh failed`, error);
    }
  }, catalogRefreshMs);

  // Crawler status check every 5 minutes
  setInterval(async () => {
    try {
      await runCrawlerStatus();
    } catch (error) {
      // silent
    }
  }, 300000);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
