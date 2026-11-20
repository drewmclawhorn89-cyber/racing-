import React, { useRef, useState } from 'react';
import {
  Crosshair,
  Hammer,
  LogOut,
  Shield,
  Smile,
  Skull,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX
} from 'lucide-react';
import {
  WEAPONS,
  type BuildPieceType,
  type EmoteId,
  type MaterialType
} from '../game/catalog';
import type { BattleRoyaleEngine, HudSnapshot } from '../game/engine';
import { Minimap } from './Minimap';

interface MatchHudProps {
  hud: HudSnapshot;
  engine: BattleRoyaleEngine | null;
  isMobile: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
  onPlayAgain: () => void;
}

export const MatchHud: React.FC<MatchHudProps> = ({
  hud,
  engine,
  isMobile,
  muted,
  onToggleMute,
  onExit,
  onPlayAgain
}) => {
  const [emoteOpen, setEmoteOpen] = useState(false);
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });
  const joyTouchId = useRef<number | null>(null);

  const handleJoyStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t || joyTouchId.current !== null) return;
    joyTouchId.current = t.identifier;
    updateJoyFromTouch(t.clientX, t.clientY);
  };

  const handleJoyMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyTouchId.current) {
        updateJoyFromTouch(t.clientX, t.clientY);
      }
    }
  };

  const handleJoyEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchId.current) {
        joyTouchId.current = null;
        setJoyKnob({ x: 0, y: 0 });
        engine?.setJoystick(0, 0);
      }
    }
  };

  const updateJoyFromTouch = (cx: number, cy: number) => {
    const rect = joyBaseRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxR = rect.width * 0.42;
    let dx = cx - centerX;
    let dy = cy - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setJoyKnob({ x: dx, y: dy });
    engine?.setJoystick(dx / maxR, dy / maxR);
  };

  const buildAllowed = hud.mode !== 'zerobuild';

  const triggerBuild = (type: BuildPieceType) => {
    engine?.triggerBuildPiece(type);
  };

  const triggerEmote = (emote: EmoteId) => {
    engine?.triggerEmote(emote);
    setEmoteOpen(false);
  };

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-20">
      {/* Storm Damage Flash Vignette */}
      {(hud.damageFlash > 0 || hud.inStorm) && !hud.result && (
        <div
          className="fixed inset-0 pointer-events-none border-8"
          style={{
            borderColor: hud.inStorm ? 'rgba(168, 85, 247, 0.55)' : 'rgba(239, 68, 68, 0.55)'
          }}
        />
      )}

      {/* Top Left: Alive, Eliminations, Mode & Controls */}
      <div className="absolute top-3 left-3 flex flex-col gap-2 pointer-events-auto">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-700 rounded-lg px-3 py-1.5">
            <Users className="w-4 h-4 text-sky-400" />
            <span className="tabular font-bold text-sm">{hud.aliveCount}</span>
            <span className="text-[11px] text-slate-400 uppercase">Alive</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-700 rounded-lg px-3 py-1.5">
            <Skull className="w-4 h-4 text-amber-400" />
            <span className="tabular font-bold text-sm">{hud.kills}</span>
            <span className="text-[11px] text-slate-400 uppercase">Kills</span>
          </div>
          <button
            onClick={onToggleMute}
            className="bg-slate-950/90 border border-slate-700 hover:border-slate-500 rounded-lg p-2 text-slate-200 cursor-pointer"
            title={muted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onExit}
            className="flex items-center gap-1 bg-slate-950/90 border border-slate-700 hover:border-rose-500 text-rose-300 rounded-lg px-2.5 py-1.5 text-xs font-bold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Leave
          </button>
        </div>

        {/* Kill / Event Feed */}
        {hud.killFeed.length > 0 && (
          <div className="flex flex-col gap-1 pointer-events-none">
            {hud.killFeed.map((line, i) => (
              <div
                key={`${i}-${line}`}
                className="bg-slate-950/85 border border-slate-800 rounded px-2.5 py-1 text-xs text-amber-200 max-w-[260px]"
              >
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Right: Minimap */}
      <div className="absolute top-3 right-3 pointer-events-auto">
        <Minimap hud={hud} />
      </div>

      {/* Center Crosshair & Hitmarker */}
      {!hud.inBus && !hud.result && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative flex items-center justify-center">
            <Crosshair
              className={`w-6 h-6 transition-transform ${
                hud.hitmarker > 0 ? 'text-amber-400 scale-125' : 'text-white/90'
              }`}
              strokeWidth={2}
            />
          </div>
        </div>
      )}

      {/* Chopper / Glider / Downed / Interact Banner */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
        {hud.inBus && (
          <div className="bg-slate-950/90 border-2 border-amber-400 rounded-xl px-4 py-2 text-center shadow-lg">
            <p className="font-display font-bold text-amber-300 uppercase tracking-wider text-sm">
              Aboard the Chopper
            </p>
            <p className="text-xs text-slate-200">
              {isMobile ? 'Tap JUMP to drop into the city!' : 'Press SPACE to bail out over the city!'}
            </p>
          </div>
        )}
        {hud.skydiving && (
          <div className="bg-slate-950/90 border border-sky-400 rounded-lg px-3 py-1.5 text-xs font-bold text-sky-200">
            {hud.gliding ? 'Parachute Open — Steer to land' : 'Skydiving — Press SPACE to open Parachute'}
          </div>
        )}
        {hud.downed && (
          <div className="bg-rose-950/95 border-2 border-rose-500 rounded-xl px-4 py-2 text-center">
            <p className="text-xs font-bold uppercase text-rose-200">Critical! Crawl to cover</p>
            {hud.revivingProgress > 0 && (
              <div className="mt-1 w-40 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400"
                  style={{ width: `${Math.min(100, Math.round(hud.revivingProgress * 100))}%` }}
                />
              </div>
            )}
          </div>
        )}
        {hud.nearbyPrompt && (
          <button
            onClick={() => engine?.triggerInteract()}
            className="pointer-events-auto bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs px-4 py-2 rounded-lg shadow-lg cursor-pointer"
          >
            {hud.nearbyPrompt}
          </button>
        )}
        {!isMobile && !hud.pointerLocked && !hud.inBus && !hud.result && (
          <div className="bg-slate-950/85 border border-slate-700 rounded-lg px-3 py-1 text-[11px] text-slate-300">
            Click game view to aim · WASD Move · Shift Sprint · C Slide · 1-5 Weapons · Q/E/Z/X Build · F Pickup
          </div>
        )}
      </div>

      {/* Emote Wheel Overlay */}
      {emoteOpen && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-slate-700 rounded-2xl p-3 flex gap-2 pointer-events-auto shadow-xl">
          {([
            ['dance', 'Dance'],
            ['wave', 'Wave'],
            ['laugh', 'Laugh'],
            ['point', 'Point']
          ] as [EmoteId, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => triggerEmote(id)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-amber-400 hover:text-slate-950 font-bold text-xs cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Bottom Center: Health, Shield, Materials, Build Buttons & 5-Slot Hotbar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto max-w-[96vw]">
        {/* Build Pieces + Material Selector */}
        {buildAllowed && (
          <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-700 rounded-xl px-2.5 py-1.5">
            {(['wood', 'brick', 'metal'] as MaterialType[]).map((mat) => (
              <button
                key={mat}
                onClick={() => engine?.selectMaterial(mat)}
                className={`px-2 py-1 rounded text-[11px] font-bold uppercase tabular cursor-pointer border ${
                  hud.selectedMaterial === mat
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-slate-900 text-slate-300 border-slate-700'
                }`}
              >
                {mat === 'wood' ? 'W' : mat === 'brick' ? 'B' : 'M'}: {hud.materials[mat]}
              </button>
            ))}
            <div className="w-px h-5 bg-slate-700 mx-0.5" />
            {([
              ['wall', 'Wall (Q)'],
              ['ramp', 'Ramp (E)'],
              ['floor', 'Floor (Z)'],
              ['roof', 'Roof (X)']
            ] as [BuildPieceType, string][]).map(([piece, label]) => (
              <button
                key={piece}
                onClick={() => triggerBuild(piece)}
                className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold cursor-pointer"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* HP + Shield Bars */}
        <div className="w-full max-w-[380px] bg-slate-950/90 border border-slate-700 rounded-xl px-3 py-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-150"
                style={{ width: `${Math.min(100, Math.max(0, hud.shield))}%` }}
              />
            </div>
            <span className="tabular text-xs font-bold text-sky-300 w-8 text-right">{hud.shield}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-emerald-400 w-4 text-center">+</span>
            <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-150 ${hud.downed ? 'bg-rose-500' : 'bg-emerald-400'}`}
                style={{ width: `${Math.min(100, Math.max(0, hud.hp))}%` }}
              />
            </div>
            <span className="tabular text-xs font-bold text-emerald-300 w-8 text-right">{hud.hp}</span>
          </div>
        </div>

        {/* Pickaxe + 5 Weapon/Item Slots + Emote Toggle */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => engine?.selectSlot(-1)}
            className={`min-w-[46px] h-[46px] px-2 rounded-lg border-2 flex flex-col items-center justify-center cursor-pointer ${
              hud.activeSlot === -1
                ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                : 'bg-slate-950/90 border-slate-700 text-slate-300'
            }`}
            title="Harvest Tool (G)"
          >
            <Hammer className="w-4 h-4" />
            <span className="text-[9px] font-bold">Tool</span>
          </button>

          {hud.slots.map((slot, idx) => {
            const def = slot ? WEAPONS[slot.weaponId] : null;
            const active = hud.activeSlot === idx;
            return (
              <button
                key={idx}
                onClick={() => engine?.selectSlot(idx)}
                className={`min-w-[54px] h-[46px] px-2 rounded-lg border-2 flex flex-col items-center justify-center cursor-pointer ${
                  active
                    ? 'bg-sky-500/25 border-sky-400 text-white'
                    : 'bg-slate-950/90 border-slate-700 text-slate-300'
                }`}
              >
                <span className="text-[10px] font-bold truncate max-w-[56px]">
                  {def ? def.name.split(' ')[1] || def.name : `${idx + 1}`}
                </span>
                {slot && (
                  <span className="tabular text-[9px] text-amber-300">
                    {def?.kind === 'gun' ? `${slot.ammo}/${slot.maxAmmo}` : `x${slot.count}`}
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={() => setEmoteOpen((o) => !o)}
            className="min-w-[46px] h-[46px] px-2 rounded-lg border-2 bg-slate-950/90 border-slate-700 hover:border-amber-400 text-amber-300 flex flex-col items-center justify-center cursor-pointer"
            title="Emotes"
          >
            <Smile className="w-4 h-4" />
            <span className="text-[9px] font-bold">Emote</span>
          </button>
        </div>
      </div>

      {/* Mobile Touch Controls: Left Joystick + Right Action Cluster (Auto-Aim Assist Active) */}
      {isMobile && !hud.result && (
        <>
          <div
            ref={joyBaseRef}
            onTouchStart={handleJoyStart}
            onTouchMove={handleJoyMove}
            onTouchEnd={handleJoyEnd}
            className="pointer-events-auto absolute bottom-24 left-4 w-28 h-28 rounded-full bg-slate-950/65 border-2 border-slate-500/70 flex items-center justify-center touch-none"
          >
            <div
              className="w-12 h-12 rounded-full bg-amber-400 border-2 border-white shadow-lg"
              style={{ transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)` }}
            />
          </div>

          <div className="pointer-events-auto absolute bottom-24 right-4 grid grid-cols-2 gap-2">
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                engine?.setTouchShoot(true);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                engine?.setTouchShoot(false);
              }}
              className="col-span-2 min-h-[54px] px-5 rounded-2xl bg-rose-500 active:bg-rose-400 text-white font-display font-black tracking-wide text-sm border-2 border-white shadow-lg"
            >
              SHOOT
            </button>
            <button
              onClick={() => engine?.triggerJump()}
              className="min-w-[54px] min-h-[48px] rounded-xl bg-sky-500 text-white font-bold text-xs border border-white/60"
            >
              JUMP
            </button>
            <button
              onClick={() => engine?.triggerCrouchOrSlide()}
              className="min-w-[54px] min-h-[48px] rounded-xl bg-slate-800 text-white font-bold text-xs border border-slate-500"
            >
              SLIDE
            </button>
            <button
              onClick={() => engine?.cycleWeapon()}
              className="min-w-[54px] min-h-[48px] rounded-xl bg-amber-500 text-slate-950 font-bold text-xs border border-amber-200"
            >
              SWAP
            </button>
            <button
              onClick={() => engine?.triggerInteract()}
              className="min-w-[54px] min-h-[48px] rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs border border-emerald-200"
            >
              USE
            </button>
          </div>
        </>
      )}

      {/* Match Result Overlay (#1 Victory or Eliminated) */}
      {hud.result && (
        <div className="fixed inset-0 bg-slate-950/85 flex items-center justify-center p-4 pointer-events-auto z-30">
          <div className="w-full max-w-md bg-slate-900 border-2 border-amber-400 rounded-2xl p-6 text-center shadow-2xl">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-400/20 border border-amber-400 mb-3">
              {hud.result.won ? (
                <Trophy className="w-9 h-9 text-amber-400" />
              ) : (
                <Sparkles className="w-9 h-9 text-sky-400" />
              )}
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-300">
              {hud.result.won ? 'Respect +' : `Placed #${hud.result.placement} / ${hud.result.totalPlayers}`}
            </p>
            <h2 className={`gta-title ${hud.result.won ? 'gta-passed' : 'gta-wasted'} mt-1`}>
              {hud.result.won ? 'MISSION PASSED' : 'WASTED'}
            </h2>
            {!hud.result.won && (
              <p className="text-xs text-slate-400 mt-1">Eliminated by {hud.result.winnerName}</p>
            )}

            <div className="grid grid-cols-2 gap-3 mt-5 text-left">
              <div className="bg-slate-800 rounded-xl p-3">
                <span className="text-[10px] uppercase text-slate-400 block">Eliminations</span>
                <strong className="tabular text-xl text-white">{hud.result.kills}</strong>
              </div>
              <div className="bg-slate-800 rounded-xl p-3">
                <span className="text-[10px] uppercase text-slate-400 block">Survival Time</span>
                <strong className="tabular text-xl text-white">{hud.result.survivalSec}s</strong>
              </div>
              <div className="bg-slate-800 rounded-xl p-3">
                <span className="text-[10px] uppercase text-slate-400 block">XP Earned</span>
                <strong className="tabular text-xl text-sky-300">+{hud.result.xpEarned}</strong>
              </div>
              <div className="bg-slate-800 rounded-xl p-3">
                <span className="text-[10px] uppercase text-slate-400 block">Coins Earned</span>
                <strong className="tabular text-xl text-amber-300">+{hud.result.coinsEarned}</strong>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={onExit}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold text-sm text-white cursor-pointer"
              >
                Return Home
              </button>
              <button
                onClick={onPlayAgain}
                className="flex-1 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 font-display font-black uppercase text-sm text-slate-950 cursor-pointer"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
