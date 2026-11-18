import type { BuildPieceType, GameMode, MaterialType, PlayerLoadout, WeaponId } from './game/catalog';

export interface PartyMember {
  playerId: string;
  clientId: string;
  username: string;
  loadout: PlayerLoadout;
  ready: boolean;
}

export interface PartyState {
  code: string;
  hostPlayerId: string;
  members: PartyMember[];
}

export interface RemoteBrState {
  clientId: string;
  username: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: string;
  weapon: WeaponId;
  hp: number;
  shield: number;
  downed: boolean;
  alive: boolean;
  inBus: boolean;
  loadout?: PlayerLoadout;
}

type Listener = (event: string, payload: unknown) => void;

class BrOnlineClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private queue: string[] = [];
  private reconnectTimer: number | null = null;
  private registeredInfo: { playerId: string; username: string; skill: number; loadout: PlayerLoadout } | null = null;

  public connect() {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;
    try {
      this.ws = new WebSocket(url);
    } catch {
      return;
    }

    this.ws.onopen = () => {
      if (this.registeredInfo) {
        this.send('br:register', this.registeredInfo);
      }
      while (this.queue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
        const msg = this.queue.shift();
        if (msg) this.ws.send(msg);
      }
      this.emit('connected', {});
    };

    this.ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as { type?: string; payload?: unknown };
        if (parsed.type) {
          this.emit(parsed.type, parsed.payload ?? {});
        }
      } catch {
        // Ignore malformed packets
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = window.setTimeout(() => this.connect(), 2500);
    };
  }

  public subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(type: string, payload: unknown) {
    for (const fn of this.listeners) {
      fn(type, payload);
    }
  }

  public send(type: string, payload: unknown) {
    const raw = JSON.stringify({ type, payload });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
    } else {
      if (this.queue.length < 40) this.queue.push(raw);
      this.connect();
    }
  }

  public register(playerId: string, username: string, skill: number, loadout: PlayerLoadout) {
    this.registeredInfo = { playerId, username, skill, loadout };
    this.connect();
    this.send('br:register', this.registeredInfo);
  }

  public matchmake(mode: GameMode, skill: number, username: string, loadout: PlayerLoadout) {
    this.send('br:matchmake', { mode, skill, username, loadout });
  }

  public leaveMatch() {
    this.send('br:leaveMatch', {});
  }

  public sendState(state: Omit<RemoteBrState, 'clientId'>) {
    this.send('br:state', state);
  }

  public sendShoot(data: { ox: number; oy: number; oz: number; tx: number; ty: number; tz: number; weapon: WeaponId }) {
    this.send('br:shoot', data);
  }

  public sendBuild(data: { id: string; type: BuildPieceType; material: MaterialType; x: number; y: number; z: number; rotY: number }) {
    this.send('br:build', data);
  }

  public sendDamage(targetClientId: string, amount: number, attackerName: string) {
    this.send('br:damage', { targetClientId, amount, attackerName });
  }

  public createParty(code?: string) {
    this.send('br:partyCreate', { code });
  }

  public joinParty(code: string) {
    this.send('br:partyJoin', { code });
  }

  public inviteToParty(targetPlayerId: string) {
    this.send('br:partyInvite', { targetPlayerId });
  }

  public sendPartyChat(text: string) {
    this.send('br:partyChat', { text });
  }

  public sendVoiceSignal(signal: unknown) {
    this.send('br:voiceSignal', { signal });
  }
}

export const brOnline = new BrOnlineClient();
