import React, { useState } from 'react';
import { Check, Lock, Palette, Smile, X } from 'lucide-react';
import {
  COSMETIC_CATALOG,
  RARITY_COLORS,
  SKIN_TONES,
  type CosmeticType,
  type EmoteId,
  type PlayerLoadout
} from '../game/catalog';

interface LockerPanelProps {
  loadout: PlayerLoadout;
  ownedItemIds: Set<string>;
  onUpdateLoadout: (next: PlayerLoadout) => void;
  onPreviewEmote: (emote: EmoteId) => void;
  onClose: () => void;
}

const TABS: { id: 'tone' | CosmeticType; label: string }[] = [
  { id: 'skin', label: 'Outfit' },
  { id: 'tone', label: 'Skin Tone' },
  { id: 'hair', label: 'Hair' },
  { id: 'backpack', label: 'Backpack' },
  { id: 'pickaxe', label: 'Pickaxe' },
  { id: 'glider', label: 'Glider' },
  { id: 'emote', label: 'Emotes' }
];

export const LockerPanel: React.FC<LockerPanelProps> = ({
  loadout,
  ownedItemIds,
  onUpdateLoadout,
  onPreviewEmote,
  onClose
}) => {
  const [tab, setTab] = useState<'tone' | CosmeticType>('skin');

  const items = tab === 'tone' ? [] : COSMETIC_CATALOG.filter((c) => c.type === tab);

  const selectCosmetic = (itemId: string, type: CosmeticType) => {
    if (type === 'emote') {
      const emoteKey = itemId.replace('emote_', '') as EmoteId;
      onPreviewEmote(emoteKey);
      return;
    }
    onUpdateLoadout({
      ...loadout,
      [type]: itemId
    });
  };

  return (
    <div className="fixed inset-y-0 left-0 w-full sm:w-[440px] bg-slate-950/94 border-r border-slate-800 z-30 flex flex-col p-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <Palette className="w-5 h-5 text-sky-400" />
          <h2 className="font-display text-xl font-black uppercase">Character Locker</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 py-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              tab === t.id ? 'bg-sky-400 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
        {tab === 'tone' ? (
          <div className="grid grid-cols-2 gap-3">
            {SKIN_TONES.map((tone) => {
              const active = loadout.skinTone === tone.id;
              return (
                <button
                  key={tone.id}
                  onClick={() => onUpdateLoadout({ ...loadout, skinTone: tone.id })}
                  className={`p-3 rounded-xl border-2 flex items-center gap-3 text-left cursor-pointer ${
                    active ? 'border-amber-400 bg-slate-900' : 'border-slate-800 bg-slate-900/70'
                  }`}
                >
                  <span
                    className="w-8 h-8 rounded-full border border-white/30 shrink-0"
                    style={{ backgroundColor: tone.hex }}
                  />
                  <span className="text-xs font-bold text-white">{tone.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {items.map((item) => {
              const owned = ownedItemIds.has(item.item_id) || Boolean(item.starter);
              const equipped =
                item.type !== 'emote' &&
                loadout[item.type as keyof PlayerLoadout] === item.item_id;
              const rarity = RARITY_COLORS[item.rarity];

              return (
                <button
                  key={item.item_id}
                  disabled={!owned}
                  onClick={() => selectCosmetic(item.item_id, item.type)}
                  className={`p-3 rounded-xl border-2 flex items-center justify-between gap-3 text-left cursor-pointer ${
                    equipped
                      ? 'bg-sky-950/60 border-sky-400'
                      : owned
                      ? 'bg-slate-900 border-slate-800 hover:border-slate-600'
                      : 'bg-slate-900/50 border-slate-800/70 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg border border-white/20 shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${item.primaryColor}, ${item.secondaryColor})`
                      }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{item.name}</span>
                        <span className="text-[10px] font-bold uppercase" style={{ color: rarity.border }}>
                          {item.rarity}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{item.description}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-xs font-bold">
                    {!owned ? (
                      <span className="text-slate-500 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" /> Shop
                      </span>
                    ) : item.type === 'emote' ? (
                      <span className="text-amber-300 flex items-center gap-1">
                        <Smile className="w-3.5 h-3.5" /> Preview
                      </span>
                    ) : equipped ? (
                      <span className="text-sky-300 flex items-center gap-1">
                        <Check className="w-4 h-4" /> Equipped
                      </span>
                    ) : (
                      <span className="text-slate-300">Equip</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
