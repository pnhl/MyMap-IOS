import {getApp} from '@react-native-firebase/app';
import {getAuth, onAuthStateChanged, type User as FirebaseUser} from '@react-native-firebase/auth';
import type {Session, User} from '@supabase/supabase-js';
import {env} from '../config/env';

export const firebaseAuth = getAuth();
export const firebaseProjectId = getApp().options.projectId || '';
export const firebaseGoogleWebClientId = env.googleWebClientId || null;
export const firebaseGoogleOAuthConfigured = Boolean(env.googleIosClientId && env.googleWebClientId);

let authReadyPromise: Promise<void> | null = null;

export function waitForFirebaseAuth(): Promise<void> {
  if (!authReadyPromise) {
    authReadyPromise = new Promise(resolve => {
      const unsubscribe = onAuthStateChanged(firebaseAuth, () => {
        unsubscribe();
        resolve();
      });
    });
  }
  return authReadyPromise;
}

export async function getFirebaseIdToken(): Promise<string | null> {
  await waitForFirebaseAuth();
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  // Supabase verifies this native Firebase ID token through Third-party Auth.
  // A claim-less Firebase token runs as `anon`; RLS then validates its exact
  // issuer, audience and subject before granting access to MyMap data.
  const token = await user.getIdToken(false);
  if (firebaseAuth.currentUser?.uid !== user.uid) throw new Error('Tài khoản đã thay đổi.');
  return token;
}

export async function getFirebaseIdTokenForUser(owner: string): Promise<string> {
  await waitForFirebaseAuth();
  const user = firebaseAuth.currentUser;
  if (!user || user.uid !== owner) throw new Error('Tài khoản đã thay đổi.');
  const token = await user.getIdToken(false);
  if (firebaseAuth.currentUser?.uid !== owner) throw new Error('Tài khoản đã thay đổi.');
  return token;
}

export function firebaseUserAsAppUser(user: FirebaseUser): User {
  const providers = user.providerData.map(item => item.providerId).filter(Boolean);
  const createdAt = user.metadata.creationTime ?? new Date().toISOString();
  const updatedAt = user.metadata.lastSignInTime ?? createdAt;
  return {
    id: user.uid,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email ?? undefined,
    phone: user.phoneNumber ?? undefined,
    email_confirmed_at: user.emailVerified ? updatedAt : undefined,
    app_metadata: {
      provider: providers[0] ?? (user.isAnonymous ? 'anonymous' : 'firebase'),
      providers,
      firebase_project_id: firebaseProjectId,
    },
    user_metadata: {
      name: user.displayName,
      full_name: user.displayName,
      avatar_url: user.photoURL,
      is_anonymous: user.isAnonymous,
    },
    identities: [],
    created_at: createdAt,
    updated_at: updatedAt,
    is_anonymous: user.isAnonymous,
  } as User;
}

export async function firebaseSession(forceRefresh = false): Promise<Session | null> {
  await waitForFirebaseAuth();
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  const tokenResult = await user.getIdTokenResult(forceRefresh);
  if (firebaseAuth.currentUser?.uid !== user.uid) throw new Error('Tài khoản đã thay đổi.');
  const expiresAt = Math.floor(new Date(tokenResult.expirationTime).getTime() / 1000);
  return {
    access_token: tokenResult.token,
    refresh_token: 'firebase-native-managed',
    token_type: 'bearer',
    expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    expires_at: expiresAt,
    user: firebaseUserAsAppUser(user),
  };
}
