export interface OnlineProfile {
  name: string;
  carId: string;
  color: string;
  wheels: string;
  spoiler: string;
}

export interface RoomPlayerSnapshot extends OnlineProfile {
  id: string;
  joinedAt: number;
  finished: boolean;
  finishTime: number | null;
}

export interface RoomSnapshot {
  code: string;
  isPublic: boolean;
  hostId: string;
  status: 'lobby' | 'racing';
  trackId: string;
  laps: number;
  startAt: number;
  players: RoomPlayerSnapshot[];
}

export interface PublicRoomSummary {
  code: string;
  hostName: string;
  trackId: string;
  laps: number;
  status: 'lobby' | 'racing';
  playerCount: number;
  maxPlayers: number;
}

export interface RaceStartPayload {
  trackId: string;
  laps: number;
  startAt: number;
  grid: string[];
}

export interface RemoteRaceStatePayload {
  id: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  steer: number;
  braking: boolean;
  nitroActive: boolean;
  drifting: boolean;
  totalProgress: number;
}

export interface RemoteRaceFinishPayload {
  id: string;
  time: number;
}

export interface OnlineRoomCallbacks {
  onSync?: (room: RoomSnapshot) => void;
  onStart?: (payload: RaceStartPayload) => void;
  onRemoteState?: (payload: RemoteRaceStatePayload) => void;
  onRemoteFinish?: (payload: RemoteRaceFinishPayload) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function normalizeRoomCode(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function isOnlineConfigured(): boolean {
  return typeof WebSocket !== 'undefined';
}

export async function fetchPublicRooms(): Promise<PublicRoomSummary[]> {
  try {
    const res = await fetch('/api/rooms', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { rooms?: PublicRoomSummary[] };
    return Array.isArray(data.rooms) ? data.rooms : [];
  } catch {
    return [];
  }
}

export class OnlineRoom {
  private ws: WebSocket | null = null;
  private callbacks: OnlineRoomCallbacks;
  public code = '';
  public isPublic = true;
  public selfId = '';
  public hostId = '';
  public status: 'lobby' | 'racing' = 'lobby';
  public trackId = 'city';
  public laps = 3;
  public players: RoomPlayerSnapshot[] = [];

  constructor(callbacks: OnlineRoomCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public get isHost(): boolean {
    return Boolean(this.selfId && this.hostId && this.selfId === this.hostId);
  }

  public join(options: {
    code: string;
    profile: OnlineProfile;
    isPublic?: boolean;
    trackId?: string;
    laps?: number;
  }): Promise<RoomSnapshot> {
    this.leave();

    const cleanCode = normalizeRoomCode(options.code);
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;

    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;

      const fail = (message: string) => {
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
        this.callbacks.onError?.(message);
      };

      ws.onopen = () => {
        this.send('room:join', {
          code: cleanCode,
          profile: options.profile,
          isPublic: options.isPublic !== false,
          trackId: options.trackId || 'city',
          laps: options.laps || 3
        });
      };

      ws.onmessage = (ev) => {
        let parsed: { type?: string; payload?: any };
        try {
          parsed = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const { type, payload } = parsed;
        if (!type) return;

        if (type === 'room:joined') {
          this.selfId = String(payload.selfId || '');
          this.applyRoomSnapshot(payload.room as RoomSnapshot);
          if (!settled) {
            settled = true;
            resolve(payload.room as RoomSnapshot);
          }
          this.callbacks.onSync?.(payload.room as RoomSnapshot);
        } else if (type === 'room:sync') {
          this.applyRoomSnapshot(payload as RoomSnapshot);
          this.callbacks.onSync?.(payload as RoomSnapshot);
        } else if (type === 'race:start') {
          this.callbacks.onStart?.(payload as RaceStartPayload);
        } else if (type === 'race:state') {
          this.callbacks.onRemoteState?.(payload as RemoteRaceStatePayload);
        } else if (type === 'race:finish') {
          this.callbacks.onRemoteFinish?.(payload as RemoteRaceFinishPayload);
        } else if (type === 'room:error') {
          fail(String(payload?.message || 'Unable to join room.'));
        }
      };

      ws.onerror = () => {
        fail('WebSocket connection error.');
      };

      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null;
          if (!settled) {
            settled = true;
            reject(new Error('Connection closed before joining room.'));
          }
          this.callbacks.onClose?.();
        }
      };
    });
  }

  private applyRoomSnapshot(room: RoomSnapshot) {
    if (!room) return;
    this.code = room.code;
    this.isPublic = room.isPublic;
    this.hostId = room.hostId;
    this.status = room.status;
    this.trackId = room.trackId;
    this.laps = room.laps;
    this.players = Array.isArray(room.players) ? room.players : [];
  }

  private send(type: string, payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  public updateProfile(profile: OnlineProfile) {
    this.send('room:updateProfile', profile);
  }

  public updateSettings(settings: { trackId?: string; laps?: number; isPublic?: boolean }) {
    this.send('room:updateSettings', settings);
  }

  public sendStart(settings?: { trackId?: string; laps?: number }) {
    if (settings) {
      this.send('room:updateSettings', settings);
    }
    this.send('room:start', {});
  }

  public sendState(state: Omit<RemoteRaceStatePayload, 'id'>) {
    this.send('race:state', state);
  }

  public sendFinish(time: number) {
    this.send('race:finish', { time });
  }

  public returnToLobby() {
    this.send('room:returnLobby', {});
  }

  public leave() {
    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      try {
        if (sock.readyState === WebSocket.OPEN) {
          sock.send(JSON.stringify({ type: 'room:leave', payload: {} }));
        }
        sock.close();
      } catch {
        // Ignore close error
      }
    }
    this.code = '';
    this.selfId = '';
    this.hostId = '';
    this.players = [];
  }
}
