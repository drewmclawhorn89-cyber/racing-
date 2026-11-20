export type GameMode = 'solo' | 'duo' | 'squad' | 'zerobuild' | 'creative';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type CosmeticType = 'skin' | 'hair' | 'backpack' | 'pickaxe' | 'glider' | 'emote';
export type EmoteId = 'dance' | 'wave' | 'laugh' | 'point';
export type BuildPieceType = 'wall' | 'floor' | 'ramp' | 'roof';
export type MaterialType = 'wood' | 'brick' | 'metal';

export type WeaponId =
  | 'pickaxe'
  | 'pistol'
  | 'rifle'
  | 'shotgun'
  | 'smg'
  | 'sniper'
  | 'bandage'
  | 'medkit'
  | 'minishield'
  | 'bigshield';

export interface IslandZone {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  z: number;
  radius: number;
  biome: 'grass' | 'city' | 'snow' | 'desert' | 'lake' | 'forest' | 'factory';
  mapColor: string;
  accentColor: string;
}

export const ISLAND_RADIUS = 380;

export const ISLAND_ZONES: IslandZone[] = [
  {
    id: 'meadows',
    name: 'Palm Heights',
    subtitle: 'Suburbs & Ranches',
    x: 0,
    z: 65,
    radius: 105,
    biome: 'grass',
    mapColor: '#6f7a4a',
    accentColor: '#fde047'
  },
  {
    id: 'city',
    name: 'Downtown Strip',
    subtitle: 'Skyscrapers & Gridlock',
    x: 35,
    z: -35,
    radius: 78,
    biome: 'city',
    mapColor: '#3b3f45',
    accentColor: '#38bdf8'
  },
  {
    id: 'mountain',
    name: 'Mount Chiliad Ridge',
    subtitle: 'Lookout & Radio Towers',
    x: 0,
    z: -210,
    radius: 95,
    biome: 'snow',
    mapColor: '#8a7f73',
    accentColor: '#60a5fa'
  },
  {
    id: 'desert',
    name: 'Sandy Flats',
    subtitle: 'Desert Motels & Trailers',
    x: 205,
    z: 145,
    radius: 105,
    biome: 'desert',
    mapColor: '#c9a26b',
    accentColor: '#f97316'
  },
  {
    id: 'lake',
    name: 'Harbor Bay',
    subtitle: 'Docks & Marina',
    x: -175,
    z: 95,
    radius: 92,
    biome: 'lake',
    mapColor: '#2d7a8a',
    accentColor: '#0ea5e9'
  },
  {
    id: 'forest',
    name: 'Green Hills',
    subtitle: 'Hunting Woods',
    x: -195,
    z: -125,
    radius: 98,
    biome: 'forest',
    mapColor: '#4d6a3a',
    accentColor: '#4ade80'
  },
  {
    id: 'factory',
    name: 'Port Industrial',
    subtitle: 'Warehouses & Shipping Yard',
    x: 195,
    z: -115,
    radius: 88,
    biome: 'factory',
    mapColor: '#4a4d52',
    accentColor: '#f59e0b'
  }
];

