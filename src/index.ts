export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const { pathname } = url;

		// Route: /faceit/crosshairs/{matchId}
		const crosshairsMatch = pathname.match(/^\/faceit\/crosshairs\/([^\/]+)$/);
		if (crosshairsMatch) {
			const matchId = crosshairsMatch[1];
			return fetchMatchCrosshairs(matchId);
		}

		// Route: /faceit/{nickname}
		const faceitMatch = pathname.match(/^\/faceit\/([^\/]+)$/);
		if (faceitMatch) {
			const nickname = faceitMatch[1];
			return fetchFaceitUser(nickname);
		}

		return new Response(JSON.stringify({ error: 'Not found' }), { 
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	},
} satisfies ExportedHandler<Env>;

async function fetchFaceitUser(nickname: string): Promise<Response> {
	const faceitURL = `https://www.faceit.com/api/users/v1/nicknames/${encodeURIComponent(nickname)}`;

	const upstreamResponse = await fetch(faceitURL, {
		headers: {
			Accept: 'application/json',
		},
	});

	if (!upstreamResponse.ok) {
		return new Response(JSON.stringify({ error: 'Faceit API returned an error' }), { 
			status: upstreamResponse.status,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const raw = await upstreamResponse.json<any>();

	const payload = raw?.payload ?? {};
	const cs2 = payload.games?.cs2 ?? {};

	const filtered = {
		id: payload.id,
		avatar: payload.avatar,
		country: payload.country,
		cs2: {
			game_id: cs2.game_id,
			faceit_elo: cs2.faceit_elo,
			region: cs2.region,
		},
	};

	return new Response(JSON.stringify(filtered), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}

async function fetchMatchCrosshairs(matchId: string): Promise<Response> {
	const statsURL = `https://www.faceit.com/api/stats/v3/matches/${encodeURIComponent(matchId)}`;
	const upstreamResponse = await fetch(statsURL, {
		headers: {
			Accept: 'application/json',
		},
	});

	const headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*',
	};

	if (!upstreamResponse.ok) {
		return new Response(JSON.stringify({ error: 'Match stats not found' }), {
			status: upstreamResponse.status,
			headers,
		});
	}

	const raw = await upstreamResponse.json<any>();
	const matchObj = Array.isArray(raw) ? raw[0] : raw;
	const teams = matchObj?.teams ?? [];
	const players: { id: string; nickname: string; crosshair?: string }[] = [];

	for (const team of teams) {
		for (const p of team.players ?? []) {
			players.push({
				id: p.playerId ?? p.id ?? '',
				nickname: p.nickname ?? '',
				crosshair: p.crosshair ?? null,
			});
		}
	}

	return new Response(JSON.stringify(players), {
		status: 200,
		headers,
	});
}