import express from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';

type PlayerProfile = {
  name: string;
  carId: string;
  color: string;
  wheels: string;
  spoiler: string;
};

type RoomPlayer = PlayerProfile & {
  id: string;
  joinedAt: number;
  finished: boolean;
  finishTime: number | null;
  ws: WebSocket;
};

type Room = {
  code: string;
  isPublic: boolean;
  hostId: string;
  status: 'lobby' | 'racing';
  trackId: string;
  laps: number;
  startAt: number;
  players: Map<string, RoomPlayer>;
};

type SocketMeta = {
  clientId: string;
  roomCode: string | null;
  alive: boolean;
};

const VALID_TRACKS = new Set(['city', 'desert', 'mountain', 'coastal']);
const VALID_LAPS = new Set([1, 3, 5]);
const MAX_PLAYERS = 8;

const rooms = new Map<string, Room>();
const socketMeta = new WeakMap<WebSocket, SocketMeta>();

function sanitizeCode(raw: unknown): string {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function sanitizeProfile(raw: unknown): PlayerProfile {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const cleanName = String(p.name || 'Driver').replace(/[<>]/g, '').trim().slice(0, 16) || 'Driver';
  return {
    name: cleanName,
    carId: String(p.carId || 'bmw').slice(0, 20),
    color: String(p.color || '#2563eb').slice(0, 16),
    wheels: String(p.wheels || '5spoke').slice(0, 16),
    spoiler: String(p.spoiler || 'street').slice(0, 16)
  };
}

function serializeRoom(room: Room) {
  const players = Array.from(room.players.values())
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      carId: p.carId,
      color: p.color,
      wheels: p.wheels,
      spoiler: p.spoiler,
      joinedAt: p.joinedAt,
      finished: p.finished,
      finishTime: p.finishTime
    }));
  return {
    code: room.code,
    isPublic: room.isPublic,
    hostId: room.hostId,
    status: room.status,
    trackId: room.trackId,
    laps: room.laps,
    startAt: room.startAt,
    players
  };
}

function sendJson(ws: WebSocket, type: string, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastRoom(room: Room, type: string, payload: unknown, excludeId?: string) {
  const msg = JSON.stringify({ type, payload });
  for (const player of room.players.values()) {
    if (excludeId && player.id === excludeId) continue;
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(msg);
    }
  }
}

