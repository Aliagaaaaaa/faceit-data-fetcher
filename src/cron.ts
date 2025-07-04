import { Env } from "./types";
import { fetchFilteredLiveMatches, fetchGlobalRanking } from "./faceitApi";
import { storeMatches, storeRanking } from "./db";

export async function runCron(env: Env): Promise<void> {
  console.log("[cron] Starting Faceit live match sync…");

  if (!env.FACEIT_COOKIE) {
    console.error("FACEIT_COOKIE env var not set. Skipping cron.");
    return;
  }

  try {
    const matches = await fetchFilteredLiveMatches(env.FACEIT_COOKIE);
    await storeMatches(env.DB, matches);
    console.log(`[cron] Updated ${matches.length} matches in D1.`);

    // Fetch and store top 500 ranking
    try {
      const ranking = await fetchGlobalRanking(500);
      await storeRanking(env.DB, ranking);
      console.log(`[cron] Cached top ${ranking.length} ranking entries.`);
    } catch (err) {
      console.error("[cron] Failed to sync ranking:", err);
    }

    // Broadcast to all WebSocket clients via Durable Object
    try {
      const id = env.LIVE_MATCHES_SOCKET.idFromName("global");
      const stub = env.LIVE_MATCHES_SOCKET.get(id);
      await stub.fetch("https://broadcast/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches }),
      });
    } catch (err) {
      console.error("[cron] Failed to broadcast live matches:", err);
    }
  } catch (err) {
    console.error("[cron] Error while syncing matches:", err);
  }

  console.log("[cron] Completed.");
} 