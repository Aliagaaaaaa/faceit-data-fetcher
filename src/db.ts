import { D1Database, Match } from "./types";

export async function ensureSchema(db: D1Database): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS live_matches (id TEXT PRIMARY KEY, data TEXT)`);
}

export async function storeMatches(db: D1Database, matches: Match[]): Promise<void> {
  await ensureSchema(db);
  const statements = [db.prepare("DELETE FROM live_matches")];

  for (const m of matches) {
    statements.push(
      db.prepare("INSERT OR REPLACE INTO live_matches (id, data) VALUES (?1, ?2)").bind(m.id, JSON.stringify(m)),
    );
  }

  await db.batch(statements);
}

export async function getLiveMatches(db: D1Database): Promise<Match[]> {
  await ensureSchema(db);
  const rows = await db.prepare("SELECT data FROM live_matches").all();
  return rows.results.map((r: any) => JSON.parse(r.data));
} 