function removeFromRoom(ws: WebSocket) {
  const meta = socketMeta.get(ws);
  if (!meta || !meta.roomCode) return;

  const room = rooms.get(meta.roomCode);
  meta.roomCode = null;
  if (!room) return;

  room.players.delete(meta.clientId);
  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === meta.clientId) {
    const sorted = Array.from(room.players.values()).sort((a, b) => a.joinedAt - b.joinedAt);
    room.hostId = sorted[0].id;
  }
  broadcastRoom(room, 'room:sync', serializeRoom(room));
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms', (_req, res) => {
    const publicRooms = [];
    for (const room of rooms.values()) {
      if (!room.isPublic || room.players.size >= MAX_PLAYERS) continue;
      const host = room.players.get(room.hostId);
      publicRooms.push({
        code: room.code,
        hostName: host ? host.name : 'Driver',
        trackId: room.trackId,
        laps: room.laps,
        status: room.status,
        playerCount: room.players.size,
        maxPlayers: MAX_PLAYERS
      });
    }
    res.json({ rooms: publicRooms });
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = crypto.randomUUID();
    socketMeta.set(ws, {
      clientId,
      roomCode: null,
      alive: true
    });

    ws.on('pong', () => {
      const m = socketMeta.get(ws);
      if (m) m.alive = true;
    });

    ws.on('message', (raw) => {
      const meta = socketMeta.get(ws);
      if (!meta) return;

      let msg: { type?: string; payload?: Record<string, unknown> };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const type = msg.type;
      const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};

      if (type === 'room:join') {
        const code = sanitizeCode(payload.code);
        if (code.length < 4) {
          sendJson(ws, 'room:error', { message: 'Room code must be 4 to 6 characters.' });
          return;
        }

        removeFromRoom(ws);

        let room = rooms.get(code);
        const profile = sanitizeProfile(payload.profile);

        if (!room) {
          const trackId = VALID_TRACKS.has(String(payload.trackId)) ? String(payload.trackId) : 'city';
          const lapsNum = Number(payload.laps);
          const laps = VALID_LAPS.has(lapsNum) ? lapsNum : 3;
          room = {
            code,
            isPublic: payload.isPublic !== false,
            hostId: clientId,
            status: 'lobby',
            trackId,
            laps,
            startAt: 0,
            players: new Map()
          };
          rooms.set(code, room);
        } else if (room.players.size >= MAX_PLAYERS) {
          sendJson(ws, 'room:error', { message: 'Room is full (max 8 racers).' });
          return;
        }

        const player: RoomPlayer = {
          id: clientId,
          ...profile,
          joinedAt: Date.now(),
          finished: false,
          finishTime: null,
          ws
        };
        room.players.set(clientId, player);
        meta.roomCode = code;

        const snapshot = serializeRoom(room);
        sendJson(ws, 'room:joined', { selfId: clientId, room: snapshot });
        broadcastRoom(room, 'room:sync', snapshot, clientId);
        return;
      }

      if (!meta.roomCode) return;
      const room = rooms.get(meta.roomCode);
      if (!room) return;
      const player = room.players.get(meta.clientId);
      if (!player) return;

      if (type === 'room:updateProfile') {
        const prof = sanitizeProfile(payload);
        player.name = prof.name;
        player.carId = prof.carId;
        player.color = prof.color;
        player.wheels = prof.wheels;
        player.spoiler = prof.spoiler;
        broadcastRoom(room, 'room:sync', serializeRoom(room));
      } else if (type === 'room:updateSettings') {
        if (room.hostId !== meta.clientId) return;
        if (VALID_TRACKS.has(String(payload.trackId))) room.trackId = String(payload.trackId);
        if (VALID_LAPS.has(Number(payload.laps))) room.laps = Number(payload.laps);
        if (typeof payload.isPublic === 'boolean') room.isPublic = payload.isPublic;
        broadcastRoom(room, 'room:sync', serializeRoom(room));
      } else if (type === 'room:start') {
        if (room.hostId !== meta.clientId) return;
        room.status = 'racing';
        room.startAt = Date.now() + 3600;
        const grid: string[] = [];
        const sorted = Array.from(room.players.values()).sort((a, b) => a.joinedAt - b.joinedAt);
        sorted.slice(0, MAX_PLAYERS).forEach((p) => {
          p.finished = false;
          p.finishTime = null;
          grid.push(p.id);
        });
        broadcastRoom(room, 'race:start', {
          trackId: room.trackId,
          laps: room.laps,
          startAt: room.startAt,
          grid
        });
        broadcastRoom(room, 'room:sync', serializeRoom(room));
      } else if (type === 'race:state') {
        broadcastRoom(room, 'race:state', { ...payload, id: meta.clientId }, meta.clientId);
      } else if (type === 'race:finish') {
        if (player.finished) return;
        const time = Math.max(1, Math.min(3600, Number(payload.time) || 0));
        player.finished = true;
        player.finishTime = time;
        broadcastRoom(room, 'race:finish', { id: meta.clientId, time });
      } else if (type === 'room:returnLobby') {
        player.finished = false;
        player.finishTime = null;
        if (room.hostId === meta.clientId) room.status = 'lobby';
        broadcastRoom(room, 'room:sync', serializeRoom(room));
      } else if (type === 'room:leave') {
        removeFromRoom(ws);
      }
    });

    ws.on('close', () => {
      removeFromRoom(ws);
    });
  });

  setInterval(() => {
    wss.clients.forEach((ws) => {
      const m = socketMeta.get(ws);
      if (!m) return;
      if (!m.alive) {
        removeFromRoom(ws);
        ws.terminate();
        return;
      }
      m.alive = false;
      ws.ping();
    });
  }, 15000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const idx = path.join(distDir, 'index.html');
      if (fs.existsSync(idx)) res.sendFile(idx);
      else res.status(404).send('Build not found');
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Rush Racing server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