export interface WeaponDef {
  id: WeaponId;
  name: string;
  kind: 'tool' | 'gun' | 'heal';
  rarity: Rarity;
  damage: number;
  fireRate: number; // shots per second
  range: number;
  spread: number;
  pellets: number;
  magSize: number;
  reloadTime: number;
  color: string;
  healAmount?: number;
  shieldAmount?: number;
  maxCap?: number;
  description: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pickaxe: {
    id: 'pickaxe',
    name: 'Harvest Tool',
    kind: 'tool',
    rarity: 'common',
    damage: 25,
    fireRate: 2.0,
    range: 5.5,
    spread: 0,
    pellets: 1,
    magSize: 0,
    reloadTime: 0,
    color: '#94a3b8',
    description: 'Break trees, rocks, houses & cars for Wood, Brick, Metal.'
  },
  pistol: {
    id: 'pistol',
    name: 'Spark Pistol',
    kind: 'gun',
    rarity: 'common',
    damage: 24,
    fireRate: 4.4,
    range: 95,
    spread: 0.022,
    pellets: 1,
    magSize: 16,
    reloadTime: 1.2,
    color: '#cbd5e1',
    description: 'Snappy sidearm with reliable accuracy.'
  },
  rifle: {
    id: 'rifle',
    name: 'Ranger Carbine',
    kind: 'gun',
    rarity: 'rare',
    damage: 32,
    fireRate: 5.8,
    range: 165,
    spread: 0.018,
    pellets: 1,
    magSize: 30,
    reloadTime: 1.7,
    color: '#38bdf8',
    description: 'All-range automatic rifle built for island skirmishes.'
  },
  shotgun: {
    id: 'shotgun',
    name: 'Boom Blaster',
    kind: 'gun',
    rarity: 'uncommon',
    damage: 14,
    fireRate: 1.25,
    range: 36,
    spread: 0.085,
    pellets: 7,
    magSize: 6,
    reloadTime: 2.0,
    color: '#4ade80',
    description: 'Close-quarters scatter cannon firing 7 pellets.'
  },
  smg: {
    id: 'smg',
    name: 'Zipper SMG',
    kind: 'gun',
    rarity: 'uncommon',
    damage: 18,
    fireRate: 10.5,
    range: 75,
    spread: 0.042,
    pellets: 1,
    magSize: 35,
    reloadTime: 1.5,
    color: '#4ade80',
    description: 'Rapid-fire spray machine for fast pushes.'
  },
  sniper: {
    id: 'sniper',
    name: 'Horizon Longshot',
    kind: 'gun',
    rarity: 'epic',
    damage: 96,
    fireRate: 0.72,
    range: 280,
    spread: 0.002,
    pellets: 1,
    magSize: 4,
    reloadTime: 2.3,
    color: '#c084fc',
    description: 'High-velocity precision bolt rifle.'
  },
  bandage: {
    id: 'bandage',
    name: 'Bandage Roll',
    kind: 'heal',
    rarity: 'common',
    damage: 0,
    fireRate: 1.0,
    range: 0,
    spread: 0,
    pellets: 0,
    magSize: 5,
    reloadTime: 0,
    color: '#f8fafc',
    healAmount: 20,
    maxCap: 75,
    description: 'Restores +20 Health up to 75 HP.'
  },
  medkit: {
    id: 'medkit',
    name: 'Medipack',
    kind: 'heal',
    rarity: 'uncommon',
    damage: 0,
    fireRate: 0.6,
    range: 0,
    spread: 0,
    pellets: 0,
    magSize: 2,
    reloadTime: 0,
    color: '#ef4444',
    healAmount: 100,
    maxCap: 100,
    description: 'Full field kit restoring up to 100 Health.'
  },
  minishield: {
    id: 'minishield',
    name: 'Mini Fizz',
    kind: 'heal',
    rarity: 'uncommon',
    damage: 0,
    fireRate: 1.1,
    range: 0,
    spread: 0,
    pellets: 0,
    magSize: 4,
    reloadTime: 0,
    color: '#38bdf8',
    shieldAmount: 25,
    maxCap: 50,
    description: 'Bubbly shield tonic (+25 Shield up to 50).'
  },
  bigshield: {
    id: 'bigshield',
    name: 'Mega Potion',
    kind: 'heal',
    rarity: 'rare',
    damage: 0,
    fireRate: 0.7,
    range: 0,
    spread: 0,
    pellets: 0,
    magSize: 2,
    reloadTime: 0,
    color: '#0284c7',
    shieldAmount: 50,
    maxCap: 100,
    description: 'Concentrated shield brew (+50 Shield up to 100).'
  }
};

