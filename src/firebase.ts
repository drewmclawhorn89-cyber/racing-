import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  DEFAULT_LOADOUT,
  getDailyShopItems,
  getStarterOwnedIds,
  getTodayKey,
  xpForLevel,
  type CosmeticType,
  type DailyQuestState,
  type GameMode,
  type PlayerLoadout,
  type Rarity
} from './game/catalog';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

// ===== Preserved Racing Types & Functions =====
export type CloudSaveData = {
  ownerId: string;
  displayName: string;
  email: string;
  photoURL: string;
  onlineName: string;
  coins: number;
  xp: number;
  wins: number;
  selectedCar: string;
  selectedTrack: string;
  unlockedCars: string[];
  weather: string;
  custom: Record<string, { color: string; wheels: string; spoiler: string }>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type GlobalTrackRecord = {
  id: string;
  userId: string;
  driverName: string;
  trackId: string;
  carName: string;
  mode: string;
  time: number;
};

const VALID_TRACKS = new Set(['city', 'desert', 'mountain', 'coastal']);
const VALID_WEATHER = new Set(['sunset', 'day', 'night', 'rain']);
const VALID_MODES = new Set(['Race', 'Time Trial', 'Online']);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return null;
    }
    throw error;
  }
}

export async function signOutGoogle(): Promise<void> {
  await signOut(auth);
}

