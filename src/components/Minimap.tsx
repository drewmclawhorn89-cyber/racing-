import React, { useEffect, useRef } from 'react';
import { ISLAND_RADIUS, ISLAND_ZONES } from '../game/catalog';
import type { HudSnapshot } from '../game/engine';

interface MinimapProps {
  hud: HudSnapshot;
}

export const Minimap: React.FC<MinimapProps> = ({ hud }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const half = size / 2;
    const scale = (half - 10) / (ISLAND_RADIUS + 40);

    const toMapX = (wx: number) => half + wx * scale;
    const toMapY = (wz: number) => half + wz * scale;

    // Ocean background
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(0, 0, size, size);

    // Island land circle
    ctx.beginPath();
    ctx.arc(half, half, ISLAND_RADIUS * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#4cb944';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fde68a';
    ctx.stroke();

    // 7 Colored Zones & Labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const z of ISLAND_ZONES) {
      const mx = toMapX(z.x);
      const my = toMapY(z.z);
      ctx.beginPath();
      ctx.arc(mx, my, z.radius * scale * 0.65, 0, Math.PI * 2);
      ctx.fillStyle = z.mapColor;
      ctx.globalAlpha = 0.72;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.font = 'bold 8px sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(z.name.split(' ')[0], mx + 0.5, my + 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(z.name.split(' ')[0], mx, my);
    }

    // Storm Overlay (everything outside current storm circle)
    if (hud.mode !== 'creative') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, size, size);
      ctx.arc(toMapX(hud.stormX), toMapY(hud.stormZ), Math.max(2, hud.stormRadius * scale), 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(147, 51, 234, 0.42)';
      ctx.fill();
      ctx.restore();

      // Current storm ring
      ctx.beginPath();
      ctx.arc(toMapX(hud.stormX), toMapY(hud.stormZ), Math.max(2, hud.stormRadius * scale), 0, Math.PI * 2);
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Next safe zone ring
      ctx.beginPath();
      ctx.arc(toMapX(hud.nextStormX), toMapY(hud.nextStormZ), Math.max(2, hud.nextStormRadius * scale), 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Teammates / Bus / Nearby Actors
    for (const actor of hud.actors) {
      const ax = toMapX(actor.x);
      const ay = toMapY(actor.z);
      if (actor.kind === 'bus') {
        ctx.fillStyle = '#facc15';
        ctx.fillRect(ax - 4, ay - 4, 8, 8);
      } else if (actor.kind === 'teammate') {
        ctx.beginPath();
        ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = actor.downed ? '#ef4444' : '#38bdf8';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (actor.kind === 'enemy') {
        ctx.beginPath();
        ctx.arc(ax, ay, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = '#f87171';
        ctx.fill();
      }
    }

    // Player Triangle
    const px = toMapX(hud.playerX);
    const py = toMapY(hud.playerZ);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-hud.playerYaw);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fillStyle = '#fde047';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }, [hud]);

  return (
    <div className="bg-slate-950/90 border-2 border-slate-700 rounded-xl p-1.5 shadow-lg">
      <div className="flex items-center justify-between px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-sky-300">
        <span className="truncate max-w-[96px]">{hud.zoneName}</span>
        {hud.mode !== 'creative' && (
          <span className="tabular text-purple-300">
            P{hud.stormPhase} · {hud.stormTimer}s
          </span>
        )}
      </div>
      <canvas ref={canvasRef} width={144} height={144} className="rounded-lg block w-[132px] h-[132px] sm:w-[144px] sm:h-[144px]" />
    </div>
  );
};
