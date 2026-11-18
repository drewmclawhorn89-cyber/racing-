import React, { useState } from 'react';
import { Crown, Skull, Star, Trophy, X } from 'lucide-react';
import type { BrMatchRecord, BrPlayerProfile } from '../firebase';

interface LeaderboardPanelProps {
  players: BrPlayerProfile[];
  matches: BrMatchRecord[];
  currentPlayerId: string;
  onRefresh: () => void;
  onClose: () => void;
}

export const LeaderboardPanel: React.FC<LeaderboardPanelProps> = ({
  players,
  matches,
  currentPlayerId,
  onRefresh,
  onClose
}) => {
  const [sortBy, setSortBy] = useState<'wins' | 'kills' | 'level'>('wins');

  const sorted = [...players].sort((a, b) => {
    if (sortBy === 'kills') return b.kills - a.kills || b.wins - a.wins;
    if (sortBy === 'level') return b.level - a.level || b.xp - a.xp;
    return b.wins - a.wins || b.kills - a.kills;
  });

  return (
    <div className="fixed inset-0 bg-slate-950/92 z-30 flex flex-col p-4 sm:p-6 overflow-hidden">
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <Trophy className="w-6 h-6 text-amber-400" />
          <h2 className="font-display text-2xl font-black uppercase">Island Leaderboard</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-xs font-bold cursor-pointer"
          >
            Refresh
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-4xl w-full mx-auto flex gap-2 py-4">
        <button
          onClick={() => setSortBy('wins')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
            sortBy === 'wins' ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-800'
          }`}
        >
          <Crown className="w-4 h-4" /> Most Wins
        </button>
        <button
          onClick={() => setSortBy('kills')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
            sortBy === 'kills' ? 'bg-rose-400 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-800'
          }`}
        >
          <Skull className="w-4 h-4" /> Most Kills
        </button>
        <button
          onClick={() => setSortBy('level')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
            sortBy === 'level' ? 'bg-sky-400 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-800'
          }`}
        >
          <Star className="w-4 h-4" /> Highest Level
        </button>
      </div>

      <div className="max-w-4xl w-full mx-auto flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 gap-5 pb-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Top Cloud Players</h3>
          {sorted.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              Play a match or sign in with Google to appear on the cloud leaderboard.
            </p>
          ) : (
            <div className="space-y-2">
              {sorted.map((p, idx) => {
                const isSelf = p.player_id === currentPlayerId;
                return (
                  <div
                    key={p.player_id}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${
                      isSelf ? 'bg-sky-950/60 border-sky-400' : 'bg-slate-950/70 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="tabular w-6 text-sm font-black text-amber-400">#{idx + 1}</span>
                      <div>
                        <p className="font-bold text-sm text-white">
                          {p.username} {isSelf && <span className="text-sky-300 text-xs">(You)</span>}
                        </p>
                        <p className="text-[11px] text-slate-400 tabular">Level {p.level}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs tabular">
                      <span className="text-amber-300 font-bold">{p.wins} W</span>
                      <span className="text-rose-300 font-bold">{p.kills} K</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Recent Matches</h3>
          {matches.length === 0 ? (
            <p className="text-xs text-slate-500">No completed matches recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {matches.slice(0, 12).map((m) => (
                <div key={m.match_id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="uppercase text-sky-400">{m.mode}</span>
                    <span className="text-amber-300 truncate max-w-[140px]">Winner: {m.winner}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 tabular">
                    {new Date(m.ended_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
