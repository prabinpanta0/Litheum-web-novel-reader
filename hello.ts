/**
 * Litheum sync backend — a Neon Function.
 *
 * Targets the contract in `src/sync/client.ts`:
 *
 *   POST /auth/register {email,password} -> {token}
 *   POST /auth/login    {email,password} -> {token}
 *   GET  /sync          (Bearer token)   -> SyncPayload
 *   POST /sync          (Bearer token)   (body SyncPayload)
 *
 * Passwords are hashed with salted SHA-256 (the storage crate lacks bcrypt).
 * Tokens are HMAC-signed with an `AUTH_SECRET` env var.
 *
 * Setup (run once from the repo root, requires your browser for login):
 *   npm i -g neon@latest && neon login
 *   neon skills -y && neon config init
 *   neon link --project-id royal-bird-90217763 --branch production -y
 *   neon deploy
 *
 * The scope table (`litheum_state`) stores one row per user id.
 */
import { neon } from '@neondatabase/serverless';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const sql = neon(process.env.DATABASE_URL!);
const SECRET = process.env.AUTH_SECRET ?? 'change-me-in-neon';

function hashPassword(password: string, salt: string): string {
  return createHmac('sha256', salt).update(password).digest('hex');
}

function makeSalt(): string {
  return createHmac('sha256', String(Math.random() + Date.now()))
    .update('litheum')
    .digest('hex')
    .slice(0, 16);
}

function signToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token: string): Record<string, unknown> | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', SECRET)
    .update(body)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function json(data: unknown, status = 200): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
  return new Response(JSON.stringify(data), { status, headers });
}

// The browser client runs on a different origin (e.g. localhost:5173), so the
// Neon Function must answer CORS preflights for the auth/sync requests.
function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-max-age': '86400',
    },
  });
}

// --- Proof-of-work CAPTCHA -------------------------------------------------
// A stateless, self-hosted challenge: the client must find a nonce such that
// sha256(challenge + ":" + nonce) starts with `difficulty` zero hex nibbles.

const POW_DIFFICULTY = 4;
const POW_WINDOW_MS = 5 * 60 * 1000;

function issueChallenge(): {
  challenge: string;
  difficulty: number;
  t: number;
  hmac: string;
} {
  const t = Date.now();
  const challenge = createHmac('sha256', SECRET)
    .update(`${t}:${Math.random()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 32);
  const hmac = createHmac('sha256', SECRET)
    .update(`challenge:${challenge}:${t}`)
    .digest('hex');
  return { challenge, difficulty: POW_DIFFICULTY, t, hmac };
}

function verifyChallenge(challenge: string, t: number, hmac: string): boolean {
  if (typeof challenge !== 'string' || challenge.length !== 32) return false;
  const expected = createHmac('sha256', SECRET)
    .update(`challenge:${challenge}:${t}`)
    .digest('hex');
  const a = Buffer.from(String(hmac));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const age = Date.now() - Number(t);
  return age >= 0 && age <= POW_WINDOW_MS;
}

function checkProof(
  challenge: string,
  nonce: number,
  difficulty: number
): boolean {
  if (!Number.isInteger(nonce) || nonce < 0) return false;
  if (difficulty < 1 || difficulty > 32) return false;
  const hash = createHash('sha256')
    .update(`${challenge}:${nonce}`)
    .digest('hex');
  for (let i = 0; i < difficulty; i++) {
    if (hash[i] !== '0') return false;
  }
  return true;
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const path = url.pathname;

  if (method === 'OPTIONS') return corsPreflight();

  // Issue a proof-of-work challenge for the next register/login attempt.
  if (method === 'GET' && path === '/auth/challenge') {
    return json(issueChallenge());
  }

  // Register
  if (method === 'POST' && path === '/auth/register') {
    const { email, password, challenge, nonce, t, hmac } = await readBody(req);
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      password.length < 8
    ) {
      return json(
        { error: 'Email required and password must be 8+ characters.' },
        400
      );
    }
    if (
      !verifyChallenge(challenge as string, Number(t), hmac as string) ||
      !checkProof(challenge as string, Number(nonce), POW_DIFFICULTY)
    ) {
      return json(
        { error: 'Proof-of-work failed. Refresh and try again.' },
        400
      );
    }
    const existing =
      await sql`select id from users where email = ${email.toLowerCase()}`;
    if (existing.length > 0)
      return json({ error: 'Account already exists.' }, 409);
    const salt = makeSalt();
    const pw = hashPassword(password, salt);
    const id = createHash('sha256')
      .update(email.toLowerCase() + Date.now())
      .digest('hex')
      .slice(0, 24);
    await sql`insert into users (id, email, salt, password_hash) values (${id}, ${email.toLowerCase()}, ${salt}, ${pw})`;
    await sql`insert into litheum_state (user_id, data, updated_at) values (${id}, '{}', now())`;
    return json({ token: signToken({ sub: id }) });
  }

  // Login
  if (method === 'POST' && path === '/auth/login') {
    const { email, password, challenge, nonce, t, hmac } = await readBody(req);
    if (typeof email !== 'string' || typeof password !== 'string') {
      return json({ error: 'Email and password required.' }, 400);
    }
    if (
      !verifyChallenge(challenge as string, Number(t), hmac as string) ||
      !checkProof(challenge as string, Number(nonce), POW_DIFFICULTY)
    ) {
      return json(
        { error: 'Proof-of-work failed. Refresh and try again.' },
        400
      );
    }
    const rows =
      await sql`select id, salt, password_hash from users where email = ${email.toLowerCase()}`;
    if (rows.length === 0) return json({ error: 'No such account.' }, 404);
    const user = rows[0] as { id: string; salt: string; password_hash: string };
    const candidate = hashPassword(password, user.salt);
    if (candidate !== user.password_hash)
      return json({ error: 'Incorrect password.' }, 401);
    return json({ token: signToken({ sub: user.id }) });
  }

  // Authenticate the sync endpoints.
  if (path === '/sync') {
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '');
    const payload = verifyToken(token);
    if (!payload || typeof payload.sub !== 'string') {
      return json({ error: 'Unauthorized.' }, 401);
    }

    if (method === 'GET') {
      const rows =
        await sql`select data from litheum_state where user_id = ${payload.sub}`;
      if (rows.length === 0) return json({ error: 'Nothing synced yet.' }, 404);
      return json(JSON.parse((rows[0] as { data: string }).data));
    }

    if (method === 'POST') {
      const body = await req.json();
      await sql`insert into litheum_state (user_id, data, updated_at)
                values (${payload.sub}, ${JSON.stringify(body)}, now())
                on conflict (user_id) do update
                set data = excluded.data, updated_at = now()`;
      return json({ ok: true });
    }
  }

  return json({ error: 'Not found.' }, 404);
}