export const RARITY_COLORS: Record<Rarity, { bg: string; border: string; text: string; hex: number }> = {
  common: { bg: '#475569', border: '#94a3b8', text: '#f1f5f9', hex: 0x94a3b8 },
  uncommon: { bg: '#15803d', border: '#4ade80', text: '#dcfce7', hex: 0x4ade80 },
  rare: { bg: '#0369a1', border: '#38bdf8', text: '#e0f2fe', hex: 0x38bdf8 },
  epic: { bg: '#7e22ce', border: '#c084fc', text: '#f3e8ff', hex: 0xc084fc },
  legendary: { bg: '#b45309', border: '#fbbf24', text: '#fef3c7', hex: 0xfbbf24 }
};

export interface CosmeticItem {
  item_id: string;
  name: string;
  type: CosmeticType;
  rarity: Rarity;
  price: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  starter?: boolean;
  description: string;
}

export const SKIN_TONES = [
  { id: 'peach', name: 'Peach Pop', hex: '#ffcca8' },
  { id: 'honey', name: 'Warm Honey', hex: '#e8a87c' },
  { id: 'cocoa', name: 'Cocoa Rich', hex: '#8d5524' },
  { id: 'ivory', name: 'Ivory Breeze', hex: '#ffe3d3' },
  { id: 'golden', name: 'Golden Tan', hex: '#d9915b' },
  { id: 'mint', name: 'Minty Star', hex: '#6ee7b7' }
] as const;

