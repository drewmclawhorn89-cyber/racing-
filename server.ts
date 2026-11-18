import express from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';

// ===== Preserved Racing Room Types =====
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

// ===== Battle Royale Cloud Database Types =====
interface BrPlayerRecord {
  player_id: string;
  username: string;
  avatar: string;
  level: number;
  xp: number;
  wins: number;
  kills: number;
  coins: number;
  matchesPlayed: number;
  battlePassTier: number;
  battlePassPremium: boolean;
  loadout: Record<string, string>;
  quests: Record<string, unknown>;
}

interface BrMatchRecord {
  match_id: string;
  mode: string;
  players: string[];
  winner: string;
  started_at: string;
  ended_at: string;
}

interface BrInventoryEntry {
  player_id: string;
  item_id: string;
  item_type: string;
  equipped: boolean;
}

interface BrShopItem {
  item_id: string;
  name: string;
  price: number;
  rarity: string;
  type: string;
}

interface BrFriendRecord {
  friendship_id: string;
  player_id: string;
  friend_id: string;
  friend_name: string;
  status: 'pending' | 'accepted' | 'blocked';
}

interface BrDatabase {
  players: Record<string, BrPlayerRecord>;
  matches: BrMatchRecord[];
  inventory: BrInventoryEntry[];
  shop_items: BrShopItem[];
  shop_date: string;
  friends: BrFriendRecord[];
}

const DB_PATH = path.resolve(process.cwd(), '.br_cloud_db.json');

const STARTER_ITEM_TYPES: Array<[string, string]> = [
  ['skin_scout', 'skin'],
  ['hair_spiky', 'hair'],
  ['hair_bob', 'hair'],
  ['pack_trail', 'backpack'],
  ['pick_timber', 'pickaxe'],
  ['glider_sunburst', 'glider'],
  ['emote_dance', 'emote'],
  ['emote_wave', 'emote']
];

const SHOP_POOL: BrShopItem[] = [
  { item_id: 'skin_captain', name: 'Sky Captain', price: 600, rarity: 'rare', type: 'skin' },
  { item_id: 'skin_neon', name: 'Neon Striker', price: 950, rarity: 'epic', type: 'skin' },
  { item_id: 'skin_frost', name: 'Frost Parka', price: 700, rarity: 'rare', type: 'skin' },
  { item_id: 'skin_nomad', name: 'Dune Nomad', price: 450, rarity: 'uncommon', type: 'skin' },
  { item_id: 'skin_knight', name: 'Pixel Knight', price: 1400, rarity: 'legendary', type: 'skin' },
  { item_id: 'skin_candy', name: 'Candy Comet', price: 1000, rarity: 'epic', type: 'skin' },
  { item_id: 'skin_volt', name: 'Volt Runner', price: 1500, rarity: 'legendary', type: 'skin' },
  { item_id: 'hair_mohawk', name: 'Neon Mohawk', price: 350, rarity: 'rare', type: 'hair' },
  { item_id: 'hair_buns', name: 'Twin Buns', price: 250, rarity: 'uncommon', type: 'hair' },
  { item_id: 'hair_pomp', name: 'Aero Pomp', price: 400, rarity: 'rare', type: 'hair' },
  { item_id: 'hair_visor', name: 'Cyber Helmet', price: 650, rarity: 'epic', type: 'hair' },
  { item_id: 'pack_jet', name: 'Jet Booster', price: 750, rarity: 'epic', type: 'backpack' },
  { item_id: 'pack_star', name: 'Star Satchel', price: 500, rarity: 'rare', type: 'backpack' },
  { item_id: 'pack_dino', name: 'Dino Shell', price: 550, rarity: 'rare', type: 'backpack' },
  { item_id: 'pack_boom', name: 'Boombox Cube', price: 900, rarity: 'legendary', type: 'backpack' },
  { item_id: 'pick_starwand', name: 'Star Wand', price: 500, rarity: 'rare', type: 'pickaxe' },
  { item_id: 'pick_bolt', name: 'Bolt Hammer', price: 700, rarity: 'epic', type: 'pickaxe' },
  { item_id: 'pick_ice', name: 'Ice Cleaver', price: 550, rarity: 'rare', type: 'pickaxe' },
  { item_id: 'pick_plasma', name: 'Plasma Edge', price: 1100, rarity: 'legendary', type: 'pickaxe' },
  { item_id: 'glider_parasol', name: 'Aero Parasol', price: 400, rarity: 'uncommon', type: 'glider' },
  { item_id: 'glider_cloud', name: 'Cloud Surfer', price: 800, rarity: 'epic', type: 'glider' },
  { item_id: 'glider_rocket', name: 'Rocket Kite', price: 650, rarity: 'rare', type: 'glider' },
  { item_id: 'glider_comet', name: 'Comet Chute', price: 1150, rarity: 'legendary', type: 'glider' },
  { item_id: 'emote_laugh', name: 'Giggle Burst', price: 300, rarity: 'uncommon', type: 'emote' },
  { item_id: 'emote_point', name: 'Victory Point', price: 400, rarity: 'rare', type: 'emote' }
];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildDailyShop(dateKey: string): BrShopItem[] {
  let seed = 0;
  for (let i = 0; i < dateKey.length; i++) {
    seed = (seed * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  const picked: BrShopItem[] = [];
  const used = new Set<string>();
  const types = ['skin', 'skin', 'glider', 'pickaxe', 'backpack', 'hair', 'emote', 'skin'];
  for (const t of types) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const pool = SHOP_POOL.filter((item) => item.type === t && !used.has(item.item_id));
    if (pool.length > 0) {
      const choice = pool[seed % pool.length];
      picked.push(choice);
      used.add(choice.item_id);
    }
  }
  return picked;
}

function loadBrDb(): BrDatabase {
  const today = todayKey();
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) as Partial<BrDatabase>;
      const db: BrDatabase = {
        players: raw.players && typeof raw.players === 'object' ? raw.players : {},
        matches: Array.isArray(raw.matches) ? raw.matches : [],
        inventory: Array.isArray(raw.inventory) ? raw.inventory : [],
        shop_items: Array.isArray(raw.shop_items) ? raw.shop_items : buildDailyShop(today),
        shop_date: typeof raw.shop_date === 'string' ? raw.shop_date : today,
        friends: Array.isArray(raw.friends) ? raw.friends : []
      };
      if (db.shop_date !== today) {
        db.shop_date = today;
        db.shop_items = buildDailyShop(today);
      }
      return db;
    }
  } catch {
    // Recreate clean DB if corrupt
  }
  return {
    players: {},
    matches: [],
    inventory: [],
    shop_items: buildDailyShop(today),
    shop_date: today,
    friends: []
  };
}

