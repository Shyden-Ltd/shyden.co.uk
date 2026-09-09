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
