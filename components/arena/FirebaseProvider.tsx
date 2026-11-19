'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  auth,
  googleProvider,
  testFirestoreConnection,
} from '@/lib/firebase/client';
import {
  ensurePlayerWallet,
  subscribePlayerWallet,
} from '@/lib/firebase/economy-repository';
import {
  ensurePlayerProfile,
  subscribePlayerProfile,
} from '@/lib/firebase/repository';
import { subscribeMyClanMembership } from '@/lib/firebase/social-repository';
import { PlayerWalletDoc } from '@/lib/game/economy';
import { PlayerProfileDoc } from '@/lib/game/multiplayer';
import { ClanMembershipDoc } from '@/lib/game/social';
import { persistence } from '@/lib/persistence/adapter';

interface FirebaseContextValue {
  user: User | null;
  profile: PlayerProfileDoc | null;
  wallet: PlayerWalletDoc | null;
  clanMembership: ClanMembershipDoc | null;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PlayerProfileDoc | null>(null);
  const [wallet, setWallet] = useState<PlayerWalletDoc | null>(null);
  const [clanMembership, setClanMembership] =
    useState<ClanMembershipDoc | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    void testFirestoreConnection();

    let unsubProfile: (() => void) | null = null;
    let unsubWallet: (() => void) | null = null;
    let unsubClan: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      if (unsubWallet) {
        unsubWallet();
        unsubWallet = null;
      }
      if (unsubClan) {
        unsubClan();
        unsubClan = null;
      }

      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        setWallet(null);
        setClanMembership(null);
        setAuthReady(true);
        return;
      }

      try {
        const localSquad = persistence.getPlayerSquadIds();
        const customCount = persistence.getCustomCharacters().length;
        const ensured = await ensurePlayerProfile(
          nextUser,
          localSquad,
          customCount
        );
        setProfile(ensured);

        try {
          const ensuredWallet = await ensurePlayerWallet(nextUser.uid);
          setWallet(ensuredWallet);
        } catch (walletErr) {
          console.error('Wallet bootstrap warning:', walletErr);
        }

        unsubProfile = subscribePlayerProfile(
          nextUser.uid,
          (liveProfile) => {
            if (liveProfile) setProfile(liveProfile);
          },
          (err) => {
            console.error('Live profile sync warning:', err);
          }
        );

        unsubWallet = subscribePlayerWallet(
          nextUser.uid,
          (liveWallet) => {
            if (liveWallet) setWallet(liveWallet);
          },
          (err) => {
            console.error('Live wallet sync warning:', err);
          }
        );

        unsubClan = subscribeMyClanMembership(
          nextUser.uid,
          (liveMembership) => {
            setClanMembership(liveMembership);
          },
          (err) => {
            console.error('Live clan membership sync warning:', err);
          }
        );
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to initialize your cloud profile.';
        setAuthError(
          msg.includes('permission') || msg.includes('PERMISSION_DENIED')
            ? 'Cloud profile verification failed. Please ensure your Google account email is verified.'
            : 'Could not sync your cloud profile right now. Local play remains available.'
        );
      } finally {
        setAuthReady(true);
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
      if (unsubWallet) unsubWallet();
      if (unsubClan) unsubClan();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError(null);
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'Your browser blocked the Google Sign-In popup. Allow popups for this preview and try again.'
        );
      } else {
        setAuthError('Google Sign-In did not complete. Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    try {
      await signOut(auth);
      setProfile(null);
      setWallet(null);
      setClanMembership(null);
    } catch {
      setAuthError('Could not sign out cleanly. Please retry.');
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo<FirebaseContextValue>(
    () => ({
      user,
      profile,
      wallet,
      clanMembership,
      authReady,
      signingIn,
      authError,
      clearAuthError,
      signInWithGoogle,
      signOutUser,
    }),
    [
      user,
      profile,
      wallet,
      clanMembership,
      authReady,
      signingIn,
      authError,
      clearAuthError,
      signInWithGoogle,
      signOutUser,
    ]
  );

  return (
    <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>
  );
}

export function useFirebaseAuth(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebaseAuth must be used inside FirebaseProvider.');
  }
  return ctx;
}
