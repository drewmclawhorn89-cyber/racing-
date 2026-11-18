import React, { useState } from 'react';
import { Award, Check, Coins, Crown, Lock, ShoppingBag, Sparkles, X } from 'lucide-react';
import {
  COSMETIC_CATALOG,
  DAILY_QUESTS,
  RARITY_COLORS,
  getBattlePassReward,
  type CosmeticItem
} from '../game/catalog';
import type { BrPlayerProfile, BrShopItemRecord } from '../firebase';

interface ShopPassPanelProps {
  profile: BrPlayerProfile;
  shopItems: BrShopItemRecord[];
  ownedItemIds: Set<string>;
  onBuyItem: (item: CosmeticItem) => void;
  onUnlockPremiumPass: () => void;
  onClaimQuest: (questId: 'kills' | 'survive' | 'builds') => void;
  onClose: () => void;
}

export const ShopPassPanel: React.FC<ShopPassPanelProps> = ({
  profile,
  shopItems,
  ownedItemIds,
  onBuyItem,
  onUnlockPremiumPass,
  onClaimQuest,
  onClose
}) => {
  const [tab, setTab] = useState<'shop' | 'pass' | 'quests'>('shop');

  const resolvedShop: CosmeticItem[] = shopItems
    .map((s) => COSMETIC_CATALOG.find((c) => c.item_id === s.item_id))
    .filter((c): c is CosmeticItem => Boolean(c));

  const tiers = Array.from({ length: 100 }, (_, i) => getBattlePassReward(i + 1));

  return (
    <div className="fixed inset-0 bg-slate-950/92 z-30 flex flex-col p-4 sm:p-6 overflow-hidden">
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <ShoppingBag className="w-6 h-6 text-amber-400" />
          <h2 className="font-display text-2xl font-black uppercase tracking-tight">Shop & Battle Pass</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-amber-400/50 rounded-lg px-3 py-1.5">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="tabular font-bold text-amber-300 text-sm">{profile.coins}</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="max-w-5xl w-full mx-auto flex gap-2 py-4">
        <button
          onClick={() => setTab('shop')}
          className={`px-4 py-2 rounded-xl font-bold text-sm cursor-pointer ${
            tab === 'shop' ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-800'
          }`}
        >
          Daily Item Shop
        </button>
        <button
          onClick={() => setTab('pass')}
          className={`px-4 py-2 rounded-xl font-bold text-sm cursor-pointer ${
            tab === 'pass' ? 'bg-sky-400 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-800'
          }`}
        >
          Battle Pass (100 Tiers)
        </button>
        <button
          onClick={() => setTab('quests')}
          className={`px-4 py-2 rounded-xl font-bold text-sm cursor-pointer ${
            tab === 'quests' ? 'bg-emerald-400 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-800'
          }`}
        >
          Daily Quests
        </button>
      </div>

      <div className="max-w-5xl w-full mx-auto flex-1 overflow-y-auto pr-1 pb-6">
        {tab === 'shop' && (
          <div>
            <p className="text-xs text-slate-400 mb-4">
              Fresh daily rotation synced to cloud catalog. Earn Coins from wins, kills, and Daily Quests.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {resolvedShop.map((item) => {
                const r = RARITY_COLORS[item.rarity];
                const owned = ownedItemIds.has(item.item_id);
                const canAfford = profile.coins >= item.price;
                return (
                  <div
                    key={item.item_id}
                    className="bg-slate-900 rounded-2xl border-2 p-4 flex flex-col justify-between"
                    style={{ borderColor: r.border }}
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase mb-2">
                        <span style={{ color: r.border }}>{item.rarity}</span>
                        <span className="text-slate-400">{item.type}</span>
                      </div>
                      <div
                        className="h-20 rounded-xl mb-3 flex items-center justify-center border border-white/10"
                        style={{
                          background: `linear-gradient(135deg, ${item.primaryColor}, ${item.secondaryColor})`
                        }}
                      >
                        <Sparkles className="w-8 h-8 text-white/90" />
                      </div>
                      <h3 className="font-display font-bold text-lg text-white">{item.name}</h3>
                      <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                    </div>

                    <button
                      disabled={owned || !canAfford}
                      onClick={() => onBuyItem(item)}
                      className={`mt-4 w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer ${
                        owned
                          ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700'
                          : canAfford
                          ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {owned ? (
                        <>
                          <Check className="w-4 h-4" /> Owned
                        </>
                      ) : (
                        <>
                          <Coins className="w-4 h-4" /> {item.price} Coins
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'pass' && (
          <div>
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <h3 className="font-display text-xl font-black uppercase">
                    Season 1 SkyDrop Pass — Tier {profile.battlePassTier} / 100
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Play matches and complete Daily Quests to climb all 100 Free & Premium tiers.
                </p>
              </div>
              {!profile.battlePassPremium ? (
                <button
                  disabled={profile.coins < 800}
                  onClick={onUnlockPremiumPass}
                  className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-sm cursor-pointer"
                >
                  Unlock Premium Track (800 Coins)
                </button>
              ) : (
                <span className="px-3 py-1.5 rounded-lg bg-amber-400/20 border border-amber-400 text-amber-300 text-xs font-bold uppercase">
                  Premium Track Active
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {tiers.map((reward) => {
                const unlocked = profile.battlePassTier >= reward.tier && (reward.track === 'free' || profile.battlePassPremium);
                return (
                  <div
                    key={reward.tier}
                    className={`rounded-xl border p-3 flex flex-col justify-between ${
                      unlocked
                        ? 'bg-sky-950/50 border-sky-400'
                        : 'bg-slate-900 border-slate-800 opacity-85'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase">
                      <span className="tabular text-white">Tier {reward.tier}</span>
                      <span className={reward.track === 'premium' ? 'text-amber-400' : 'text-emerald-400'}>
                        {reward.track}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-100 mt-2">{reward.label}</p>
                    <div className="mt-2 flex items-center gap-1 text-[10px]">
                      {unlocked ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Unlocked
                        </span>
                      ) : (
                        <span className="text-slate-500 flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Locked
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'quests' && (
          <div className="grid gap-4">
            {DAILY_QUESTS.map((q) => {
              const current =
                q.id === 'kills'
                  ? profile.quests.kills
                  : q.id === 'survive'
                  ? profile.quests.surviveSec
                  : profile.quests.builds;
              const claimed =
                q.id === 'kills'
                  ? profile.quests.claimedKills
                  : q.id === 'survive'
                  ? profile.quests.claimedSurvive
                  : profile.quests.claimedBuilds;
              const pct = Math.min(100, Math.round((current / q.target) * 100));
              const ready = current >= q.target && !claimed;

              return (
                <div
                  key={q.id}
                  className="bg-slate-900 border border-slate-700 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-display font-bold text-lg text-white">{q.title}</h3>
                    </div>
                    <div className="mt-2 w-full max-w-md h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="tabular text-xs text-slate-400 mt-1">
                      {Math.min(q.target, current)} / {q.target} {q.unit} · Reward: +{q.rewardCoins} Coins, +{q.rewardXp} XP
                    </p>
                  </div>

                  <button
                    disabled={!ready}
                    onClick={() => onClaimQuest(q.id)}
                    className={`px-4 py-2.5 rounded-xl font-bold text-sm cursor-pointer ${
                      claimed
                        ? 'bg-slate-800 text-emerald-400'
                        : ready
                        ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {claimed ? 'Claimed' : ready ? 'Claim Reward' : 'In Progress'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
