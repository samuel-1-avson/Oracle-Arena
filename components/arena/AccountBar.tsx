'use client';

import React from 'react';
import { Cloud, Gem, Loader2, LogIn, LogOut, Trophy } from 'lucide-react';
import { useFirebaseAuth } from './FirebaseProvider';

interface AccountBarProps {
  compact?: boolean;
  syncingCloud?: boolean;
}

export function AccountBar({
  compact = false,
  syncingCloud = false,
}: AccountBarProps) {
  const {
    user,
    profile,
    wallet,
    clanMembership,
    authReady,
    signingIn,
    signInWithGoogle,
    signOutUser,
  } = useFirebaseAuth();

  if (!authReady) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#121622]/90 border border-white/10 text-xs text-[#8F96AB]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Checking account...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        disabled={signingIn}
        onClick={() => void signInWithGoogle()}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-[#141927]/95 border border-[#D4AF37]/45 text-[#F5EFE0] text-xs sm:text-sm font-medium hover:bg-[#1D2438] hover:border-[#D4AF37]/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
      >
        {signingIn ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" />
        ) : (
          <LogIn className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
        )}
        <span>Sign in with Google</span>
      </button>
    );
  }

  const displayName =
    profile?.displayName ||
    user.displayName ||
    user.email?.split('@')[0] ||
    'Tactician';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-md bg-[#121622]/95 border border-[#D4AF37]/35 text-xs shrink-0">
      <div className="w-6 h-6 rounded bg-[#221D12] border border-[#D4AF37]/60 flex items-center justify-center font-display text-[11px] font-bold text-[#F5DC8B] shrink-0">
        {initials}
      </div>

      <div className="flex items-center gap-2 min-w-0">
        {clanMembership && (
          <span
            title={`Clan: ${clanMembership.clanName} (${clanMembership.role})`}
            className="font-mono text-[11px] font-bold text-[#F5DC8B] bg-[#D4AF37]/15 border border-[#D4AF37]/40 px-1.5 py-0.5 rounded shrink-0"
          >
            [{clanMembership.clanTag}]
          </span>
        )}
        <span className="font-semibold text-[#F5EFE0] truncate max-w-[120px]">
          {displayName}
        </span>
        {wallet && (
          <>
            <span className="text-white/20" aria-hidden="true">
              ·
            </span>
            <span
              title="Oracle Shards balance for Marketplace & Trading Hub"
              className="inline-flex items-center gap-1 font-mono tabular-nums text-violet-300"
            >
              <Gem className="w-3 h-3 shrink-0" />
              {wallet.shards.toLocaleString()}
            </span>
          </>
        )}
        {!compact && profile && (
          <>
            <span className="text-white/20" aria-hidden="true">
              ·
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#F5DC8B]">
              <Trophy className="w-3 h-3 shrink-0" />
              {profile.rating}
            </span>
          </>
        )}
        {!compact && (
          <span
            title="Collection & progression synced with Cloud Firestore"
            className="hidden md:inline-flex items-center gap-1 text-[11px] text-emerald-300 font-mono"
          >
            <Cloud className="w-3 h-3 shrink-0" />
            <span>{syncingCloud ? 'Syncing' : 'Cloud'}</span>
          </span>
        )}
      </div>

      <button
        type="button"
        aria-label="Sign out"
        onClick={() => void signOutUser()}
        className="p-1 rounded text-[#9CA3B8] hover:text-rose-300 hover:bg-white/5 transition-colors cursor-pointer shrink-0"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
