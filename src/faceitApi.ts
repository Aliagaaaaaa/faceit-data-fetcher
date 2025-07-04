import { Match, PlayerCrosshair, Player } from "./types";

const FACEIT_ENTITY_ID = "73557c8e-4b67-4ac8-bae0-e910b49a5fa0"; // cs2 sa entity id
const LIVE_MATCH_API_URL = "https://www.faceit.com/api/match/v3/match";
const MATCH_RESULT_API_URL_BASE= "https://www.faceit.com/api/match/v2/match/";
const LIMIT_PER_PAGE = 100; // max limit for faceit api
const GLOBAL_RANKING_API_URL_BASE ="https://www.faceit.com/api/ranking/v1/globalranking/cs2/SA";

export async function fetchGlobalRanking(top: number = 500): Promise<any[]> {
  const perPage = 100;
  let position = 0;
  let all: any[] = [];

  while (position < top) {
    const url = `${GLOBAL_RANKING_API_URL_BASE}?limit=${perPage}&position=${position}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) {
      throw new Error(`Error fetching ranking (pos ${position}): HTTP ${res.status}`);
    }

    const data = await res.json<any>();
    const payload = data?.payload?.players ?? [];
    all = all.concat(payload);

    if (payload.length < perPage) {
      break;
    }
    position += perPage;
  }

  // Trim in case we fetched over
  return all.slice(0, top);
}

export async function fetchFaceitUser(nickname: string): Promise<any> {
  const faceitURL = `https://www.faceit.com/api/users/v1/nicknames/${encodeURIComponent(
    nickname,
  )}`;
  const upstreamResponse = await fetch(faceitURL, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!upstreamResponse.ok) {
    throw new Error(`Faceit API error for user ${nickname}: ${upstreamResponse.status}`);
  }

  const raw = await upstreamResponse.json<any>();
  const payload = raw?.payload ?? {};
  const cs2 = payload.games?.cs2 ?? {};

  return {
    id: payload.id,
    avatar: payload.avatar,
    country: payload.country,
    cs2: {
      game_id: cs2.game_id,
      faceit_elo: cs2.faceit_elo,
      region: cs2.region,
    },
  };
}

export async function fetchMatchCrosshairs(matchId: string): Promise<PlayerCrosshair[]> {
  const statsURL = `https://www.faceit.com/api/stats/v3/matches/${encodeURIComponent(matchId)}`;
  const upstreamResponse = await fetch(statsURL, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!upstreamResponse.ok) {
    throw new Error(`Match stats not found (${upstreamResponse.status})`);
  }

  const raw = await upstreamResponse.json<any>();
  const matchObj = Array.isArray(raw) ? raw[0] : raw;
  const teams = matchObj?.teams ?? [];
  const players: PlayerCrosshair[] = [];

  for (const team of teams) {
    for (const p of team.players ?? []) {
      players.push({
        id: p.playerId ?? p.id ?? "",
        nickname: p.nickname ?? "",
        crosshair: p.crosshair ?? null,
      });
    }
  }

  return players;
}

export async function fetchFilteredLiveMatches(faceitCookie: string): Promise<Match[]> {
  const headers = {
    "Content-Type": "application/json",
    Cookie: faceitCookie,
  } as Record<string, string>;

  let allMatches: Match[] = [];
  let offset = 0;

  while (true) {
    const url = `${LIVE_MATCH_API_URL}?entityId=${FACEIT_ENTITY_ID}&entityType=matchmaking&status=LIVE&offset=${offset}&limit=${LIMIT_PER_PAGE}`;
    const response = await fetch(url, { headers });
    const data = await response.json<any>();

    if (!response.ok || data.code !== "OPERATION-OK") {
      throw new Error(
        `Error fetching live matches (offset ${offset}): HTTP ${response.status}, code ${data.code}`,
      );
    }

    const transformed = transformMatches(data.payload);
    allMatches = allMatches.concat(transformed);

    if (data.payload.length < LIMIT_PER_PAGE) {
      break;
    }
    offset += LIMIT_PER_PAGE;
  }

  // Filter super & level-10
  const filtered = allMatches.filter((match) => {
    const isSuper = match.tags?.includes("super");
    const hasLvl10 =
      match.teams.faction1.stats.skillLevel.average === 10 ||
      match.teams.faction2.stats.skillLevel.average === 10;
    return isSuper && hasLvl10;
  });

  // Fetch results for each match in parallel
  const matchesWithResults: Match[] = await Promise.all(
    filtered.map(async (match) => {
      try {
        const res = await fetch(`${MATCH_RESULT_API_URL_BASE}${match.id}`, {
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          return { ...match, results: [] } as Match;
        }

        const data = await res.json<any>();
        return { ...match, results: data.payload?.results ?? [] } as Match;
      } catch {
        return { ...match, results: [] } as Match;
      }
    }),
  );

  return matchesWithResults;
}

function transformMatches(matches: any[]): Match[] {
  return matches
    .filter((match) => match.teams && match.teams.faction1 && match.teams.faction2)
    .map(
      (match): Match => ({
        id: match.id,
        game: match.game,
        region: match.region,
        status: match.status,
        tags: match.tags || [],
        teams: {
          faction1: toTeam(match.teams.faction1),
          faction2: toTeam(match.teams.faction2),
        },
        createdAt: match.createdAt || "Unknown",
        results: [],
      }),
    );
}

function toTeam(src: any): Match["teams"]["faction1"] {
  return {
    name: src.name || "Unknown",
    leader: src.leader || "Unknown",
    score: src.score || 0,
    roster: (src.roster || []).map((p: any): Player => ({
      nickname: p.nickname || "Unknown",
      id: p.id || "Unknown",
      gameSkillLevel: p.gameSkillLevel || 0,
      elo: p.elo || 0,
    })),
    stats: {
      winProbability: src.stats?.winProbability || 0,
      skillLevel: {
        average: src.stats?.skillLevel?.average || 0,
        range: {
          min: src.stats?.skillLevel?.range?.min || 0,
          max: src.stats?.skillLevel?.range?.max || 0,
        },
      },
    },
  };
} 