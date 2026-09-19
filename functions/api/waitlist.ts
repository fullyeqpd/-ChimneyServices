/**
 * /api/waitlist — the two waiting lists' only server.
 *
 * Cloudflare Pages picks this file up automatically: `functions/api/waitlist.ts`
 * answers `/api/waitlist`. Nothing is built into `dist/`.
 *
 * POST  JSON  → validate, rate-limit, write one KV entry.
 * GET   ?key= → CSV of every entry, when ADMIN_KEY is set and matches.
 *
 * Storage is a KV namespace bound as `WAITLIST`. Until that binding exists the
 * endpoint answers 503 with a plain reason, and the page tells the reader to
 * email a human instead. No third party sees any of this, and nothing about
 * being on a list is for sale.
 */

interface Env {
  /** KV namespace holding the entries. Undefined until bound in the dashboard. */
  WAITLIST?: KVNamespace;
  /** When set, GET /api/waitlist?key=<this> returns the CSV export. */
  ADMIN_KEY?: string;
  /** Salt for the stored IP hash. Falls back to a constant when unset. */
  WAITLIST_SALT?: string;
}

type ListType = 'company' | 'professional';

const MAX_BODY_BYTES = 8 * 1024;
const MIN_FILL_MS = 3000;
/** A stamp older than this is stale — a tab left open for a day, or a replay. */
const MAX_FILL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT = 5;
const RATE_WINDOW_S = 60;
const KEY_PREFIX = 'waitlist:';

/** Deliberately loose: the point is to catch typos, not to police addresses. */
const EMAIL_RE = /^[^\s@,;:<>()[\]\\]+@[^\s@.,;:<>()[\]\\]+(\.[^\s@.,;:<>()[\]\\]+)+$/;

const REQUIRED: Record<ListType, string[]> = {
  company: ['company', 'contact', 'email', 'state', 'city'],
  // Cards are not open yet, so nothing is posted anywhere and no address is
  // asked for. A name, an address to write to, and the state they work in.
  professional: ['name', 'email', 'state'],
};

/**
 * Every field either list may store, in the order the CSV prints them. The
 * address, attestation and card columns belong to the short-lived order form
 * and are no longer written; they stay here so entries made while that form was
 * up still export with their values in the right columns.
 */
const FIELDS = [
  'type',
  'ts',
  'company',
  'contact',
  'name',
  'email',
  'phone',
  'employer',
  'addressStreet',
  'addressCity',
  'state',
  'addressZip',
  'city',
  'website',
  'credentials',
  'certNumbers',
  'certAttest',
  'wantsCard',
  'ip',
  'ua',
] as const;

const NO_STORE = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...NO_STORE, ...extra } });

const notFound = () =>
  new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/**
 * Same-origin only. A request with no Origin header (a normal form post, curl,
 * a health check) is allowed; a request from another origin is refused, and no
 * Access-Control-Allow-Origin header is ever sent to one.
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function hashIp(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Light per-IP limiter: one counter key per IP, expiring after the window. */
async function overRateLimit(kv: KVNamespace, ipHash: string): Promise<boolean> {
  const key = `rate:${ipHash}`;
  const seen = Number((await kv.get(key)) ?? '0');
  if (seen >= RATE_LIMIT) return true;
  await kv.put(key, String(seen + 1), { expirationTtl: RATE_WINDOW_S });
  return false;
}

const csvCell = (v: unknown): string => {
  const s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!sameOrigin(request)) return json({ ok: false, error: 'cross-origin requests are not accepted' }, 403);
  if (!env.WAITLIST) return json({ ok: false, error: 'storage not configured' }, 503);

  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MAX_BODY_BYTES) return json({ ok: false, error: 'that is too much text' }, 413);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'that is too much text' }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'the form could not be read' }, 400);
  }

  const type = str(body.type, 20) as ListType;
  if (type !== 'company' && type !== 'professional') return json({ ok: false, error: 'unknown list' }, 400);

  // Honeypot: a field no person can see, so anything in it came from a script.
  if (str(body.website2, 200) !== '') return json({ ok: false, error: 'rejected' }, 400);

  const stamp = Number(body.t);
  const age = Number.isFinite(stamp) ? Date.now() - stamp : NaN;
  if (!Number.isFinite(age) || age < MIN_FILL_MS || age > MAX_FILL_MS) {
    return json({ ok: false, error: 'that was sent too quickly — try again' }, 400);
  }

  const email = str(body.email, 160);
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'that email address does not look right' }, 400);
  for (const field of REQUIRED[type]) {
    if (!str(body[field], 200)) return json({ ok: false, error: `${field} is required` }, 400);
  }

  const credentials = Array.isArray(body.credentials)
    ? body.credentials.map((c) => str(c, 60)).filter(Boolean).slice(0, 20)
    : str(body.credentials, 400)
      ? [str(body.credentials, 400)]
      : [];
  if (type === 'professional' && credentials.length === 0) {
    return json({ ok: false, error: 'choose at least one certification' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const ipHash = await hashIp(ip, env.WAITLIST_SALT ?? 'cs');
  if (await overRateLimit(env.WAITLIST, ipHash)) {
    return json({ ok: false, error: 'too many sends from here in the last minute' }, 429);
  }

  const ts = new Date().toISOString();
  const entry = {
    type,
    ts,
    company: str(body.company, 120),
    contact: str(body.contact, 120),
    name: str(body.name, 120),
    email,
    phone: str(body.phone, 40),
    employer: str(body.employer, 120),
    state: str(body.state, 40),
    city: str(body.city, 80),
    website: str(body.website, 200),
    credentials,
    certNumbers: str(body.certNumbers, 200),
    // No payment is taken here and none is taken anywhere on this site: the
    // list is a list. An address, an attestation and a card flag may still
    // arrive from a cached page; they are read and dropped.
    ip: ipHash,
    ua: str(request.headers.get('User-Agent'), 300),
  };

  await env.WAITLIST.put(`${KEY_PREFIX}${type}:${ts}:${crypto.randomUUID()}`, JSON.stringify(entry));
  return json({ ok: true });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!sameOrigin(request)) return notFound();
  const key = new URL(request.url).searchParams.get('key');
  // No admin key configured, or the wrong one: this endpoint does not exist.
  if (!env.ADMIN_KEY || !key || key !== env.ADMIN_KEY) return notFound();
  if (!env.WAITLIST) return json({ ok: false, error: 'storage not configured' }, 503);

  const rows: string[] = [FIELDS.join(',')];
  let cursor: string | undefined;
  do {
    const page = await env.WAITLIST.list({ prefix: KEY_PREFIX, cursor });
    for (const k of page.keys) {
      const value = await env.WAITLIST.get(k.name);
      if (!value) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(value) as Record<string, unknown>;
      } catch {
        continue;
      }
      rows.push(FIELDS.map((f) => csvCell(entry[f])).join(','));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return new Response(`${rows.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="chimney-services-waitlist.csv"',
      'Cache-Control': 'no-store',
    },
  });
};

/** Anything else — including a cross-origin preflight — is refused outright. */
export const onRequest: PagesFunction<Env> = async ({ request, next }) => {
  const method = request.method.toUpperCase();
  if (method === 'POST' || method === 'GET') return next();
  return new Response('Method not allowed', {
    status: 405,
    headers: { Allow: 'GET, POST', 'Cache-Control': 'no-store' },
  });
};
