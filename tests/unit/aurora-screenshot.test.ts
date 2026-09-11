import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { withoutAstroComments } from './source-text';

/**
 * #17 Aurora Stage 2 — the ShyTalk showcase phone frame.
 *
 * THIS FILE IS RED ON PURPOSE until the real screenshot lands, and that is
 * the whole point: the frame currently renders a placeholder wordmark, and a
 * placeholder is the kind of thing that ships because a branch went green and
 * nobody re-read the TODO. A ticket comment relies on someone remembering; a
 * failing assertion does not.
 *
 * Operator authorisation (2026-09-11): the screenshot is captured from the
 * DEV ShyTalk app — test accounts, fake information — never production, and
 * the in-app watermark is suppressed FOR THIS CAPTURE ONLY. Nothing that
 * suppresses the watermark may be committed to the ShyTalk repository.
 *
 * Both halves are asserted, because either alone is passable while broken:
 * removing the placeholder without adding the asset leaves an empty frame,
 * and adding the asset without rendering it leaves an unused file.
 *
 * Read against STRIPPED source. That direction matters here more than usual:
 * this is an ABSENCE assertion, so a comment naming the marker would turn it
 * red for no reason, and a guard that cries wolf gets deleted.
 */
const HOMEPAGE = 'src/components/pages/HomePage.astro';
const SCREENSHOT = 'public/shytalk-room.png';
const PLACEHOLDER_MARKER = ['SCREENSHOT', 'IS', 'PLACEHOLDER'].join('_');

const homepageSource = () =>
  withoutAstroComments(readFileSync(HOMEPAGE, 'utf8'));

describe('the ShyTalk showcase ships a real screenshot', () => {
  it('renders no placeholder in the phone frame', () => {
    expect(
      homepageSource(),
      `${HOMEPAGE} still carries the placeholder phone frame`,
    ).not.toContain(PLACEHOLDER_MARKER);
  });

  it('the screenshot asset exists and the page references it', () => {
    expect(existsSync(SCREENSHOT), `${SCREENSHOT} is missing`).toBe(true);
    expect(homepageSource()).toContain('/shytalk-room.png');
  });
});
