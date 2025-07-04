// REWRITE ENTIRE FILE
// ... existing code ...
// BEGIN NEW IMPLEMENTATION
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Env } from "./types";
import { getLiveMatches, getGlobalRanking } from "./db";
import { fetchFaceitUser, fetchMatchCrosshairs } from "./faceitApi";
import { runCron } from "./cron";
import type { Context } from "hono";

const app = new Hono<{ Bindings: Env }>();

// Global CORS
app.use("*", cors());

// GET /faceit/livematches
app.get("/faceit/livematches", async (c: Context) => {
  const matches = await getLiveMatches(c.env.DB);
  return c.json(matches);
});

// GET /faceit/crosshairs/:matchId
app.get("/faceit/crosshairs/:matchId", async (c: Context) => {
  const matchId = c.req.param("matchId");
  try {
    const data = await fetchMatchCrosshairs(matchId);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: (err as Error).message || "Unable to fetch crosshairs" }, 500);
  }
});

// GET /faceit/ranking
app.get("/faceit/ranking", async (c: Context) => {
  const limitParam = c.req.query("limit");
  const offsetParam = c.req.query("offset");
  const limit = Math.min(parseInt(limitParam ?? "100", 10), 100); // cap at 100 per page
  const offset = parseInt(offsetParam ?? "0", 10);

  const data = await getGlobalRanking(c.env.DB, offset, limit);

  return c.json({ offset, limit, results: data });
});

// GET /faceit/:nickname
app.get("/faceit/:nickname", async (c: Context) => {
  const nickname = c.req.param("nickname");
  try {
    const data = await fetchFaceitUser(nickname);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: (err as Error).message || "User lookup failed" }, 500);
  }
});

// WebSocket endpoint – proxies to Durable Object
app.get("/ws/livematches", async (c: Context) => {
  const id = c.env.LIVE_MATCHES_SOCKET.idFromName("global");
  const stub = c.env.LIVE_MATCHES_SOCKET.get(id);
  // Forward the upgrade request to DO
  return stub.fetch(c.req.raw);
});

// Route: GET /ws/livematches/clients -> returns current client count
app.get("/ws/livematches/clients", async (c: Context) => {
  const id = c.env.LIVE_MATCHES_SOCKET.idFromName("global");
  const stub = c.env.LIVE_MATCHES_SOCKET.get(id);
  const res = await stub.fetch("https://clients/stats");
  return res;
});

// Durable Object to fan-out live match updates via WebSocket
export class LiveMatchesSocket {
  // Using `any` to avoid requiring explicit Workers types package
  constructor(private readonly state: any, private readonly env: Env) {}

  // Accept WebSocket connections
  async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Inform Workers runtime we will use this WebSocket (hibernatable)
      (this.state as any).acceptWebSocket(server);

      // Send current matches as soon as connection is open
      await this.sendCurrentMatches(server as any);

      return new Response(null, { status: 101, webSocket: client });
    }

    // Handle broadcast requests coming from cron
    if (request.method === "POST" && new URL(request.url).pathname === "/broadcast") {
      const { matches } = (await request.json()) as { matches: unknown };
      await this.broadcast(JSON.stringify(matches));
      return new Response("ok");
    }

    // Handle stats request to get current clients
    if (request.method === "GET" && new URL(request.url).pathname === "/stats") {
      const count = ((this.state as any).getWebSockets?.() ?? []).length;
      return new Response(JSON.stringify({ clients: count }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  private async sendCurrentMatches(ws: WebSocket): Promise<void> {
    try {
      // Fetch latest matches from D1
      const rows = await this.env.DB.prepare("SELECT data FROM live_matches").all();
      const matches = rows.results.map((r: any) => JSON.parse(r.data));
      ws.send(JSON.stringify(matches));
    } catch (err) {
      console.error("[LiveMatchesSocket] Failed to send initial matches", err);
    }
  }

  private async broadcast(msg: string): Promise<void> {
    const sockets = (this.state as any).getWebSockets?.() ?? [];
    for (const ws of sockets) {
      try {
        ws.send(msg);
      } catch (err) {
        console.warn("[LiveMatchesSocket] Failed to send to a client", err);
      }
    }
  }

  // Handle incoming client messages (currently noop)
  async webSocketMessage(_ws: WebSocket, _message: unknown): Promise<void> {
    /* ignore */
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {
    /* connection closed */
  }
}

export default {
  fetch: app.fetch,
  scheduled: async (_controller: ScheduledController, env: Env, _ctx: ExecutionContext) => {
    await runCron(env);
  },
};
// END NEW IMPLEMENTATION