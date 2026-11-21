'use client';

import React from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles, Zap } from 'lucide-react';
import { ElementAffinity, TeamSide } from '@/lib/game/types';

export interface CombatProjectile {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  kind: 'damage' | 'heal' | 'shield';
  color: string;
  glowColor: string;
  isCritical?: boolean;
  isUltimate?: boolean;
  isResonant?: boolean;
}

export interface UltimateCutInData {
  id: string;
  actorName: string;
  actorTitle: string;
  artworkUrl: string;
  element: ElementAffinity;
  abilityName: string;
  side: TeamSide;
  isViewerAlly: boolean;
}

interface CombatVfxLayerProps {
  projectiles: CombatProjectile[];
  ultimateBanner: UltimateCutInData | null;
}

const ELEMENT_HEX: Record<ElementAffinity, { main: string; glow: string; band: string }> = {
  Solar: {
    main: '#F5DC8B',
    glow: 'rgba(245, 220, 139, 0.7)',
    band: 'from-amber-500/25 via-[#D4AF37]/30 to-amber-500/10',
  },
  Void: {
    main: '#C084FC',
    glow: 'rgba(192, 132, 252, 0.7)',
    band: 'from-purple-600/30 via-fuchsia-500/25 to-purple-900/15',
  },
  Storm: {
    main: '#38BDF8',
    glow: 'rgba(56, 189, 248, 0.72)',
    band: 'from-sky-500/30 via-cyan-400/25 to-sky-900/15',
  },
  Aether: {
    main: '#34D399',
    glow: 'rgba(52, 211, 153, 0.7)',
    band: 'from-emerald-500/25 via-teal-400/25 to-emerald-900/15',
  },
  Cyber: {
    main: '#22D3EE',
    glow: 'rgba(34, 211, 238, 0.72)',
    band: 'from-cyan-500/30 via-sky-500/25 to-cyan-900/15',
  },
  Iron: {
    main: '#CBD5E1',
    glow: 'rgba(203, 213, 225, 0.65)',
    band: 'from-slate-400/25 via-zinc-300/20 to-slate-800/15',
  },
  Ember: {
    main: '#FB923C',
    glow: 'rgba(251, 146, 60, 0.75)',
    band: 'from-orange-600/30 via-rose-500/25 to-amber-900/15',
  },
  Frost: {
    main: '#93C5FD',
    glow: 'rgba(147, 197, 253, 0.72)',
    band: 'from-blue-500/30 via-indigo-400/25 to-blue-900/15',
  },
};

export function getProjectilePalette(
  kind: 'damage' | 'heal' | 'shield',
  element: ElementAffinity
): { color: string; glowColor: string } {
  if (kind === 'heal') {
    return { color: '#34D399', glowColor: 'rgba(52, 211, 153, 0.75)' };
  }
  if (kind === 'shield') {
    return { color: '#38BDF8', glowColor: 'rgba(56, 189, 248, 0.75)' };
  }
  const elem = ELEMENT_HEX[element];
  return { color: elem.main, glowColor: elem.glow };
}

