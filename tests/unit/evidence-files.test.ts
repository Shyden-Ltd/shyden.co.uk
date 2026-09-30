import { describe, expect, it } from 'vitest';
import { captureFile, slug } from '../../scripts/evidence-files.mjs';

/**
 * Where a capture is written. Both capture legs (`tests/e2e/evidence.ts` and
 * `tests/device/ios/evidence.ts`) name their files through `captureFile`.
 *
 * The name used to be `slug(title)__NN-slug(label)` in each project's
 * folder, and `slug` keeps 80 characters of a whole title path and drops case
 * and punctuation. On the #390 listing, 650 of 4,109 tests shared a slug with
 * another test in the same project. Two such tests shooting the same order and
 * label write one file, and the evidence page then shows one test's picture
 * under the other's name. The page is what a release is signed off from.
 */

/** Two tests from `classroom-groups-print.spec.ts`, one slug between them. */
const PRINT =
  'classroom-groups-print.spec.ts > the printed register after an edit > ' +
  'every cell prints its own column after ';
const A = `${PRINT}a text edit alone`;
const B = `${PRINT}a select edit alone`;

const capture = (
  title: string,
  over: Partial<Parameters<typeof captureFile>[0]> = {},
) =>
  captureFile({
    project: 'chromium',
    title,
    order: 1,
    label: 'the printed register',
    ext: 'jpg',
    ...over,
  });

describe('captureFile: one file per capture', () => {
  it('gives two tests whose slugs agree two files', () => {
    // The precondition, or the assertion below proves nothing.
    expect(slug(A)).toBe(slug(B));
    expect(capture(A)).not.toBe(capture(B));
  });

  it('separates titles that differ only in case or punctuation', () => {
    expect(slug('Foo: bar')).toBe(slug('foo — bar'));
    expect(capture('Foo: bar')).not.toBe(capture('foo — bar'));
  });

  it('separates projects whose slugs agree', () => {
    expect(slug('Mobile Safari')).toBe(slug('mobile-safari'));
    expect(capture(A, { project: 'Mobile Safari' })).not.toBe(
      capture(A, { project: 'mobile-safari' }),
    );
  });

  it('is the same file for the same capture, so a re-run replaces its own', () => {
    expect(capture(A)).toBe(capture(A));
  });

  it('stays readable: project folder, title, order, label, extension', () => {
    // A literal, measured once: a hash recomputed here would agree with any
    // hashing the module did, including none.
    expect(
      captureFile({
        project: 'ios-safari-real-device',
        title: 'Journey 14 -- the board on a refused grant',
        order: 3,
        label: 'nothing out of reach',
        ext: 'png',
      }),
    ).toBe(
      'ios-safari-real-device/journey-14-the-board-on-a-refused-grant-608bc3b2__03-nothing-out-of-reach.png',
    );
  });
});