export const COSMETIC_CATALOG: CosmeticItem[] = [
  // Outfits (skin)
  { item_id: 'skin_scout', name: 'Scout Hoodie', type: 'skin', rarity: 'common', price: 0, primaryColor: '#2563eb', secondaryColor: '#1e293b', accentColor: '#fbbf24', starter: true, description: 'Bright island runner hoodie with crisp stripes.' },
  { item_id: 'skin_captain', name: 'Sky Captain', type: 'skin', rarity: 'rare', price: 600, primaryColor: '#0284c7', secondaryColor: '#f8fafc', accentColor: '#facc15', description: 'Aviator flight jacket with sky-blue trim.' },
  { item_id: 'skin_neon', name: 'Neon Striker', type: 'skin', rarity: 'epic', price: 950, primaryColor: '#ec4899', secondaryColor: '#1e1b4b', accentColor: '#22d3ee', description: 'Electric arcade suit with glowing cyan accents.' },
  { item_id: 'skin_frost', name: 'Frost Parka', type: 'skin', rarity: 'rare', price: 700, primaryColor: '#38bdf8', secondaryColor: '#f1f5f9', accentColor: '#fb7185', description: 'Puffy Frostpeak Summit expedition parka.' },
  { item_id: 'skin_nomad', name: 'Dune Nomad', type: 'skin', rarity: 'uncommon', price: 450, primaryColor: '#f97316', secondaryColor: '#78350f', accentColor: '#fde047', description: 'Sunburst canyon poncho built for speed.' },
  { item_id: 'skin_knight', name: 'Pixel Knight', type: 'skin', rarity: 'legendary', price: 1400, primaryColor: '#7c3aed', secondaryColor: '#0f172a', accentColor: '#fbbf24', description: 'Royal cartoon armor forged in Brickwood Town.' },
  { item_id: 'skin_candy', name: 'Candy Comet', type: 'skin', rarity: 'epic', price: 1000, primaryColor: '#f43f5e', secondaryColor: '#fdf2f8', accentColor: '#34d399', description: 'Sweet bubblegum racer jacket.' },
  { item_id: 'skin_volt', name: 'Volt Runner', type: 'skin', rarity: 'legendary', price: 1500, primaryColor: '#eab308', secondaryColor: '#18181b', accentColor: '#22d3ee', description: 'High-voltage Gearworks champion gear.' },

  // Hairs
  { item_id: 'hair_spiky', name: 'Spiky Comet', type: 'hair', rarity: 'common', price: 0, primaryColor: '#78350f', secondaryColor: '#92400e', accentColor: '#fbbf24', starter: true, description: 'Classic energetic spiky locks.' },
  { item_id: 'hair_bob', name: 'Bubble Bob', type: 'hair', rarity: 'common', price: 0, primaryColor: '#f59e0b', secondaryColor: '#fbbf24', accentColor: '#ffffff', starter: true, description: 'Bouncy rounded cartoon bob cut.' },
  { item_id: 'hair_mohawk', name: 'Neon Mohawk', type: 'hair', rarity: 'rare', price: 350, primaryColor: '#ec4899', secondaryColor: '#a855f7', accentColor: '#22d3ee', description: 'Tall electric punk crest.' },
  { item_id: 'hair_buns', name: 'Twin Buns', type: 'hair', rarity: 'uncommon', price: 250, primaryColor: '#38bdf8', secondaryColor: '#0284c7', accentColor: '#f472b6', description: 'Playful double space buns.' },
  { item_id: 'hair_pomp', name: 'Aero Pomp', type: 'hair', rarity: 'rare', price: 400, primaryColor: '#1e293b', secondaryColor: '#475569', accentColor: '#facc15', description: 'Swept-back sky-hero pompadour.' },
  { item_id: 'hair_visor', name: 'Cyber Helmet', type: 'hair', rarity: 'epic', price: 650, primaryColor: '#e2e8f0', secondaryColor: '#334155', accentColor: '#22d3ee', description: 'Sleek bubble visor dome helmet.' },

  // Backpacks
  { item_id: 'pack_trail', name: 'Trail Pack', type: 'backpack', rarity: 'common', price: 0, primaryColor: '#16a34a', secondaryColor: '#fde047', accentColor: '#ffffff', starter: true, description: 'Sturdy adventurer rucksack.' },
  { item_id: 'pack_jet', name: 'Jet Booster', type: 'backpack', rarity: 'epic', price: 750, primaryColor: '#ef4444', secondaryColor: '#f8fafc', accentColor: '#38bdf8', description: 'Twin rocket thruster pack.' },
  { item_id: 'pack_star', name: 'Star Satchel', type: 'backpack', rarity: 'rare', price: 500, primaryColor: '#a855f7', secondaryColor: '#fbbf24', accentColor: '#fdf4ff', description: 'Sparkling golden-star pouch.' },
  { item_id: 'pack_dino', name: 'Dino Shell', type: 'backpack', rarity: 'rare', price: 550, primaryColor: '#22c55e', secondaryColor: '#facc15', accentColor: '#15803d', description: 'Spiky friendly reptile shell.' },
  { item_id: 'pack_boom', name: 'Boombox Cube', type: 'backpack', rarity: 'legendary', price: 900, primaryColor: '#0ea5e9', secondaryColor: '#1e293b', accentColor: '#ec4899', description: 'Subwoofer cube ready for Victory dances.' },

  // Pickaxes
  { item_id: 'pick_timber', name: 'Timber Axe', type: 'pickaxe', rarity: 'common', price: 0, primaryColor: '#92400e', secondaryColor: '#cbd5e1', accentColor: '#f59e0b', starter: true, description: 'Trusty island harvester axe.' },
  { item_id: 'pick_starwand', name: 'Star Wand', type: 'pickaxe', rarity: 'rare', price: 500, primaryColor: '#ec4899', secondaryColor: '#fbbf24', accentColor: '#ffffff', description: 'Bright star-tipped comic mallet.' },
  { item_id: 'pick_bolt', name: 'Bolt Hammer', type: 'pickaxe', rarity: 'epic', price: 700, primaryColor: '#eab308', secondaryColor: '#334155', accentColor: '#22d3ee', description: 'Supercharged Gearworks wrench-hammer.' },
  { item_id: 'pick_ice', name: 'Ice Cleaver', type: 'pickaxe', rarity: 'rare', price: 550, primaryColor: '#38bdf8', secondaryColor: '#e0f2fe', accentColor: '#0284c7', description: 'Carved from Frostpeak glacier crystal.' },
  { item_id: 'pick_plasma', name: 'Plasma Edge', type: 'pickaxe', rarity: 'legendary', price: 1100, primaryColor: '#a855f7', secondaryColor: '#0f172a', accentColor: '#34d399', description: 'Neon energy blade for rapid harvesting.' },

  // Gliders
  { item_id: 'glider_sunburst', name: 'Sunburst Wing', type: 'glider', rarity: 'common', price: 0, primaryColor: '#f59e0b', secondaryColor: '#38bdf8', accentColor: '#ffffff', starter: true, description: 'Bright orange-and-sky starter hang-glider.' },
  { item_id: 'glider_parasol', name: 'Aero Parasol', type: 'glider', rarity: 'uncommon', price: 400, primaryColor: '#ec4899', secondaryColor: '#fef08a', accentColor: '#ffffff', description: 'Cheerful striped victory umbrella.' },
  { item_id: 'glider_cloud', name: 'Cloud Surfer', type: 'glider', rarity: 'epic', price: 800, primaryColor: '#f8fafc', secondaryColor: '#38bdf8', accentColor: '#fbbf24', description: 'Fluffy cumulus skyboard.' },
  { item_id: 'glider_rocket', name: 'Rocket Kite', type: 'glider', rarity: 'rare', price: 650, primaryColor: '#ef4444', secondaryColor: '#fbbf24', accentColor: '#1e293b', description: 'Twin-fin stunt wing.' },
  { item_id: 'glider_comet', name: 'Comet Chute', type: 'glider', rarity: 'legendary', price: 1150, primaryColor: '#7c3aed', secondaryColor: '#22d3ee', accentColor: '#f472b6', description: 'Starlight canopy with neon ribs.' },

  // Emotes
  { item_id: 'emote_dance', name: 'Groove Shuffle', type: 'emote', rarity: 'common', price: 0, primaryColor: '#22d3ee', secondaryColor: '#ec4899', accentColor: '#fbbf24', starter: true, description: 'Upbeat cartoon victory dance.' },
  { item_id: 'emote_wave', name: 'Friendly Wave', type: 'emote', rarity: 'common', price: 0, primaryColor: '#4ade80', secondaryColor: '#ffffff', accentColor: '#38bdf8', starter: true, description: 'Cheerful two-step wave hello.' },
  { item_id: 'emote_laugh', name: 'Giggle Burst', type: 'emote', rarity: 'uncommon', price: 300, primaryColor: '#fbbf24', secondaryColor: '#f97316', accentColor: '#ffffff', description: 'Hold-your-belly cartoon laugh.' },
  { item_id: 'emote_point', name: 'Victory Point', type: 'emote', rarity: 'rare', price: 400, primaryColor: '#a855f7', secondaryColor: '#facc15', accentColor: '#ffffff', description: 'Heroic pose pointing toward the safe zone.' }
];

