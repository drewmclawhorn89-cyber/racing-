export type OnlinePlayer = {
  id: string;
  name: string;
  carId: string;
  color: string;
  wheels: string;
  spoiler: string;
  joinedAt: number;
  finished?: boolean;
  finishTime?: number | null;
};

export type PublicRoomSummary = {
  code: string;
  hostName: string;
  trackId: string;
  laps: number;
  status: 'lobby' | 'racing';
  playerCount: number;
  maxPlayers: number;
};

export type CarState = {
  id: string;
  x: number;
  z: number;
  h: number;
  vx: number;
  vz: number;
  v: number;
  lap: number;
  s: number;
  n: boolean;
  d: boolean;
  steer: number;
  brake: boolean;
};

export type StartPayload = {
  trackId: string;
  laps: number;
  startAt: number;
  grid: string[];
};

export type FinishPayload = { id: string; time: number };

export type RoomSnapshot = {
  code: string;
  isPublic: boolean;
  hostId: string;
  status: 'lobby' | 'racing';
  trackId: string;
  laps: number;
  startAt: number;
  players: OnlinePlayer[];
};

type Handlers = {
  onPlayers?: (players: OnlinePlayer[], snapshot?: RoomSnapshot) => void;
  onState?: (state: CarState) => void;
  onStart?: (payload: StartPayload) => void;
  onFinish?: (payload: FinishPayload) => void;
  onStatus?: (status: 'connecting' | 'connected' | 'error' | 'closed', message?: string) => void;
};

export function isOnlineConfigured(): boolean {
  return true;
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

export async function fetchPublicRooms(): Promise<PublicRoomSummary[]> {
  try {
    const res = await fetch('/api/rooms', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { rooms?: PublicRoomSummary[] };
    return data.rooms || [];
  } catch {
    return [];
  }
}

export class OnlineRoom {
  selfId = '';
  readonly code: string;
  private ws: WebSocket | null = null;
  private handlers: Handlers;
  private profile: Omit<OnlinePlayer, 'id' | 'joinedAt'>;
  private initialOptions: { isPublic?: boolean; trackId?: string; laps?: number };
  private intentionalClose = false;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;

  players: OnlinePlayer[] = [];
  hostId: string | null = null;
  trackId = 'city';
  laps = 3;
  isPublic = true;
  status: 'lobby' | 'racing' = 'lobby';

  constructor(
    code: string,
    profile: Omit<OnlinePlayer, 'id' | 'joinedAt'>,
    handlers: Handlers,
    options: { isPublic?: boolean; trackId?: string; laps?: number } = {}
  ) {
    this.code = normalizeRoomCode(code);
    this.profile = profile;
    this.handlers = handlers;
    this.initialOptions = options;
    if (options.trackId) this.trackId = options.trackId;
    if (options.laps) this.laps = options.laps;
    if (typeof options.isPublic === 'boolean') this.isPublic = options.isPublic;
  }

  get isHost(): boolean {
    return Boolean(this.selfId && this.hostId === this.selfId);
  }

  join(): void {
    this.intentionalClose = false;
    this.connect();
  }

  private connect(): void {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.handlers.onStatus?.('connecting');
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.send('room:join', {
        code: this.code,
        isPublic: this.initialOptions.isPublic ?? true,
        trackId: this.initialOptions.trackId ?? this.trackId,
        laps: this.initialOptions.laps ?? this.laps,
        profile: this.profile
      });
    });

    ws.addEventListener('message', (event) => {
      let msg: { type?: string; payload?: unknown };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (msg.type === 'room:joined') {
        const data = msg.payload as { selfId: string; room: RoomSnapshot };
        this.selfId = data.selfId;
        this.applySnapshot(data.room);
        this.handlers.onStatus?.('connected');
      } else if (msg.type === 'room:sync') {
        this.applySnapshot(msg.payload as RoomSnapshot);
      } else if (msg.type === 'race:start') {
        this.status = 'racing';
        this.handlers.onStart?.(msg.payload as StartPayload);
      } else if (msg.type === 'race:state') {
        this.handlers.onState?.(msg.payload as CarState);
      } else if (msg.type === 'race:finish') {
        this.handlers.onFinish?.(msg.payload as FinishPayload);
      } else if (msg.type === 'room:error') {
        const err = msg.payload as { message?: string };
        this.handlers.onStatus?.('error', err.message || 'Room error');
      }
    });

    ws.addEventListener('close', () => {
      if (this.ws === ws) this.ws = null;
      if (this.intentionalClose) {
        this.handlers.onStatus?.('closed');
        return;
      }
      // Auto-reconnect with backoff
      if (this.reconnectAttempts < 5) {
        const delay = Math.min(4000, 600 * Math.pow(1.6, this.reconnectAttempts));
        this.reconnectAttempts++;
        this.handlers.onStatus?.('connecting', 'Reconnecting to room...');
        this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
      } else {
        this.handlers.onStatus?.('error', 'Lost connection to multiplayer server.');
      }
    });

    ws.addEventListener('error', () => {
      // Handled via close/reconnect
    });
  }

  private applySnapshot(room: RoomSnapshot): void {
    this.hostId = room.hostId;
    this.trackId = room.trackId;
    this.laps = room.laps;
    this.isPublic = room.isPublic;
    this.status = room.status;
    this.players = room.players;
    this.handlers.onPlayers?.(room.players, room);
  }

  private send(type: string, payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  updateProfile(profile: Omit<OnlinePlayer, 'id' | 'joinedAt'>): void {
    this.profile = profile;
    this.send('room:updateProfile', profile);
  }

  updateSettings(settings: { trackId?: string; laps?: number; isPublic?: boolean }): void {
    this.send('room:updateSettings', settings);
  }

  sendStart(payload: { trackId: string; laps: number }): void {
    this.send('room:start', payload);
  }

  sendState(state: Omit<CarState, 'id'>): void {
    this.send('race:state', state);
  }

  sendFinish(time: number): void {
    this.send('race:finish', { time });
  }

  returnToLobby(): void {
    this.send('room:returnLobby', {});
  }

  async leave(): Promise<void> {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.send('room:leave', {});
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