export function CombatVfxLayer({
  projectiles,
  ultimateBanner,
}: CombatVfxLayerProps) {
  const elemBand = ultimateBanner
    ? ELEMENT_HEX[ultimateBanner.element]
    : ELEMENT_HEX.Solar;

  return (
    <>
      {/* Directional Projectile Trails & Impact Shockwaves */}
      <div
        aria-hidden="true"
        data-testid="combat-vfx-layer"
        className="pointer-events-none absolute inset-0 z-30 overflow-visible"
      >
        <svg className="w-full h-full overflow-visible">
          <defs>
            <filter id="oa-vfx-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <AnimatePresence>
            {projectiles.map((p) => {
              const pathD = `M ${p.x1} ${p.y1} Q ${p.cx} ${p.cy} ${p.x2} ${p.y2}`;
              const isSelfCast =
                Math.hypot(p.x2 - p.x1, p.y2 - p.y1) < 28;
              const strokeWidth = p.isUltimate ? 5.5 : p.isCritical ? 4.5 : 3.2;
              const ringRadius = p.isUltimate ? 48 : p.isCritical ? 42 : 30;

              return (
                <motion.g
                  key={p.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  {/* Curved Energy Trail */}
                  {!isSelfCast && (
                    <>
                      <motion.path
                        d={pathD}
                        fill="none"
                        stroke={p.glowColor}
                        strokeWidth={strokeWidth * 2.4}
                        strokeLinecap="round"
                        filter="url(#oa-vfx-glow)"
                        initial={{ pathLength: 0, opacity: 0.75 }}
                        animate={{
                          pathLength: [0, 1],
                          opacity: [0.85, 0.55, 0],
                        }}
                        transition={{ duration: 0.48, ease: 'easeOut' }}
                      />
                      <motion.path
                        d={pathD}
                        fill="none"
                        stroke={p.color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 1 }}
                        animate={{
                          pathLength: [0, 1],
                          opacity: [1, 0.9, 0],
                        }}
                        transition={{ duration: 0.44, ease: 'easeOut' }}
                      />
                      {/* Launch origin spark */}
                      <motion.circle
                        cx={p.x1}
                        cy={p.y1}
                        r={6}
                        fill={p.color}
                        filter="url(#oa-vfx-glow)"
                        initial={{ scale: 0.4, opacity: 0.9 }}
                        animate={{ scale: 1.8, opacity: 0 }}
                        transition={{ duration: 0.26, ease: 'easeOut' }}
                      />
                    </>
                  )}

                  {/* Target Impact Shockwave Ring */}
                  <motion.circle
                    cx={p.x2}
                    cy={p.y2}
                    r={ringRadius}
                    fill="none"
                    stroke={p.color}
                    strokeWidth={p.isCritical || p.isUltimate ? 3.5 : 2.5}
                    filter="url(#oa-vfx-glow)"
                    initial={{ scale: 0.2, opacity: 0.95 }}
                    animate={{ scale: 1.15, opacity: 0 }}
                    transition={{
                      delay: isSelfCast ? 0 : 0.14,
                      duration: 0.42,
                      ease: 'easeOut',
                    }}
                    style={{ transformOrigin: `${p.x2}px ${p.y2}px` }}
                  />

                  {/* Secondary Gold Resonant / Critical Ring */}
                  {(p.isCritical || p.isUltimate || p.isResonant) && (
                    <motion.circle
                      cx={p.x2}
                      cy={p.y2}
                      r={ringRadius * 1.35}
                      fill="none"
                      stroke="#F5DC8B"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      initial={{ scale: 0.25, opacity: 0.95 }}
                      animate={{ scale: 1.25, opacity: 0 }}
                      transition={{
                        delay: isSelfCast ? 0.05 : 0.18,
                        duration: 0.52,
                        ease: 'easeOut',
                      }}
                      style={{ transformOrigin: `${p.x2}px ${p.y2}px` }}
                    />
                  )}

                  {/* Core Impact Flash */}
                  <motion.circle
                    cx={p.x2}
                    cy={p.y2}
                    r={p.isUltimate ? 16 : 11}
                    fill={p.color}
                    filter="url(#oa-vfx-glow)"
                    initial={{ scale: 0.2, opacity: 0.95 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{
                      delay: isSelfCast ? 0 : 0.14,
                      duration: 0.34,
                      ease: 'easeOut',
                    }}
                    style={{ transformOrigin: `${p.x2}px ${p.y2}px` }}
                  />
                </motion.g>
              );
            })}
          </AnimatePresence>
        </svg>
      </div>

      {/* Full-Banner Dramatic Ultimate Cut-In Trigger */}
      <AnimatePresence>
        {ultimateBanner && (
          <motion.div
            key={ultimateBanner.id}
            data-testid="ultimate-cutin-banner"
            aria-live="assertive"
            initial={{ opacity: 0, scaleY: 0.72 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0.85 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="pointer-events-none fixed inset-x-0 top-1/2 -translate-y-1/2 z-40 px-4"
          >
            <div className="max-w-4xl mx-auto relative overflow-hidden rounded-lg border-y-2 border-[#E5C158] bg-[#0B0E17]/95 shadow-[0_0_60px_rgba(212,175,55,0.38)]">
              {/* Sweeping Elemental Aura Band */}
              <motion.div
                initial={{ x: '-35%', opacity: 0.4 }}
                animate={{ x: '0%', opacity: 1 }}
                transition={{ duration: 0.32, ease: 'easeOut' }}
                className={`absolute inset-0 bg-gradient-to-r ${elemBand.band}`}
              />

              <div className="relative z-10 flex items-center justify-between gap-4 px-5 py-3.5 sm:px-8 sm:py-4">
                <div className="flex items-center gap-4 min-w-0">
                  <motion.div
                    initial={{ x: -24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.24, ease: 'easeOut' }}
                    className={`relative w-16 h-20 sm:w-20 sm:h-24 rounded-md overflow-hidden border-2 shrink-0 shadow-xl ${
                      ultimateBanner.isViewerAlly
                        ? 'border-[#F5DC8B]'
                        : 'border-rose-400'
                    }`}
                  >
                    <Image
                      src={ultimateBanner.artworkUrl}
                      alt={ultimateBanner.actorName}
                      fill
                      sizes="80px"
                      referrerPolicy="no-referrer"
                      className="object-cover object-top"
                    />
                  </motion.div>

                  <motion.div
                    initial={{ x: -16, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                    className="min-w-0 space-y-1"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.22em] text-[#F5DC8B]">
                      <Zap className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {ultimateBanner.isViewerAlly
                          ? 'Allied Ultimate Triggered'
                          : 'Enemy Ultimate Triggered'}
                      </span>
                    </div>
                    <h3 className="font-display text-xl sm:text-3xl font-bold text-[#F5EFE0] tracking-wide truncate">
                      {ultimateBanner.abilityName}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#D8DCE8] truncate">
                      {ultimateBanner.actorName} ·{' '}
                      <span className="text-[#9CA3B8]">
                        {ultimateBanner.actorTitle} ({ultimateBanner.element})
                      </span>
                    </p>
                  </motion.div>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 font-mono text-xs font-semibold text-[#F5DC8B] uppercase tracking-[0.18em] shrink-0">
                  <Sparkles className="w-4 h-4" />
                  <span>OVERDRIVE</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