let brDb: BrDatabase = loadBrDb();

function persistBrDb() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(brDb, null, 2));
  } catch {
    // Ignore disk write failure on read-only environments
  }
}

function ensurePlayerRecord(playerId: string, username = 'SkyRunner', avatar = ''): BrPlayerRecord {
  const cleanId = String(playerId || 'guest_local').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || 'guest_local';
  const today = todayKey();
  if (!brDb.players[cleanId]) {
    brDb.players[cleanId] = {
      player_id: cleanId,
      username: String(username || 'SkyRunner').slice(0, 24) || 'SkyRunner',
      avatar: String(avatar || '').slice(0, 400),
      level: 1,
      xp: 0,
      wins: 0,
      kills: 0,
      coins: 500,
      matchesPlayed: 0,
      battlePassTier: 1,
      battlePassPremium: false,
      loadout: {
        skinTone: 'peach',
        hair: 'hair_spiky',
        skin: 'skin_scout',
        backpack: 'pack_trail',
        pickaxe: 'pick_timber',
        glider: 'glider_sunburst'
      },
      quests: {
        date: today,
        kills: 0,
        surviveSec: 0,
        builds: 0,
        claimedKills: false,
        claimedSurvive: false,
        claimedBuilds: false
      }
    };
    for (const [itemId, itemType] of STARTER_ITEM_TYPES) {
      brDb.inventory.push({
        player_id: cleanId,
        item_id: itemId,
        item_type: itemType,
        equipped: itemId !== 'hair_bob' && itemId !== 'emote_wave'
      });
    }
    persistBrDb();
  }
  return brDb.players[cleanId];
}

// ===== WebSocket Multiplayer State =====
type SocketMeta = {
  clientId: string;
  roomCode: string | null;
  playerId: string | null;
  username: string;
  skill: number;
  loadout: Record<string, string>;
  brMatchId: string | null;
  partyCode: string | null;
  alive: boolean;
};

