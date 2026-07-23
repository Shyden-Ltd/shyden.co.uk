/**
 * Pure helpers for the Cloudflare Pages middleware that locks down every
 * NON-prod hostname of the shyden.co.uk static site. Extracted from
 * `functions/_middleware.js` so the logic is unit-testable from Vitest
 * without spinning up workerd / miniflare.
 *
 * Used by:
 *   - `functions/_middleware.js` (Cloudflare Pages, edge runtime)
 *   - `tests/unit/lockdown.test.ts` (Vitest)
 *
 * Location convention: `functions/` MUST sit at the project ROOT, NOT
 * inside the deploy directory (`dist/`). `wrangler pages deploy dist`
 * scans `<repo>/functions/` for routes; a `dist/functions/` is silently
 * ignored. See https://developers.cloudflare.com/pages/functions/get-started/
 *
 * Adapted from ShyTalk's `functions/_lib/lockdown.js` — same behaviour,
 * only the hostname/strings differ, and the API-surface helpers are
 * dropped (this is a static site with no API).
 */

// Single canonical production hostname. One Functions codebase serves
// both the (future) prod Pages project and the dev project; the gate
// keys off hostname, so prod passes through and dev is locked.
export const PROD_HOSTNAME = 'shyden.co.uk';

/**
 * True iff the request is reaching the canonical production hostname.
 * Case-insensitive (DNS is), EXACT equality — not prefix / contains — so
 * a near-miss like `dev.shyden.co.uk` or a hostile
 * `shyden.co.uk.evil.com` cannot trip the prod (pass-through) gate.
 */
export function isProdHostname(hostname) {
  if (typeof hostname !== 'string' || hostname.length === 0) return false;
  return hostname.toLowerCase() === PROD_HOSTNAME;
}

/** Inverse convenience — any non-prod host (dev, Pages preview, localhost). */
export function shouldServeBlockingRobots(hostname) {
  return !isProdHostname(hostname);
}

/**
 * Body of the dev `robots.txt`. Single literal so the format doesn't
 * drift between the served response and the test.
 */
export function blockingRobotsBody() {
  return [
    '# Non-prod shyden.co.uk environment — blocked from indexing.',
    '# See functions/_middleware.js / functions/_lib/lockdown.js.',
    '# The public robots.txt is served only on shyden.co.uk.',
    'User-agent: *',
    'Disallow: /',
    '',
  ].join('\n');
}

/**
 * X-Robots-Tag value injected on every non-prod response. `noindex`
 * removes from results, `nofollow` stops crawling into other dev pages,
 * `noarchive` blocks the cached copy.
 */
export function noIndexHeaderValue() {
  return 'noindex, nofollow, noarchive';
}

/**
 * Validates a Basic-auth `Authorization` header against the shared
 * password. Username half is ignored (single shared secret).
 *
 * FAILS CLOSED: a missing header or empty/null `expectedPassword` always
 * returns false — a misconfigured deploy (DEV_PASSWORD unset) stays
 * locked, never wide open.
 */
export function basicAuthOk(authorizationHeader, expectedPassword) {
  if (!expectedPassword) return false;
  if (typeof authorizationHeader !== 'string') return false;
  if (!authorizationHeader.startsWith('Basic ')) return false;
  const encoded = authorizationHeader.slice('Basic '.length).trim();
  if (encoded.length === 0) return false;
  let decoded;
  try {
    // atob at the Cloudflare edge + modern Node; Buffer fallback keeps
    // Vitest happy without a polyfill.
    decoded =
      typeof atob === 'function'
        ? atob(encoded)
        : Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    return false;
  }
  const colon = decoded.indexOf(':');
  if (colon < 0) return false;
  // Only the password (everything after the FIRST colon) matters, so a
  // password containing ':' is compared intact. Constant-time compare
  // isn't available in the Workers std lib; the risk surface (one shared
  // dev password) doesn't warrant the complexity.
  const password = decoded.slice(colon + 1);
  return password === expectedPassword;
}

/**
 * The 401 challenge shown to a non-prod request without valid creds.
 * The `WWW-Authenticate` header makes browsers show their native prompt.
 * Carries `X-Robots-Tag: noindex` so even the challenge page can't be
 * indexed.
 */
export function basicAuthChallenge() {
  const body =
    'This is a non-prod shyden.co.uk environment, restricted to authorised ' +
    'testers. If you arrived here by mistake, visit https://shyden.co.uk for ' +
    'the public site.';
  return new Response(body, {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="shyden.co.uk Non-Prod"',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': noIndexHeaderValue(),
    },
  });
}