export interface PlayerLoadout {
  skinTone: string;
  hair: string;
  skin: string;
  backpack: string;
  pickaxe: string;
  glider: string;
}

export const DEFAULT_LOADOUT: PlayerLoadout = {
  skinTone: 'peach',
  hair: 'hair_spiky',
  skin: 'skin_scout',
  backpack: 'pack_trail',
  pickaxe: 'pick_timber',
  glider: 'glider_sunburst'
};

export interface DailyQuestState {
  date: string;
  kills: number;
  surviveSec: number;
  builds: number;
  claimedKills: boolean;
  claimedSurvive: boolean;
  claimedBuilds: boolean;
}

export interface QuestDef {
  id: 'kills' | 'survive' | 'builds';
  title: string;
  target: number;
  rewardCoins: number;
  rewardXp: number;
  unit: string;
}

export const DAILY_QUESTS: QuestDef[] = [
  { id: 'kills', title: 'Get 5 kills', target: 5, rewardCoins: 150, rewardXp: 400, unit: 'kills' },
  { id: 'survive', title: 'Survive 10 minutes', target: 600, rewardCoins: 150, rewardXp: 400, unit: 'sec' },
  { id: 'builds', title: 'Build 50 structures', target: 50, rewardCoins: 150, rewardXp: 400, unit: 'builds' }
];

