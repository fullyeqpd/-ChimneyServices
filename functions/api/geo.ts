/**
 * /api/geo — the coarse network guess at which state a reader is in.
 *
 * Cloudflare attaches a country and region to every request before it reaches
 * this code. This endpoint hands back three fields of that and nothing else, so
 * the home page can pre-select a state in "Start with your state".
 *
 * The guess is never acted on by itself. The page pre-selects, labels the guess
 * as a guess, and waits for a click: a wrong guess that redirected by itself
 * would strand a reader on another state's law and make them work out why.
 *
 * The reader's IP address is never read, echoed, hashed or stored here, and
 * nothing about the request is logged. Same-origin only, and never cached.
 */

interface Env {
  [key: string]: unknown;
}

const NO_STORE = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
};

/**
 * Same-origin only. A request with no Origin header (curl, a health check) is
 * allowed; a request from another origin is refused, and no
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

/** Two upper-case letters or nothing: anything else is not a country or state code. */
const code = (v: unknown): string | null => (typeof v === 'string' && /^[A-Z]{2}$/.test(v) ? v : null);
const label = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null);

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  if (!sameOrigin(request)) {
    return new Response(JSON.stringify({ error: 'cross-origin requests are not accepted' }), {
      status: 403,
      headers: NO_STORE,
    });
  }

  const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {};
  const country = code(cf.country);
  const isUs = country === 'US';
  // regionCode is a 2-letter state code inside the US (including DC) and
  // something else entirely elsewhere, so outside the US we return neither.
  const regionCode = isUs ? code(cf.regionCode) : null;
  const region = isUs ? label(cf.region) : null;

  return new Response(JSON.stringify({ country, regionCode, region }), { headers: NO_STORE });
};

/** Anything but GET — including a cross-origin preflight — is refused outright. */
export const onRequest: PagesFunction<Env> = async ({ request, next }) => {
  if (request.method.toUpperCase() === 'GET') return next();
  return new Response('Method not allowed', {
    status: 405,
    headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
  });
};