export function subscribeAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function loadUserCloudSave(uid: string): Promise<CloudSaveData | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as CloudSaveData;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveUserCloudSave(
  user: User,
  localSave: {
    coins: number;
    xp: number;
    wins: number;
    selectedCar: string;
    selectedTrack: string;
    onlineName?: string;
    unlockedCars: string[];
    custom: Record<string, { color: string; wheels: string; spoiler: string }>;
    settings: { weather: string };
  }
): Promise<void> {
  if (!user.emailVerified) return;
  const path = `users/${user.uid}`;
  const docRef = doc(db, 'users', user.uid);

  let existingCreatedAt: Timestamp | null = null;
  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      existingCreatedAt = (existingSnap.data() as CloudSaveData).createdAt || null;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const displayName = (user.displayName || localSave.onlineName || 'Driver').trim().slice(0, 60) || 'Driver';
  const onlineName = (localSave.onlineName || user.displayName || 'Driver').trim().slice(0, 16) || 'Driver';
  const unlockedCars = Array.isArray(localSave.unlockedCars) && localSave.unlockedCars.length > 0
    ? localSave.unlockedCars.slice(0, 12).map((c) => String(c).slice(0, 20))
    : ['bmw'];

  const customMap: Record<string, { color: string; wheels: string; spoiler: string }> = {};
  if (localSave.custom && typeof localSave.custom === 'object') {
    Object.entries(localSave.custom)
      .slice(0, 12)
      .forEach(([carId, cfg]) => {
        customMap[String(carId).slice(0, 20)] = {
          color: String(cfg?.color || '#2563eb').slice(0, 16),
          wheels: String(cfg?.wheels || '5spoke').slice(0, 16),
          spoiler: String(cfg?.spoiler || 'street').slice(0, 16)
        };
      });
  }

  const payload = {
    ownerId: user.uid,
    displayName,
    email: String(user.email || '').slice(0, 120),
    photoURL: String(user.photoURL || '').slice(0, 400),
    onlineName,
    coins: Math.max(0, Math.min(100000000, Math.round(Number(localSave.coins) || 0))),
    xp: Math.max(0, Math.min(100000000, Math.round(Number(localSave.xp) || 0))),
    wins: Math.max(0, Math.min(1000000, Math.round(Number(localSave.wins) || 0))),
    selectedCar: String(localSave.selectedCar || 'bmw').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'bmw',
    selectedTrack: VALID_TRACKS.has(localSave.selectedTrack) ? localSave.selectedTrack : 'city',
    unlockedCars,
    weather: VALID_WEATHER.has(localSave.settings?.weather) ? localSave.settings.weather : 'sunset',
    custom: customMap,
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, existingCreatedAt ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function submitGlobalTrackRecord(
  user: User,
  entry: { trackId: string; carName: string; mode: string; time: number; driverName?: string }
): Promise<void> {
  if (!user.emailVerified) return;
  const trackId = VALID_TRACKS.has(entry.trackId) ? entry.trackId : 'city';
  const time = Number(entry.time);
  if (!Number.isFinite(time) || time <= 1 || time > 3600) return;

  const recordId = `${trackId}_${user.uid}`;
  const path = `trackRecords/${recordId}`;
  const docRef = doc(db, 'trackRecords', recordId);

  let existingCreatedAt: Timestamp | null = null;
  let existingTime = Infinity;
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as { createdAt?: Timestamp; time?: number };
      existingCreatedAt = data.createdAt || null;
      existingTime = Number(data.time) || Infinity;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (time >= existingTime) return;

  const driverName = (entry.driverName || user.displayName || 'Driver').trim().slice(0, 24) || 'Driver';
  const carName = String(entry.carName || 'Race Car').trim().slice(0, 40) || 'Race Car';
  const mode = VALID_MODES.has(entry.mode) ? entry.mode : 'Race';

  try {
    await setDoc(docRef, {
      userId: user.uid,
      driverName,
      trackId,
      carName,
      mode,
      time: Number(time.toFixed(3)),
      createdAt: existingCreatedAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, existingCreatedAt ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function fetchGlobalTrackRecords(trackId: string): Promise<GlobalTrackRecord[]> {
  if (!auth.currentUser?.emailVerified) return [];
  const path = 'trackRecords';
  try {
    const q = query(
      collection(db, 'trackRecords'),
      where('time', '>', 1),
      orderBy('time', 'asc'),
      limit(100)
    );
    const snap = await getDocs(q);
    const rows: GlobalTrackRecord[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d.trackId === trackId) {
        rows.push({
          id: docSnap.id,
          userId: String(d.userId || ''),
          driverName: String(d.driverName || 'Driver'),
          trackId: String(d.trackId || trackId),
          carName: String(d.carName || ''),
          mode: String(d.mode || 'Race'),
          time: Number(d.time || 0)
        });
      }
    });
    rows.sort((a, b) => a.time - b.time);
    return rows.slice(0, 15);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ===== Battle Royale Cloud Tables (players, matches, inventory, shop_items, friends) =====

export interface BrPlayerProfile {
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
  loadout: PlayerLoadout;
  quests: DailyQuestState;
}

export interface BrInventoryEntry {
  player_id: string;
  item_id: string;
  item_type: CosmeticType;
  equipped: boolean;
}

export interface BrMatchRecord {
  match_id: string;
  mode: GameMode;
  players: string[];
  winner: string;
  started_at: string;
  ended_at: string;
}

export interface BrShopItemRecord {
  item_id: string;
  name: string;
  price: number;
  rarity: Rarity;
  type: CosmeticType;
}

export interface BrFriendRecord {
  friendship_id: string;
  player_id: string;
  friend_id: string;
  friend_name: string;
  status: 'pending' | 'accepted' | 'blocked';
}

export function createDefaultBrPlayer(uid: string, name = 'SkyRunner', avatar = ''): BrPlayerProfile {
  return {
    player_id: uid,
    username: name.slice(0, 24) || 'SkyRunner',
    avatar: avatar.slice(0, 400),
    level: 1,
    xp: 0,
    wins: 0,
    kills: 0,
    coins: 500,
    matchesPlayed: 0,
    battlePassTier: 1,
    battlePassPremium: false,
    loadout: { ...DEFAULT_LOADOUT },
    quests: {
      date: getTodayKey(),
      kills: 0,
      surviveSec: 0,
      builds: 0,
      claimedKills: false,
      claimedSurvive: false,
      claimedBuilds: false
    }
  };
}

async function brApi<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function mirrorProfileToFirestore(user: User, profile: BrPlayerProfile): void {
  if (!user.emailVerified) return;
  const docRef = doc(db, 'players', user.uid);
  void getDoc(docRef)
    .then((snap) => {
      const existingCreatedAt = snap.exists() ? (snap.data() as { createdAt?: Timestamp }).createdAt : null;
      return setDoc(docRef, {
        ownerId: user.uid,
        username: profile.username,
        avatar: profile.avatar,
        level: profile.level,
        xp: profile.xp,
        wins: profile.wins,
        kills: profile.kills,
        coins: profile.coins,
        matchesPlayed: profile.matchesPlayed,
        battlePassTier: profile.battlePassTier,
        battlePassPremium: profile.battlePassPremium,
        loadout: profile.loadout,
        quests: profile.quests,
        createdAt: existingCreatedAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    })
    .catch(() => {
      // Cloud API remains authoritative if Firestore rules require owner deployment
    });
}

export async function loadOrCreateBrPlayer(user: User | null): Promise<{
  profile: BrPlayerProfile;
  inventory: BrInventoryEntry[];
}> {
  const uid = user?.uid || 'guest_local';
  const defaultName = (user?.displayName || 'SkyRunner').trim().slice(0, 24) || 'SkyRunner';
  const defaultAvatar = user?.photoURL || '';

  // Try Firestore first if signed in
  if (user?.emailVerified) {
    try {
      const snap = await getDoc(doc(db, 'players', user.uid));
      if (snap.exists()) {
        const d = snap.data() as Record<string, unknown>;
        const xp = Number(d.xp || 0);
        const calc = xpForLevel(xp);
        const loaded: BrPlayerProfile = {
          player_id: user.uid,
          username: String(d.username || defaultName),
          avatar: String(d.avatar || defaultAvatar),
          level: Math.max(calc.level, Number(d.level || 1)),
          xp,
          wins: Number(d.wins || 0),
          kills: Number(d.kills || 0),
          coins: Number(d.coins ?? 500),
          matchesPlayed: Number(d.matchesPlayed || 0),
          battlePassTier: Math.max(calc.tier, Number(d.battlePassTier || 1)),
          battlePassPremium: Boolean(d.battlePassPremium),
          loadout: { ...DEFAULT_LOADOUT, ...((d.loadout as Partial<PlayerLoadout>) || {}) },
          quests: normalizeQuests(d.quests as Partial<DailyQuestState> | undefined)
        };
        const apiRes = await brApi<{ profile: BrPlayerProfile; inventory: BrInventoryEntry[] }>(
          `/api/br/player/${encodeURIComponent(uid)}?username=${encodeURIComponent(loaded.username)}&avatar=${encodeURIComponent(loaded.avatar)}`
        );
        return {
          profile: loaded,
          inventory: apiRes?.inventory || buildStarterInventory(uid, loaded.loadout)
        };
      }
    } catch {
      // Fallback to server cloud API
    }
  }

  const apiRes = await brApi<{ profile: BrPlayerProfile; inventory: BrInventoryEntry[] }>(
    `/api/br/player/${encodeURIComponent(uid)}?username=${encodeURIComponent(defaultName)}&avatar=${encodeURIComponent(defaultAvatar)}`
  );
  if (apiRes?.profile) {
    apiRes.profile.quests = normalizeQuests(apiRes.profile.quests);
    return apiRes;
  }

  const fallback = createDefaultBrPlayer(uid, defaultName, defaultAvatar);
  return {
    profile: fallback,
    inventory: buildStarterInventory(uid, fallback.loadout)
  };
}

function normalizeQuests(raw?: Partial<DailyQuestState>): DailyQuestState {
  const today = getTodayKey();
  if (!raw || raw.date !== today) {
    return {
      date: today,
      kills: 0,
      surviveSec: 0,
      builds: 0,
      claimedKills: false,
      claimedSurvive: false,
      claimedBuilds: false
    };
  }
  return {
    date: today,
    kills: Number(raw.kills || 0),
    surviveSec: Number(raw.surviveSec || 0),
    builds: Number(raw.builds || 0),
    claimedKills: Boolean(raw.claimedKills),
    claimedSurvive: Boolean(raw.claimedSurvive),
    claimedBuilds: Boolean(raw.claimedBuilds)
  };
}

function buildStarterInventory(uid: string, loadout: PlayerLoadout): BrInventoryEntry[] {
  const equippedIds = new Set(Object.values(loadout));
  return getStarterOwnedIds().map((id) => ({
    player_id: uid,
    item_id: id,
    item_type: id.startsWith('skin_')
      ? 'skin'
      : id.startsWith('hair_')
      ? 'hair'
      : id.startsWith('pack_')
      ? 'backpack'
      : id.startsWith('pick_')
      ? 'pickaxe'
      : id.startsWith('glider_')
      ? 'glider'
      : 'emote',
    equipped: equippedIds.has(id)
  }));
}

export async function saveBrPlayer(user: User | null, profile: BrPlayerProfile): Promise<void> {
  if (user) {
    mirrorProfileToFirestore(user, profile);
  }
  await brApi(`/api/br/player/${encodeURIComponent(profile.player_id)}`, {
    method: 'PUT',
    body: JSON.stringify(profile)
  });
}

export async function saveBrInventoryItem(
  user: User | null,
  entry: BrInventoryEntry
): Promise<void> {
  if (user?.emailVerified) {
    const entryId = `${user.uid}_${entry.item_id}`;
    void getDoc(doc(db, 'inventory', entryId))
      .then((snap) => {
        const createdAt = snap.exists() ? (snap.data() as { createdAt?: Timestamp }).createdAt : null;
        return setDoc(doc(db, 'inventory', entryId), {
          player_id: user.uid,
          item_id: entry.item_id,
          item_type: entry.item_type,
          equipped: entry.equipped,
          createdAt: createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      })
      .catch(() => {});
  }
  await brApi('/api/br/inventory', {
    method: 'POST',
    body: JSON.stringify(entry)
  });
}

export async function recordBrMatch(user: User | null, match: BrMatchRecord): Promise<void> {
  if (user?.emailVerified) {
    void setDoc(doc(db, 'matches', match.match_id), {
      ...match,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }).catch(() => {});
  }
  await brApi('/api/br/matches', {
    method: 'POST',
    body: JSON.stringify(match)
  });
}

export async function fetchBrLeaderboard(): Promise<{
  players: BrPlayerProfile[];
  matches: BrMatchRecord[];
}> {
  const res = await brApi<{ players: BrPlayerProfile[]; matches: BrMatchRecord[] }>('/api/br/leaderboard');
  return res || { players: [], matches: [] };
}

export async function fetchDailyShop(): Promise<BrShopItemRecord[]> {
  const res = await brApi<{ items: BrShopItemRecord[] }>('/api/br/shop');
  if (res?.items?.length) return res.items;
  return getDailyShopItems().map((c) => ({
    item_id: c.item_id,
    name: c.name,
    price: c.price,
    rarity: c.rarity,
    type: c.type
  }));
}

export async function fetchBrFriends(playerId: string): Promise<BrFriendRecord[]> {
  const res = await brApi<{ friends: BrFriendRecord[] }>(`/api/br/friends/${encodeURIComponent(playerId)}`);
  return res?.friends || [];
}

export async function addBrFriend(
  playerId: string,
  friendQuery: string
): Promise<{ ok: boolean; error?: string; friends?: BrFriendRecord[] }> {
  const res = await brApi<{ ok: boolean; error?: string; friends?: BrFriendRecord[] }>('/api/br/friends', {
    method: 'POST',
    body: JSON.stringify({ player_id: playerId, friend_query: friendQuery })
  });
  return res || { ok: false, error: 'Network error' };
}

export async function updateBrFriendStatus(
  friendshipId: string,
  playerId: string,
  status: 'accepted' | 'blocked' | 'removed'
): Promise<BrFriendRecord[]> {
  const res = await brApi<{ friends: BrFriendRecord[] }>(`/api/br/friends/${encodeURIComponent(friendshipId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ player_id: playerId, status })
  });
  return res?.friends || [];
}
