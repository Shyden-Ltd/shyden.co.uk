import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageNames, sitePaths } from '../site-pages';

describe('the site page list is derived from src/pages', () => {
  it('reads real pages off disk', () => {
    // Anti-vacuity: an empty derivation would satisfy every assertion below.
    expect(pageNames().length).toBeGreaterThan(2);
    expect(pageNames()).toContain('index');
  });

  it('excludes 404, which has no per-locale twin', () => {
    expect(pageNames()).not.toContain('404');
  });

  it('serves index at the site root, every other page at its own name', () => {
    expect(sitePaths()).toContain('/');
    expect(sitePaths()).toContain('/glory-points');
    expect(sitePaths()).toHaveLength(pageNames().length);
  });
});

describe('the page list refuses to answer blind (#84)', () => {
  it('throws when the pages directory holds no page', () => {
    // A real empty directory, not a mock: `locale-routing.test.ts` loops this
    // list five times and `thai-typography.spec.ts` builds its routes from it,
    // and all six tests passed green while it was empty.
    const empty = mkdtempSync(join(tmpdir(), 'shyden-pages-'));
    expect(() => pageNames(empty)).toThrow(/broken/);
  });
});
