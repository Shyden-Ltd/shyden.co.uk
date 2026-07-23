import { describe, it, expect } from 'vitest';
import {
  isProdHostname,
  shouldServeBlockingRobots,
  blockingRobotsBody,
  noIndexHeaderValue,
  basicAuthOk,
  basicAuthChallenge,
} from '../../functions/_lib/lockdown.js';

// Base64 a "user:password" credential the way a browser's Basic-auth
// header does — Node's Buffer here, atob/btoa at the Cloudflare edge.
const cred = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

describe('isProdHostname — exact, case-insensitive, fail-safe', () => {
  it.each(['shyden.co.uk', 'SHYDEN.CO.UK', 'Shyden.Co.Uk'])(
    'accepts the prod apex %j (DNS is case-insensitive)',
    (h) => expect(isProdHostname(h)).toBe(true),
  );
  it.each([
    'dev.shyden.co.uk', // the dev subdomain — must be treated as non-prod
    'shyden-site-dev.pages.dev', // the Pages preview host
    'www.shyden.co.uk', // www is NOT the prod apex (update here if that changes)
    'shyden.co.uk.evil.com', // near-miss suffix attack must not trip the gate
    'notshyden.co.uk',
    '',
  ])('rejects non-prod / near-miss host %j', (h) =>
    expect(isProdHostname(h)).toBe(false),
  );
  it.each([null, undefined, 42, {}])(
    'rejects non-string input %p (no throw)',
    (h) => expect(isProdHostname(h as unknown as string)).toBe(false),
  );
});

describe('shouldServeBlockingRobots', () => {
  it('is false on prod, true everywhere else', () => {
    expect(shouldServeBlockingRobots('shyden.co.uk')).toBe(false);
    expect(shouldServeBlockingRobots('dev.shyden.co.uk')).toBe(true);
  });
});

describe('blockingRobotsBody', () => {
  it('disallows all crawling', () => {
    const body = blockingRobotsBody();
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Disallow: /');
  });
});

describe('noIndexHeaderValue', () => {
  it('is the full noindex directive', () => {
    expect(noIndexHeaderValue()).toBe('noindex, nofollow, noarchive');
  });
});

describe('basicAuthOk — FAILS CLOSED', () => {
  it.each([
    ['', 'empty password (env var unset) must never open the gate'],
    [undefined, 'undefined password fails closed'],
    [null, 'null password fails closed'],
  ])('rejects when expectedPassword is %j — %s', (pw) =>
    expect(basicAuthOk(cred('u', 'anything'), pw as unknown as string)).toBe(
      false,
    ),
  );
  it.each([
    [null, 'null header'],
    [undefined, 'undefined header'],
    ['', 'empty header'],
    ['Bearer abc', 'wrong scheme'],
    ['Basic ', 'empty credential'],
    ['Basic ' + Buffer.from('nocolon').toString('base64'), 'no colon'],
  ])('rejects %s', (header) =>
    expect(basicAuthOk(header as unknown as string, 'secret')).toBe(false),
  );
  it('rejects a wrong password', () => {
    expect(basicAuthOk(cred('user', 'wrong'), 'secret')).toBe(false);
  });
  it('accepts the correct password', () => {
    expect(basicAuthOk(cred('user', 'secret'), 'secret')).toBe(true);
  });
  it('ignores the username half (any user, empty user)', () => {
    expect(basicAuthOk(cred('anyone', 'secret'), 'secret')).toBe(true);
    expect(basicAuthOk(cred('', 'secret'), 'secret')).toBe(true);
  });
  it('accepts a password that itself contains a colon', () => {
    expect(basicAuthOk(cred('user', 'a:b:c'), 'a:b:c')).toBe(true);
  });
});

describe('basicAuthChallenge', () => {
  it('is a 401 that prompts the browser and stays unindexed', () => {
    const res = basicAuthChallenge();
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toMatch(/^Basic realm=/);
    expect(res.headers.get('X-Robots-Tag')).toBe(noIndexHeaderValue());
  });
});
