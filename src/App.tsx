import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Coins,
  Crown,
  Gamepad2,
  LogIn,
  LogOut,
  Palette,
  Play,
  Shield,
  ShoppingBag,
  Smartphone,
  Trophy,
  Users,
  Wrench
} from 'lucide-react';
import {
  addBrFriend,
  createDefaultBrPlayer,
  fetchBrFriends,
  fetchBrLeaderboard,
  fetchDailyShop,
  loadOrCreateBrPlayer,
  recordBrMatch,
  saveBrInventoryItem,
  saveBrPlayer,
  signInWithGoogle,
  signOutGoogle,
  subscribeAuth,
  updateBrFriendStatus,
  type BrFriendRecord,
  type BrInventoryEntry,
  type BrMatchRecord,
  type BrPlayerProfile,
  type BrShopItemRecord
} from './firebase';
import {
  DAILY_QUESTS,
  getStarterOwnedIds,
  getTodayKey,
  xpForLevel,
  type CosmeticItem,
  type EmoteId,
  type GameMode,
  type PlayerLoadout
} from './game/catalog';
import { soundEngine } from './game/audio';
import { BattleRoyaleEngine, type HudSnapshot, type MatchResult } from './game/engine';
import { brOnline, type PartyState } from './online';
import { LeaderboardPanel } from './components/LeaderboardPanel';
import { LockerPanel } from './components/LockerPanel';
import { MatchHud } from './components/MatchHud';
import { ShopPassPanel } from './components/ShopPassPanel';
import { SocialPanel } from './components/SocialPanel';