interface BrMatchRoom {
  id: string;
  mode: string;
  skillAnchor: number;
  startedAt: number;
  members: Map<string, WebSocket>;
}

interface PartyRoom {
  code: string;
  hostPlayerId: string;
  members: Map<string, { playerId: string; clientId: string; username: string; loadout: Record<string, string>; ready: boolean; ws: WebSocket }>;
}

const VALID_TRACKS = new Set(['city', 'desert', 'mountain', 'coastal']);
const VALID_LAPS = new Set([1, 3, 5]);
const MAX_PLAYERS = 8;

const rooms = new Map<string, Room>();
const brMatches = new Map<string, BrMatchRoom>();
const parties = new Map<string, PartyRoom>();
const onlineByPlayerId = new Map<string, WebSocket>();
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

function broadcastBrMatch(match: BrMatchRoom, type: string, payload: unknown, excludeClientId?: string) {
  const msg = JSON.stringify({ type, payload });
  for (const [cid, sock] of match.members.entries()) {
    if (excludeClientId && cid === excludeClientId) continue;
    if (sock.readyState === WebSocket.OPEN) {
      sock.send(msg);
    }
  }
}

function serializeParty(party: PartyRoom) {
  return {
    code: party.code,
    hostPlayerId: party.hostPlayerId,
    members: Array.from(party.members.values()).map((m) => ({
      playerId: m.playerId,
      clientId: m.clientId,
      username: m.username,
      loadout: m.loadout,
      ready: m.ready
    }))
  };
}

function broadcastParty(party: PartyRoom, type: string, payload: unknown, excludeClientId?: string) {
  const msg = JSON.stringify({ type, payload });
  for (const m of party.members.values()) {
    if (excludeClientId && m.clientId === excludeClientId) continue;
    if (m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(msg);
    }
  }
}

