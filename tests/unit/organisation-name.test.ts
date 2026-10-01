import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Shyden Ltd is dissolved (#370), and the organisation behind the site is
 * Shyden Labs (operator, 2026-10-01, #413). The site's own brand stays
 * "Shyden"; these are the two files that name the organisation itself.
 */
const LICENSE = readFileSync('LICENSE', 'utf8');
const README = readFileSync('README.md', 'utf8');

describe('the organisation is named Shyden Labs (#413)', () => {
  it("LICENSE's copyright line names Shyden Labs, once", () => {
    const lines = LICENSE.split('\n').map((line) => line.trim());
    expect(lines.filter((line) => line.startsWith('Copyright '))).toEqual([
      'Copyright 2026 Shyden Labs',
    ]);
  });

  it('README introduces the site as Shyden Labs', () => {
    expect(README.split('\n')[2]).toBe(
      'The **Shyden Labs** website, plus two free tools it hosts.',
    );
  });

  it.each([
    ['LICENSE', LICENSE],
    ['README.md', README],
  ])('%s no longer names the dissolved company', (_name, text) => {
    expect(text).toContain('Shyden');
    expect(text).not.toMatch(/Shyden\s+Ltd/i);
  });
});