export interface BattlePassReward {
  tier: number;
  track: 'free' | 'premium';
  label: string;
  coins?: number;
  itemId?: string;
}

export function getBattlePassReward(tier: number): BattlePassReward {
  const milestones: Record<number, { track: 'free' | 'premium'; label: string; itemId?: string; coins?: number }> = {
    1: { track: 'free', label: '100 Coins', coins: 100 },
    5: { track: 'free', label: 'Twin Buns Hair', itemId: 'hair_buns' },
    10: { track: 'premium', label: 'Dune Nomad Outfit', itemId: 'skin_nomad' },
    15: { track: 'free', label: 'Aero Parasol Glider', itemId: 'glider_parasol' },
    20: { track: 'premium', label: 'Giggle Burst Emote', itemId: 'emote_laugh' },
    25: { track: 'free', label: 'Star Satchel Pack', itemId: 'pack_star' },
    30: { track: 'premium', label: 'Frost Parka Outfit', itemId: 'skin_frost' },
    40: { track: 'free', label: 'Star Wand Pickaxe', itemId: 'pick_starwand' },
    50: { track: 'premium', label: 'Neon Striker Outfit', itemId: 'skin_neon' },
    60: { track: 'free', label: 'Victory Point Emote', itemId: 'emote_point' },
    70: { track: 'premium', label: 'Jet Booster Pack', itemId: 'pack_jet' },
    80: { track: 'free', label: 'Cloud Surfer Glider', itemId: 'glider_cloud' },
    90: { track: 'premium', label: 'Pixel Knight Outfit', itemId: 'skin_knight' },
    100: { track: 'premium', label: 'Volt Runner Outfit', itemId: 'skin_volt' }
  };
  if (milestones[tier]) {
    return { tier, ...milestones[tier] };
  }
  const isPremium = tier % 2 === 0;
  const coins = tier % 5 === 0 ? 125 : 50;
  return {
    tier,
    track: isPremium ? 'premium' : 'free',
    label: `${coins} Coins`,
    coins
  };
}

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyShopItems(dateKey = getTodayKey()): CosmeticItem[] {
  const purchasable = COSMETIC_CATALOG.filter((item) => !item.starter && item.price > 0);
  let seed = 0;
  for (let i = 0; i < dateKey.length; i++) {
    seed = (seed * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  const picked: CosmeticItem[] = [];
  const used = new Set<string>();
  const types: CosmeticType[] = ['skin', 'skin', 'glider', 'pickaxe', 'backpack', 'hair', 'emote', 'skin'];
  for (let i = 0; i < types.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const candidates = purchasable.filter((item) => item.type === types[i] && !used.has(item.item_id));
    if (candidates.length > 0) {
      const choice = candidates[seed % candidates.length];
      picked.push(choice);
      used.add(choice.item_id);
    }
  }
  return picked;
}

export function xpForLevel(xp: number): { level: number; tier: number; intoLevel: number; needLevel: number } {
  const safeXp = Math.max(0, Math.floor(xp));
  const needLevel = 500;
  const level = Math.max(1, Math.floor(safeXp / needLevel) + 1);
  const tier = Math.max(1, Math.min(100, Math.floor(safeXp / 350) + 1));
  return {
    level,
    tier,
    intoLevel: safeXp % needLevel,
    needLevel
  };
}

export function getCosmetic(itemId: string): CosmeticItem {
  return COSMETIC_CATALOG.find((c) => c.item_id === itemId) || COSMETIC_CATALOG[0];
}

export function getStarterOwnedIds(): string[] {
  return COSMETIC_CATALOG.filter((c) => c.starter).map((c) => c.item_id);
}

export function zoneAtPosition(x: number, z: number): IslandZone {
  let closest = ISLAND_ZONES[0];
  let bestDist = Infinity;
  for (const zone of ISLAND_ZONES) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    const d = Math.hypot(dx, dz) - zone.radius * 0.4;
    if (d < bestDist) {
      bestDist = d;
      closest = zone;
    }
  }
  return closest;
}