type ActiveModal = 'none' | 'shop' | 'locker' | 'leaderboard' | 'social';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BattleRoyaleEngine | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<BrPlayerProfile>(() => createDefaultBrPlayer('guest_local'));
  const [inventory, setInventory] = useState<BrInventoryEntry[]>([]);
  const [shopItems, setShopItems] = useState<BrShopItemRecord[]>([]);
  const [friends, setFriends] = useState<BrFriendRecord[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ players: BrPlayerProfile[]; matches: BrMatchRecord[] }>({
    players: [],
    matches: []
  });

  const [modal, setModal] = useState<ActiveModal>('none');
  const [selectedFamily, setSelectedFamily] = useState<'br' | 'zerobuild' | 'creative'>('br');
  const [brSubMode, setBrSubMode] = useState<'solo' | 'duo' | 'squad'>('solo');
  const [muted, setMuted] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? navigator.maxTouchPoints > 0 || window.innerWidth < 820 : false
  );

  const [party, setParty] = useState<PartyState | null>(null);
  const [partyChat, setPartyChat] = useState<{ sender: string; text: string }[]>([]);
  const [pendingInvite, setPendingInvite] = useState<{ partyCode: string; fromName: string } | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [hud, setHud] = useState<HudSnapshot | null>(null);

  const activeMode: GameMode =
    selectedFamily === 'br' ? brSubMode : selectedFamily === 'zerobuild' ? 'zerobuild' : 'creative';

  const ownedItemIds = useMemo(() => {
    const s = new Set<string>(getStarterOwnedIds());
    for (const entry of inventory) {
      s.add(entry.item_id);
    }
    return s;
  }, [inventory]);

  // Ref for latest profile & user inside engine callbacks
  const profileRef = useRef(profile);
  const userRef = useRef(user);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const handleMatchFinish = useCallback((res: MatchResult) => {
    const cur = profileRef.current;
    const curUser = userRef.current;
    const today = getTodayKey();
    const prevQuests =
      cur.quests.date === today
        ? cur.quests
        : {
            date: today,
            kills: 0,
            surviveSec: 0,
            builds: 0,
            claimedKills: false,
            claimedSurvive: false,
            claimedBuilds: false
          };

    const nextXp = cur.xp + res.xpEarned;
    const calc = xpForLevel(nextXp);
    const updated: BrPlayerProfile = {
      ...cur,
      xp: nextXp,
      level: calc.level,
      battlePassTier: calc.tier,
      coins: cur.coins + res.coinsEarned,
      wins: cur.wins + (res.won ? 1 : 0),
      kills: cur.kills + res.kills,
      matchesPlayed: cur.matchesPlayed + 1,
      quests: {
        ...prevQuests,
        kills: prevQuests.kills + res.kills,
        surviveSec: prevQuests.surviveSec + res.survivalSec,
        builds: prevQuests.builds + res.buildsPlaced
      }
    };
    setProfile(updated);
    void saveBrPlayer(curUser, updated);

    const nowIso = new Date().toISOString();
    const startIso = new Date(Date.now() - res.survivalSec * 1000).toISOString();
    void recordBrMatch(curUser, {
      match_id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      mode: res.mode,
      players: [cur.username],
      winner: res.winnerName,
      started_at: startIso,
      ended_at: nowIso
    });
  }, []);

  // Initialize Three.js Engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new BattleRoyaleEngine(
      canvas,
      (snapshot) => setHud(snapshot),
      handleMatchFinish
    );
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [handleMatchFinish]);

  useEffect(() => {
    engineRef.current?.setMobileMode(isMobile);
  }, [isMobile]);

  // Update 3D Lobby Showcase whenever loadout or party changes
  useEffect(() => {
    const mates =
      party?.members
        .filter((m) => m.playerId !== profile.player_id)
        .map((m) => m.loadout) || [];
    engineRef.current?.updateShowcaseLoadout(profile.loadout, profile.username, mates);
  }, [profile.loadout, profile.username, profile.player_id, party]);

  // Auth subscription & Cloud Profile load
  useEffect(() => {
    const unsub = subscribeAuth((authUser) => {
      setUser(authUser);
      void (async () => {
        const { profile: loaded, inventory: inv } = await loadOrCreateBrPlayer(authUser);
        setProfile(loaded);
        setInventory(inv);
        brOnline.register(loaded.player_id, loaded.username, loaded.level + loaded.wins * 2, loaded.loadout);
        const fList = await fetchBrFriends(loaded.player_id);
        setFriends(fList);
      })();
    });
    return unsub;
  }, []);

  // Initial shop & leaderboard fetch
  useEffect(() => {
    void fetchDailyShop().then(setShopItems);
    void fetchBrLeaderboard().then(setLeaderboard);
  }, []);

  // Online WebSocket Party & Friend listeners
  useEffect(() => {
    const unsub = brOnline.subscribe((type, raw) => {
      const p = raw as Record<string, unknown>;
      if (type === 'br:partySync') {
        setParty(raw as PartyState);
      } else if (type === 'br:partyChat') {
        setPartyChat((prev) => [...prev.slice(-24), { sender: String(p.sender || ''), text: String(p.text || '') }]);
      } else if (type === 'br:partyInviteReceived') {
        setPendingInvite({
          partyCode: String(p.partyCode || ''),
          fromName: String(p.fromName || 'Friend')
        });
        setStatusBanner(`${String(p.fromName || 'Friend')} invited you to their Squad Party!`);
      } else if (type === 'br:friendRequest') {
        void fetchBrFriends(profileRef.current.player_id).then(setFriends);
        setStatusBanner(`New friend request from ${String(p.fromName || 'Player')}!`);
      }
    });
    return unsub;
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch {
      setStatusBanner('Google Sign-In popup was cancelled or blocked.');
    }
  };

  const handleSignOut = async () => {
    await signOutGoogle();
  };

  const handlePlay = () => {
    setModal('none');
    engineRef.current?.startMatch({
      mode: activeMode,
      loadout: profile.loadout,
      username: profile.username,
      matchesPlayed: profile.matchesPlayed,
      partyCount: party?.members.length || 1
    });
  };

  const handleUpdateLoadout = (nextLoadout: PlayerLoadout) => {
    const updated: BrPlayerProfile = { ...profile, loadout: nextLoadout };
    setProfile(updated);
    void saveBrPlayer(user, updated);
    brOnline.register(updated.player_id, updated.username, updated.level + updated.wins * 2, nextLoadout);
  };

  const handleBuyItem = (item: CosmeticItem) => {
    if (ownedItemIds.has(item.item_id) || profile.coins < item.price) return;
    const updated: BrPlayerProfile = {
      ...profile,
      coins: profile.coins - item.price,
      loadout:
        item.type !== 'emote'
          ? { ...profile.loadout, [item.type]: item.item_id }
          : profile.loadout
    };
    const newEntry: BrInventoryEntry = {
      player_id: profile.player_id,
      item_id: item.item_id,
      item_type: item.type,
      equipped: item.type !== 'emote'
    };
    setProfile(updated);
    setInventory((prev) => [...prev, newEntry]);
    void saveBrPlayer(user, updated);
    void saveBrInventoryItem(user, newEntry);
    soundEngine.chest();
    setStatusBanner(`Unlocked & equipped ${item.name}!`);
  };

  const handleUnlockPremiumPass = () => {
    if (profile.battlePassPremium || profile.coins < 800) return;
    const updated: BrPlayerProfile = {
      ...profile,
      coins: profile.coins - 800,
      battlePassPremium: true
    };
    setProfile(updated);
    void saveBrPlayer(user, updated);
    soundEngine.victory();
  };

  const handleClaimQuest = (questId: 'kills' | 'survive' | 'builds') => {
    const def = DAILY_QUESTS.find((q) => q.id === questId);
    if (!def) return;
    const q = { ...profile.quests };
    if (questId === 'kills' && (q.claimedKills || q.kills < def.target)) return;
    if (questId === 'survive' && (q.claimedSurvive || q.surviveSec < def.target)) return;
    if (questId === 'builds' && (q.claimedBuilds || q.builds < def.target)) return;

    if (questId === 'kills') q.claimedKills = true;
    if (questId === 'survive') q.claimedSurvive = true;
    if (questId === 'builds') q.claimedBuilds = true;

    const nextXp = profile.xp + def.rewardXp;
    const calc = xpForLevel(nextXp);
    const updated: BrPlayerProfile = {
      ...profile,
      coins: profile.coins + def.rewardCoins,
      xp: nextXp,
      level: calc.level,
      battlePassTier: calc.tier,
      quests: q
    };
    setProfile(updated);
    void saveBrPlayer(user, updated);
    soundEngine.chest();
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.muted = next;
  };

  const handleAddFriend = async (query: string): Promise<string | null> => {
    const res = await addBrFriend(profile.player_id, query);
    if (!res.ok) return res.error || 'Could not add friend.';
    if (res.friends) setFriends(res.friends);
    return null;
  };

  const handleUpdateFriend = async (friendshipId: string, status: 'accepted' | 'blocked' | 'removed') => {
    const next = await updateBrFriendStatus(friendshipId, profile.player_id, status);
    setFriends(next);
  };

  const inMatch = Boolean(hud?.inMatch);

  return (
    <div className="relative w-full h-full overflow-hidden bg-sky-500">
      {/* Full-Viewport 3D Canvas */}
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full block z-0" />

      {/* Active Match HUD */}
      {inMatch && hud && (
        <MatchHud
          hud={hud}
          engine={engineRef.current}
          isMobile={isMobile}
          muted={muted}
          onToggleMute={handleToggleMute}
          onExit={() => engineRef.current?.exitMatch()}
          onPlayAgain={handlePlay}
        />
      )}

      {/* Home Screen / Lobby Overlay */}
      {!inMatch && (
        <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-6">
          {/* Top Navigation Bar: PLAY | SHOP | LOCKER | LEADERBOARD + Social & Google Account */}
          <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 bg-slate-950/90 border border-slate-800 rounded-2xl px-4 py-2.5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-display font-black text-lg">
                SR
              </div>
              <div>
                <h1 className="font-display font-black text-lg tracking-tight leading-none text-white">
                  SKYDROP <span className="text-amber-400">CITY</span>
                </h1>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                  Cartoon Island Battle Royale
                </p>
              </div>
            </div>

            {/* Primary Home Tabs */}
            <nav className="flex items-center gap-1.5">
              <button
                onClick={() => setModal('none')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-display font-bold text-xs uppercase cursor-pointer ${
                  modal === 'none'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Play className="w-3.5 h-3.5" /> Play
              </button>
              <button
                onClick={() => setModal('shop')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-display font-bold text-xs uppercase cursor-pointer ${
                  modal === 'shop'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" /> Shop
              </button>
              <button
                onClick={() => setModal('locker')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-display font-bold text-xs uppercase cursor-pointer ${
                  modal === 'locker'
                    ? 'bg-sky-400 text-slate-950'
                    : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Palette className="w-3.5 h-3.5" /> Locker
              </button>
              <button
                onClick={() => {
                  void fetchBrLeaderboard().then(setLeaderboard);
                  setModal('leaderboard');
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-display font-bold text-xs uppercase cursor-pointer ${
                  modal === 'leaderboard'
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" /> Leaderboard
              </button>
            </nav>

            {/* Right Account, Coins, Friends & Controls Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMobile((m) => !m)}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] font-bold text-slate-300 cursor-pointer"
                title="Switch Touch / PC Controls"
              >
                <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                {isMobile ? 'Phone Aim' : 'PC Controls'}
              </button>

              <button
                onClick={() => setModal('social')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-sky-400 text-xs font-bold text-sky-300 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Friends</span>
              </button>

              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-amber-400/40 text-xs font-bold text-amber-300 tabular">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                {profile.coins}
              </div>

              {user ? (
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1">
                  <span className="text-xs font-bold text-white max-w-[100px] truncate">{profile.username}</span>
                  <button
                    onClick={handleSignOut}
                    className="text-slate-400 hover:text-rose-400 cursor-pointer"
                    title="Sign out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleSignIn}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-slate-950 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" /> Google Sign-In
                </button>
              )}
            </div>
          </header>

          {statusBanner && (
            <div className="pointer-events-auto self-center bg-slate-950/95 border border-amber-400 text-amber-200 text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-3 shadow-lg">
              <span>{statusBanner}</span>
              <button onClick={() => setStatusBanner(null)} className="text-slate-400 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>
          )}

          {/* Bottom Home Controls: Left Player Progress/Quests + Right Mode Picker & PLAY Button */}
          {modal === 'none' && (
            <div className="flex flex-col md:flex-row items-stretch md:items-end justify-between gap-4">
              {/* Left Card: Account Level, Wins, Battle Pass & Daily Quests */}
              <div className="pointer-events-auto bg-slate-950/90 border border-slate-800 rounded-2xl p-4 w-full md:w-[340px] space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase text-sky-400">
                      Level {profile.level} · Tier {profile.battlePassTier} Pass
                    </p>
                    <h2 className="font-display font-black text-xl text-white">{profile.username}</h2>
                  </div>
                  <div className="text-right tabular">
                    <span className="block text-xs font-bold text-amber-300">{profile.wins} Wins</span>
                    <span className="block text-[11px] text-slate-400">{profile.kills} Kills</span>
                  </div>
                </div>

                {profile.matchesPlayed < 3 && (
                  <p className="text-[11px] text-emerald-300 bg-emerald-950/60 border border-emerald-800 rounded-lg px-2.5 py-1.5">
                    Starter Island Boost active ({3 - profile.matchesPlayed} bot-assisted matches left).
                  </p>
                )}

                <div className="space-y-1.5 pt-1 border-t border-slate-800">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase">
                    <span>Daily Quests</span>
                    <button
                      onClick={() => setModal('shop')}
                      className="text-amber-300 hover:underline cursor-pointer"
                    >
                      View Pass & Quests
                    </button>
                  </div>
                  {DAILY_QUESTS.map((q) => {
                    const val =
                      q.id === 'kills'
                        ? profile.quests.kills
                        : q.id === 'survive'
                        ? profile.quests.surviveSec
                        : profile.quests.builds;
                    return (
                      <div key={q.id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-200">{q.title}</span>
                        <span className="tabular text-emerald-400 font-bold">
                          {Math.min(q.target, val)}/{q.target}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Card: Mode Selector (Battle Royale Solo/Duo/Squad, Zero Build, Creative) & PLAY */}
              <div className="pointer-events-auto bg-slate-950/90 border border-slate-800 rounded-2xl p-4 w-full md:w-[370px] space-y-3 shadow-xl">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Select Mode</p>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setSelectedFamily('br')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer ${
                      selectedFamily === 'br'
                        ? 'bg-sky-500/20 border-sky-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    <Crown className="w-4 h-4 text-amber-400 mb-1" />
                    <span className="block font-bold text-xs">Battle Royale</span>
                    <span className="block text-[10px] text-slate-400">Build + 100P</span>
                  </button>

                  <button
                    onClick={() => setSelectedFamily('zerobuild')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer ${
                      selectedFamily === 'zerobuild'
                        ? 'bg-sky-500/20 border-sky-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    <Shield className="w-4 h-4 text-sky-400 mb-1" />
                    <span className="block font-bold text-xs">Zero Build</span>
                    <span className="block text-[10px] text-slate-400">Pure Combat</span>
                  </button>

                  <button
                    onClick={() => setSelectedFamily('creative')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer ${
                      selectedFamily === 'creative'
                        ? 'bg-sky-500/20 border-sky-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    <Wrench className="w-4 h-4 text-emerald-400 mb-1" />
                    <span className="block font-bold text-xs">Creative</span>
                    <span className="block text-[10px] text-slate-400">Free Build</span>
                  </button>
                </div>

                {selectedFamily === 'br' && (
                  <div className="grid grid-cols-3 gap-2">
                    {(['solo', 'duo', 'squad'] as const).map((sub) => (
                      <button
                        key={sub}
                        onClick={() => setBrSubMode(sub)}
                        className={`py-2 rounded-lg text-xs font-bold uppercase cursor-pointer border ${
                          brSubMode === sub
                            ? 'bg-amber-400 text-slate-950 border-amber-300'
                            : 'bg-slate-900 text-slate-300 border-slate-800'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={handlePlay}
                  className="w-full py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-lg uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                >
                  <Gamepad2 className="w-5 h-5" />
                  Play {activeMode === 'zerobuild' ? 'Zero Build' : activeMode === 'creative' ? 'Creative Practice' : `${brSubMode} Match`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {!inMatch && modal === 'shop' && (
        <ShopPassPanel
          profile={profile}
          shopItems={shopItems}
          ownedItemIds={ownedItemIds}
          onBuyItem={handleBuyItem}
          onUnlockPremiumPass={handleUnlockPremiumPass}
          onClaimQuest={handleClaimQuest}
          onClose={() => setModal('none')}
        />
      )}

      {!inMatch && modal === 'locker' && (
        <LockerPanel
          loadout={profile.loadout}
          ownedItemIds={ownedItemIds}
          onUpdateLoadout={handleUpdateLoadout}
          onPreviewEmote={(emote: EmoteId) => engineRef.current?.previewEmote(emote)}
          onClose={() => setModal('none')}
        />
      )}

      {!inMatch && modal === 'leaderboard' && (
        <LeaderboardPanel
          players={leaderboard.players}
          matches={leaderboard.matches}
          currentPlayerId={profile.player_id}
          onRefresh={() => void fetchBrLeaderboard().then(setLeaderboard)}
          onClose={() => setModal('none')}
        />
      )}

      {!inMatch && modal === 'social' && (
        <SocialPanel
          playerId={profile.player_id}
          friends={friends}
          party={party}
          partyChat={partyChat}
          pendingInvite={pendingInvite}
          onAddFriend={handleAddFriend}
          onUpdateFriend={handleUpdateFriend}
          onAcceptPartyInvite={(code) => {
            brOnline.joinParty(code);
            setPendingInvite(null);
          }}
          onClose={() => setModal('none')}
        />
      )}
    </div>
  );
}
