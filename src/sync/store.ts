import {
  register,
  login,
  pushState,
  pullState,
  loadSession,
  saveSession,
  clearSession,
  type SyncStatus,
  type SyncPayload,
} from './client';

/**
 * Tiny observable session store for cloud sync.
 *
 * Shared by the global `SyncManager` (which runs auto-sync) and the Settings
 * page (which shows controls + status). Kept out of React context because it
 * needs to be reachable from a top-level component and a routed page alike,
 * and driving it via a subscribe/notify loop avoids duplicate auto-push.
 */

type Listener = () => void;

let email: string | null = loadSession().email;
let token: string | null = loadSession().token;
let status: SyncStatus = { kind: 'idle' };
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

function setStatus(next: SyncStatus): void {
  status = next;
  emit();
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function getSession(): { email: string | null; token: string | null } {
  return { email, token };
}

export function subscribeSync(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function signIn(
  emailInput: string,
  password: string
): Promise<void> {
  setStatus({ kind: 'syncing' });
  try {
    const s = await login(emailInput, password);
    email = s.email;
    token = s.token;
    saveSession(email!, token!);
    setStatus({ kind: 'idle' });
  } catch (err) {
    setStatus({
      kind: 'error',
      message: err instanceof Error ? err.message : 'Sign in failed.',
    });
    throw err;
  }
}

export async function signUp(
  emailInput: string,
  password: string
): Promise<void> {
  setStatus({ kind: 'syncing' });
  try {
    const s = await register(emailInput, password);
    email = s.email;
    token = s.token;
    saveSession(email!, token!);
    setStatus({ kind: 'idle' });
  } catch (err) {
    setStatus({
      kind: 'error',
      message: err instanceof Error ? err.message : 'Sign up failed.',
    });
    throw err;
  }
}

export function signOut(): void {
  email = null;
  token = null;
  clearSession();
  setStatus({ kind: 'idle' });
}

/** Manually push the current state up. Returns the resulting status. */
export async function syncNow(state: SyncPayload): Promise<SyncStatus> {
  if (!token) {
    setStatus({ kind: 'idle' });
    return { kind: 'idle' };
  }
  setStatus({ kind: 'syncing' });
  const result = await pushState(token, state);
  setStatus(result);
  return result;
}

/** Pull the server-side state down. Returns `null` when not signed in. */
export async function pullNow(): Promise<SyncPayload | null> {
  if (!token) return null;
  try {
    setStatus({ kind: 'syncing' });
    const state = await pullState(token);
    setStatus({ kind: 'idle' });
    return state;
  } catch (err) {
    setStatus({
      kind: 'error',
      message: err instanceof Error ? err.message : 'Pull failed.',
    });
    return null;
  }
}
