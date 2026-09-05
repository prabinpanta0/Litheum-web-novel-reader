import type { LibraryNovel } from '@/types';
import { solveChallenge } from './pow';

/**
 * Cross-device sync client.
 *
 * The app is local-first: library, history and bookmarks live on-device
 * and reading works with no account. Sync is an opt-in enhancement,
 * enabled from the Settings page. When enabled, the user creates/logs in
 * with an account and this client pushes/pulls local state to the Neon
 * backend so the same library follows them across devices.
 *
 * The backend is Neon Functions + Neon Auth. The transport is a small
 * REST API served by a deployed Neon Function; auth tokens come from
 * Neon account sessions. `neon login` / `neon deploy` (interactive,
 * browser-authenticated) must be run once to stand that up; the client
 * below targets that contract and is otherwise self-contained.
 */

export interface SyncState {
  enabled: boolean;
  /** Account email, if logged in. */
  email: string | null;
  /** Session auth token. */
  token: string | null;
}

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'offline' }
  | { kind: 'syncing' }
  | { kind: 'error'; message: string };

export interface SyncPayload {
  library: LibraryNovel[];
  history: unknown[];
  bookmarks: unknown[];
  plugins: { installed: Record<string, unknown>; enabled: string[] };
  updatedAt: number;
}

const BACKEND_BASE = import.meta.env.VITE_SYNC_API ?? 'http://localhost:878';

async function request(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`${BACKEND_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

async function getChallenge(): Promise<{
  challenge: string;
  difficulty: number;
  t: number;
  hmac: string;
}> {
  const res = await request('/auth/challenge');
  if (!res.ok) throw new Error(`Could not start a session (${res.status})`);
  const data = (await res.json()) as {
    challenge: string;
    difficulty: number;
    t: number;
    hmac: string;
  };
  return {
    challenge: data.challenge,
    difficulty: data.difficulty,
    t: data.t,
    hmac: data.hmac,
  };
}

async function authenticate(
  path: string,
  email: string,
  password: string
): Promise<SyncState> {
  const { challenge, difficulty, t, hmac } = await getChallenge();
  const nonce = await solveChallenge(challenge, difficulty);
  const res = await request(path, {
    method: 'POST',
    body: JSON.stringify({ email, password, challenge, nonce, t, hmac }),
  });
  if (!res.ok) throw new Error(`Authentication failed (${res.status})`);
  const data = (await res.json()) as { token: string };
  return { enabled: true, email, token: data.token };
}

export async function register(
  email: string,
  password: string
): Promise<SyncState> {
  return authenticate('/auth/register', email, password);
}

export async function login(
  email: string,
  password: string
): Promise<SyncState> {
  return authenticate('/auth/login', email, password);
}

export async function pushState(
  token: string,
  payload: SyncPayload
): Promise<SyncStatus> {
  try {
    const res = await request('/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Sync failed (${res.status})`);
    return { kind: 'idle' };
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error ? err.message : 'Sync failed.',
    };
  }
}

export async function pullState(token: string): Promise<SyncPayload> {
  const res = await request('/sync', {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Pull failed (${res.status})`);
  return (await res.json()) as SyncPayload;
}

const EMAIL_KEY = 'litheum.sync.email';
const TOKEN_KEY = 'litheum.sync.token';

export function loadSession(): { email: string | null; token: string | null } {
  try {
    return {
      email: localStorage.getItem(EMAIL_KEY),
      token: localStorage.getItem(TOKEN_KEY),
    };
  } catch {
    return { email: null, token: null };
  }
}

export function saveSession(email: string, token: string): void {
  try {
    localStorage.setItem(EMAIL_KEY, email);
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable — ignore */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}