function removeFromRoom(ws: WebSocket) {
  const meta = socketMeta.get(ws);
  if (!meta) return;

  if (meta.roomCode) {
    const room = rooms.get(meta.roomCode);
    meta.roomCode = null;
    if (room) {
      room.players.delete(meta.clientId);
      if (room.players.size === 0) {
        rooms.delete(room.code);
      } else {
        if (room.hostId === meta.clientId) {
          const sorted = Array.from(room.players.values()).sort((a, b) => a.joinedAt - b.joinedAt);
          room.hostId = sorted[0].id;
        }
        broadcastRoom(room, 'room:sync', serializeRoom(room));
      }
    }
  }

  if (meta.brMatchId) {
    const match = brMatches.get(meta.brMatchId);
    meta.brMatchId = null;
    if (match) {
      match.members.delete(meta.clientId);
      broadcastBrMatch(match, 'br:playerLeft', { clientId: meta.clientId });
      if (match.members.size === 0) {
        brMatches.delete(match.id);
      }
    }
  }

  if (meta.partyCode) {
    const party = parties.get(meta.partyCode);
    meta.partyCode = null;
    if (party) {
      party.members.delete(meta.clientId);
      if (party.members.size === 0) {
        parties.delete(party.code);
      } else {
        const first = Array.from(party.members.values())[0];
        if (party.hostPlayerId === meta.playerId && first) {
          party.hostPlayerId = first.playerId;
        }
        broadcastParty(party, 'br:partySync', serializeParty(party));
      }
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, brMatches: brMatches.size });
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

  // ===== Battle Royale Cloud Database Endpoints =====
  app.get('/api/br/player/:id', (req, res) => {
    const pid = req.params.id;
    const username = String(req.query.username || 'SkyRunner');
    const avatar = String(req.query.avatar || '');
    const profile = ensurePlayerRecord(pid, username, avatar);
    const inventory = brDb.inventory.filter((item) => item.player_id === profile.player_id);
    res.json({ profile, inventory });
  });

  app.put('/api/br/player/:id', (req, res) => {
    const pid = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
    if (!pid) return res.status(400).json({ error: 'Invalid player_id' });
    const body = req.body as Partial<BrPlayerRecord>;
    const existing = ensurePlayerRecord(pid, body.username, body.avatar);
    brDb.players[pid] = {
      ...existing,
      username: String(body.username || existing.username).slice(0, 24),
      avatar: String(body.avatar ?? existing.avatar).slice(0, 400),
      level: Math.max(1, Number(body.level ?? existing.level)),
      xp: Math.max(0, Number(body.xp ?? existing.xp)),
      wins: Math.max(0, Number(body.wins ?? existing.wins)),
      kills: Math.max(0, Number(body.kills ?? existing.kills)),
      coins: Math.max(0, Number(body.coins ?? existing.coins)),
      matchesPlayed: Math.max(0, Number(body.matchesPlayed ?? existing.matchesPlayed)),
      battlePassTier: Math.max(1, Math.min(100, Number(body.battlePassTier ?? existing.battlePassTier))),
      battlePassPremium: Boolean(body.battlePassPremium ?? existing.battlePassPremium),
      loadout: body.loadout && typeof body.loadout === 'object' ? body.loadout : existing.loadout,
      quests: body.quests && typeof body.quests === 'object' ? body.quests : existing.quests
    };
    persistBrDb();
    res.json({ ok: true, profile: brDb.players[pid] });
  });

  app.post('/api/br/inventory', (req, res) => {
    const body = req.body as Partial<BrInventoryEntry>;
    const pid = String(body.player_id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
    const itemId = String(body.item_id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    const itemType = String(body.item_type || 'skin').slice(0, 16);
    if (!pid || !itemId) return res.status(400).json({ error: 'Missing fields' });

    const existing = brDb.inventory.find((i) => i.player_id === pid && i.item_id === itemId);
    if (body.equipped) {
      for (const entry of brDb.inventory) {
        if (entry.player_id === pid && entry.item_type === itemType) {
          entry.equipped = false;
        }
      }
    }
    if (existing) {
      existing.equipped = Boolean(body.equipped);
    } else {
      brDb.inventory.push({
        player_id: pid,
        item_id: itemId,
        item_type: itemType,
        equipped: Boolean(body.equipped)
      });
    }
    persistBrDb();
    res.json({ ok: true });
  });

  app.post('/api/br/matches', (req, res) => {
    const body = req.body as Partial<BrMatchRecord>;
    const match: BrMatchRecord = {
      match_id: String(body.match_id || crypto.randomUUID()).slice(0, 64),
      mode: String(body.mode || 'solo').slice(0, 16),
      players: Array.isArray(body.players) ? body.players.slice(0, 100).map((p) => String(p).slice(0, 48)) : [],
      winner: String(body.winner || 'Unknown').slice(0, 48),
      started_at: String(body.started_at || new Date().toISOString()).slice(0, 48),
      ended_at: String(body.ended_at || new Date().toISOString()).slice(0, 48)
    };
    brDb.matches.unshift(match);
    if (brDb.matches.length > 50) brDb.matches.length = 50;
    persistBrDb();
    res.json({ ok: true, match });
  });

  app.get('/api/br/shop', (_req, res) => {
    const today = todayKey();
    if (brDb.shop_date !== today) {
      brDb.shop_date = today;
      brDb.shop_items = buildDailyShop(today);
      persistBrDb();
    }
    res.json({ date: brDb.shop_date, items: brDb.shop_items });
  });

  app.get('/api/br/leaderboard', (_req, res) => {
    const players = Object.values(brDb.players)
      .sort((a, b) => b.wins - a.wins || b.kills - a.kills || b.level - a.level)
      .slice(0, 50);
    res.json({ players, matches: brDb.matches.slice(0, 20) });
  });

  app.get('/api/br/friends/:playerId', (req, res) => {
    const pid = req.params.playerId;
    const list = brDb.friends.filter((f) => f.player_id === pid || f.friend_id === pid);
    res.json({ friends: list });
  });

  app.post('/api/br/friends', (req, res) => {
    const { player_id, friend_query } = req.body as { player_id?: string; friend_query?: string };
    const pid = String(player_id || '').trim();
    const q = String(friend_query || '').trim().toLowerCase();
    if (!pid || !q) return res.json({ ok: false, error: 'Enter a friend username or player ID.' });

    const target = Object.values(brDb.players).find(
      (p) => p.player_id.toLowerCase() === q || p.username.toLowerCase() === q
    );
    if (!target) {
      return res.json({ ok: false, error: 'Player not found. Ask them to sign in once first.' });
    }
    if (target.player_id === pid) {
      return res.json({ ok: false, error: 'Cannot add yourself as a friend.' });
    }
    const existing = brDb.friends.find(
      (f) =>
        (f.player_id === pid && f.friend_id === target.player_id) ||
        (f.player_id === target.player_id && f.friend_id === pid)
    );
    if (existing) {
      return res.json({ ok: false, error: 'Already in your friends list.' });
    }
    const requester = brDb.players[pid];
    const link: BrFriendRecord = {
      friendship_id: `${pid}_${target.player_id}`,
      player_id: pid,
      friend_id: target.player_id,
      friend_name: target.username,
      status: 'pending'
    };
    brDb.friends.push(link);
    persistBrDb();

    // Notify friend if online
    const targetWs = onlineByPlayerId.get(target.player_id);
    if (targetWs) {
      sendJson(targetWs, 'br:friendRequest', {
        fromId: pid,
        fromName: requester?.username || 'Player'
      });
    }
    const friends = brDb.friends.filter((f) => f.player_id === pid || f.friend_id === pid);
    res.json({ ok: true, friends });
  });

  app.patch('/api/br/friends/:friendshipId', (req, res) => {
    const fid = req.params.friendshipId;
    const { player_id, status } = req.body as { player_id?: string; status?: 'accepted' | 'blocked' | 'removed' };
    const pid = String(player_id || '');
    const idx = brDb.friends.findIndex((f) => f.friendship_id === fid);
    if (idx !== -1) {
      if (status === 'removed') {
        brDb.friends.splice(idx, 1);
      } else if (status === 'accepted' || status === 'blocked') {
        brDb.friends[idx].status = status;
      }
      persistBrDb();
    }
    const friends = brDb.friends.filter((f) => f.player_id === pid || f.friend_id === pid);
    res.json({ friends });
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = crypto.randomUUID();
    socketMeta.set(ws, {
      clientId,
      roomCode: null,
      playerId: null,
      username: 'SkyRunner',
      skill: 1,
      loadout: {},
      brMatchId: null,
      partyCode: null,
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

      // ===== Battle Royale Online Identity, Matchmaking, Party & Voice =====
      if (type === 'br:register') {
        meta.playerId = String(payload.playerId || clientId).slice(0, 128);
        meta.username = String(payload.username || 'SkyRunner').slice(0, 24);
        meta.skill = Number(payload.skill || 1);
        meta.loadout = (payload.loadout as Record<string, string>) || {};
        onlineByPlayerId.set(meta.playerId, ws);
        sendJson(ws, 'br:registered', { clientId, playerId: meta.playerId });
        return;
      }

      if (type === 'br:matchmake') {
        const mode = String(payload.mode || 'solo');
        const skill = Number(payload.skill ?? meta.skill ?? 1);
        meta.skill = skill;
        meta.username = String(payload.username || meta.username || 'SkyRunner').slice(0, 24);
        meta.loadout = (payload.loadout as Record<string, string>) || meta.loadout;

        // Leave previous match if any
        if (meta.brMatchId) {
          const prev = brMatches.get(meta.brMatchId);
          if (prev) {
            prev.members.delete(meta.clientId);
            broadcastBrMatch(prev, 'br:playerLeft', { clientId: meta.clientId });
            if (prev.members.size === 0) brMatches.delete(prev.id);
          }
          meta.brMatchId = null;
        }

        // Skill-based matchmaking bucket lookup (within 8 skill levels, started < 15s ago)
        const now = Date.now();
        let targetMatch: BrMatchRoom | null = null;
        for (const m of brMatches.values()) {
          if (
            m.mode === mode &&
            m.members.size < 40 &&
            Math.abs(m.skillAnchor - skill) <= 10 &&
            now - m.startedAt < 20000
          ) {
            targetMatch = m;
            break;
          }
        }
        if (!targetMatch) {
          targetMatch = {
            id: `match_${crypto.randomUUID().slice(0, 8)}`,
            mode,
            skillAnchor: skill,
            startedAt: now,
            members: new Map()
          };
          brMatches.set(targetMatch.id, targetMatch);
        }

        targetMatch.members.set(meta.clientId, ws);
        meta.brMatchId = targetMatch.id;

        const peerProfiles: Array<{ clientId: string; playerId: string | null; username: string; loadout: Record<string, string> }> = [];
        for (const [cid, sock] of targetMatch.members.entries()) {
          const pm = socketMeta.get(sock);
          if (pm && cid !== meta.clientId) {
            peerProfiles.push({
              clientId: cid,
              playerId: pm.playerId,
              username: pm.username,
              loadout: pm.loadout
            });
          }
        }

        sendJson(ws, 'br:matched', {
          matchId: targetMatch.id,
          selfClientId: meta.clientId,
          mode: targetMatch.mode,
          startedAt: targetMatch.startedAt,
          peers: peerProfiles
        });
        broadcastBrMatch(
          targetMatch,
          'br:playerJoined',
          {
            clientId: meta.clientId,
            playerId: meta.playerId,
            username: meta.username,
            loadout: meta.loadout
          },
          meta.clientId
        );
        return;
      }

      if (type === 'br:leaveMatch') {
        if (meta.brMatchId) {
          const match = brMatches.get(meta.brMatchId);
          meta.brMatchId = null;
          if (match) {
            match.members.delete(meta.clientId);
            broadcastBrMatch(match, 'br:playerLeft', { clientId: meta.clientId });
            if (match.members.size === 0) brMatches.delete(match.id);
          }
        }
        return;
      }

      if (type === 'br:state' || type === 'br:shoot' || type === 'br:build' || type === 'br:damage') {
        if (!meta.brMatchId) return;
        const match = brMatches.get(meta.brMatchId);
        if (!match) return;
        broadcastBrMatch(match, type, { ...payload, clientId: meta.clientId, username: meta.username }, meta.clientId);
        return;
      }

      // Party & Voice Chat Signaling
      if (type === 'br:partyCreate') {
        const code = sanitizeCode(payload.code) || crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
        if (meta.partyCode) removeFromRoom(ws);
        const party: PartyRoom = {
          code,
          hostPlayerId: meta.playerId || meta.clientId,
          members: new Map()
        };
        party.members.set(meta.clientId, {
          playerId: meta.playerId || meta.clientId,
          clientId: meta.clientId,
          username: meta.username,
          loadout: meta.loadout,
          ready: true,
          ws
        });
        parties.set(code, party);
        meta.partyCode = code;
        sendJson(ws, 'br:partySync', serializeParty(party));
        return;
      }

      if (type === 'br:partyJoin') {
        const code = sanitizeCode(payload.code);
        const party = parties.get(code);
        if (!party) {
          sendJson(ws, 'br:partyError', { message: 'Party code not found.' });
          return;
        }
        if (party.members.size >= 4) {
          sendJson(ws, 'br:partyError', { message: 'Squad party is full (max 4).' });
          return;
        }
        party.members.set(meta.clientId, {
          playerId: meta.playerId || meta.clientId,
          clientId: meta.clientId,
          username: meta.username,
          loadout: meta.loadout,
          ready: true,
          ws
        });
        meta.partyCode = code;
        broadcastParty(party, 'br:partySync', serializeParty(party));
        return;
      }

      if (type === 'br:partyInvite') {
        const targetPlayerId = String(payload.targetPlayerId || '');
        const targetWs = onlineByPlayerId.get(targetPlayerId);
        if (targetWs && meta.partyCode) {
          sendJson(targetWs, 'br:partyInviteReceived', {
            partyCode: meta.partyCode,
            fromName: meta.username
          });
        }
        return;
      }

      if (type === 'br:partyChat' && meta.partyCode) {
        const party = parties.get(meta.partyCode);
        if (party) {
          broadcastParty(party, 'br:partyChat', {
            sender: meta.username,
            text: String(payload.text || '').slice(0, 180)
          });
        }
        return;
      }

      if (type === 'br:voiceSignal' && meta.partyCode) {
        const party = parties.get(meta.partyCode);
        if (party) {
          broadcastParty(
            party,
            'br:voiceSignal',
            {
              fromClientId: meta.clientId,
              fromPlayerId: meta.playerId,
              signal: payload.signal
            },
            meta.clientId
          );
        }
        return;
      }

      // ===== Preserved Racing Room Handlers =====
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
        broadcastRoom(room, 'race:start', { trackId: room.trackId, laps: room.laps, startAt: room.startAt, grid });
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
      const meta = socketMeta.get(ws);
      if (meta?.playerId && onlineByPlayerId.get(meta.playerId) === ws) {
        onlineByPlayerId.delete(meta.playerId);
      }
      removeFromRoom(ws);
    });
  });

  // Heartbeat sweep every 15s
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
    console.log(`SkyDrop Royale server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
