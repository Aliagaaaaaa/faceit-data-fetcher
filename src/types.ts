export type D1Database = any;

export interface Env {
  FACEIT_COOKIE: string;
  DB: D1Database;
  LIVE_MATCHES_SOCKET: any;
}

export interface Player {
  nickname: string;
  id: string;
  gameSkillLevel: number;
  elo: number;
}

export interface TeamStats {
  winProbability: number;
  skillLevel: {
    average: number;
    range: {
      min: number;
      max: number;
    };
  };
}

export interface Team {
  name: string;
  leader: string;
  score: number;
  roster: Player[];
  stats: TeamStats;
}

export interface Match {
  id: string;
  game: string;
  region: string;
  status: string;
  tags: string[];
  teams: {
    faction1: Team;
    faction2: Team;
  };
  createdAt: string;
  results: any[];
}

export interface PlayerCrosshair {
  id: string;
  nickname: string;
  crosshair?: string | null;
} 