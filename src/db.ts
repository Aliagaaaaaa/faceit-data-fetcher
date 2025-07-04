import { D1Database, Match } from "./types";

export async function storeMatches(db: D1Database, matches: Match[]): Promise<void> {
  // live_matches table is created via D1 migrations
  const statements = [db.prepare("DELETE FROM live_matches")];

  for (const m of matches) {
    statements.push(
      db.prepare("INSERT OR REPLACE INTO live_matches (id, data) VALUES (?1, ?2)").bind(m.id, JSON.stringify(m)),
    );
  }

  await db.batch(statements);
}

export async function getLiveMatches(db: D1Database): Promise<Match[]> {
  const rows = await db.prepare("SELECT data FROM live_matches").all();
  return rows.results.map((r: any) => JSON.parse(r.data));
}

// -------------------- Global ranking --------------------

export async function storeRanking(db: D1Database, ranking: any[]): Promise<void> {
  // global_ranking table is created via D1 migrations
  const stmts = [db.prepare("DELETE FROM global_ranking")];

  const PAGE_SIZE = 100;
  for (let offset = 0; offset < ranking.length; offset += PAGE_SIZE) {
    const chunk = ranking.slice(offset, offset + PAGE_SIZE);
    stmts.push(
      db
        .prepare("INSERT INTO global_ranking (rank, data) VALUES (?1, ?2)")
        .bind(offset, JSON.stringify(chunk)),
    );
  }

  await db.batch(stmts);
}

export async function getGlobalRanking(db: D1Database): Promise<any[]> {
  const rows = await db.prepare("SELECT data FROM global_ranking ORDER BY rank").all();
  const aggregated: any[] = [];
  for (const r of rows.results) {
    aggregated.push(...JSON.parse(r.data));
  }
  return aggregated;
} 