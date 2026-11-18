export type RaceRecord = {
  id: string;
  playerName: string;
  trackName: string;
  timeMs: number;
};

type SupabaseRecord = {
  id: string;
  player_name: string;
  track_name: string;
  time_ms: number;
};

function getConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Database not configured. Add Supabase URL and anon key to your environment.');
  return { url, key };
}

function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function checkResponse(response: Response) {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Database error (${response.status}): ${message.slice(0, 180)}`);
  }
}

export async function getLeaderboard(trackName: string): Promise<RaceRecord[]> {
  const { url, key } = getConfig();
  const query = new URLSearchParams({
    select: 'id,player_name,track_name,time_ms',
    track_name: `eq.${trackName}`,
    order: 'time_ms.asc',
    limit: '5',
  });
  const response = await fetch(`${url}/rest/v1/race_records?${query}`, { headers: headers(key) });
  await checkResponse(response);
  const rows = await response.json() as SupabaseRecord[];
  return rows.map(row => ({ id: row.id, playerName: row.player_name, trackName: row.track_name, timeMs: row.time_ms }));
}

export async function saveRecord(record: { playerName: string; trackName: string; timeMs: number }): Promise<void> {
  const { url, key } = getConfig();
  const response = await fetch(`${url}/rest/v1/race_records`, {
    method: 'POST',
    headers: { ...headers(key), Prefer: 'return=minimal' },
    body: JSON.stringify({
      player_name: record.playerName.trim().slice(0, 20),
      track_name: record.trackName,
      time_ms: Math.round(record.timeMs),
    }),
  });
  await checkResponse(response);
}
