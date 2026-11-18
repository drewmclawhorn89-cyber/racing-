import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

export type OnlinePlayer = {
  id: string;
  name: string;
  carId: string;
  color: string;
  wheels: string;
  spoiler: string;
  joinedAt: number;
};

export type CarState = {
  id: string;
  x: number;
  z: number;
  h: number;
  v: number;
  lap: number;
  s: number;
  n: boolean;
  d: boolean;
};

export type StartPayload = {
  trackId: string;
  laps: number;
  startAt: number;
  grid: string[];
};

export type FinishPayload = { id: string; time: number };

type Handlers = {
  onPlayers?: (players: OnlinePlayer[]) => void;
  onState?: (state: CarState) => void;
  onStart?: (payload: StartPayload) => void;
  onFinish?: (payload: FinishPayload) => void;
  onStatus?: (status: 'connecting' | 'connected' | 'error' | 'closed', message?: string) => void;
};

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Online mode is not configured: missing Supabase URL or anon key.');
  client = createClient(url, key, { realtime: { params: { eventsPerSecond: 30 } } });
  return client;
}

export function isOnlineConfigured(): boolean {
  return Boolean(
    (import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL) &&
    (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function normalizeRoomCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  bytes.forEach(b => { out += alphabet[b % alphabet.length]; });
  return out;
}

export class OnlineRoom {
  readonly selfId = crypto.randomUUID();
  readonly code: string;
  private channel: RealtimeChannel | null = null;
  private handlers: Handlers;
  private profile: Omit<OnlinePlayer, 'id' | 'joinedAt'>;
  private joinedAt = Date.now();
  players: OnlinePlayer[] = [];

  constructor(code: string, profile: Omit<OnlinePlayer, 'id' | 'joinedAt'>, handlers: Handlers) {
    this.code = normalizeRoomCode(code);
    this.profile = profile;
    this.handlers = handlers;
  }

  get hostId(): string | null {
    return this.players[0]?.id ?? null;
  }

  get isHost(): boolean {
    return this.hostId === this.selfId;
  }

  join(): void {
    const supabase = getClient();
    this.handlers.onStatus?.('connecting');
    const channel = supabase.channel(`apex-rush:${this.code}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.selfId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<OnlinePlayer>();
        const list: OnlinePlayer[] = [];
        Object.values(state).forEach(metas => {
          const meta = metas[metas.length - 1];
          if (meta) list.push({
            id: meta.id, name: meta.name, carId: meta.carId, color: meta.color,
            wheels: meta.wheels, spoiler: meta.spoiler, joinedAt: meta.joinedAt,
          });
        });
        list.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
        this.players = list;
        this.handlers.onPlayers?.(list);
      })
      .on('broadcast', { event: 'state' }, ({ payload }) => this.handlers.onState?.(payload as CarState))
      .on('broadcast', { event: 'start' }, ({ payload }) => this.handlers.onStart?.(payload as StartPayload))
      .on('broadcast', { event: 'finish' }, ({ payload }) => this.handlers.onFinish?.(payload as FinishPayload))
      .subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          await this.track();
          this.handlers.onStatus?.('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.handlers.onStatus?.('error', err?.message || 'Could not connect to the room.');
        } else if (status === 'CLOSED') {
          this.handlers.onStatus?.('closed');
        }
      });

    this.channel = channel;
  }

  updateProfile(profile: Omit<OnlinePlayer, 'id' | 'joinedAt'>): void {
    this.profile = profile;
    void this.track();
  }

  private async track(): Promise<void> {
    if (!this.channel) return;
    await this.channel.track({ ...this.profile, id: this.selfId, joinedAt: this.joinedAt });
  }

  sendState(state: Omit<CarState, 'id'>): void {
    this.channel?.send({ type: 'broadcast', event: 'state', payload: { ...state, id: this.selfId } });
  }

  sendStart(payload: StartPayload): void {
    this.channel?.send({ type: 'broadcast', event: 'start', payload });
    this.handlers.onStart?.(payload);
  }

  sendFinish(time: number): void {
    const payload = { id: this.selfId, time };
    this.channel?.send({ type: 'broadcast', event: 'finish', payload });
    this.handlers.onFinish?.(payload);
  }

  async leave(): Promise<void> {
    if (!this.channel) return;
    const ch = this.channel;
    this.channel = null;
    await ch.untrack();
    await getClient().removeChannel(ch);
  }
}
