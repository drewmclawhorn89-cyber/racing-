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

  // Only overwrite if faster than previous personal best on this circuit
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
