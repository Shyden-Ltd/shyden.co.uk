/**
 * Real Safari, on the real iPhone, over the WebDriver session session.ts
 * builds. See docs/superpowers/specs/2026-08-08-real-device-test-harness-design.md,
 * section 5: Playwright cannot attach to iOS Safari at all, so this is a
 * real driver for the real W3C WebDriver protocol Safari speaks -- not a
 * mock of Playwright's API.
 *
 * TASK 3a SCOPE. The task brief lists 13 journeys; only Journey 1 (happy
 * path: 12 students) and Journey 5 (unhappy path: 0 students) are
 * implemented here, both locales. The rest are a follow-up task, added on
 * top of this file -- every journey below is parameterised over LOCALES
 * inside one `describe.each` block specifically so a later journey can be
 * dropped in alongside these two with no new plumbing.
 *
 * Imports the real locale table and the real tool-path helper rather than
 * restating either -- a hardcoded '/classroom-groups' string here could
 * drift from src/lib/i18n's own routing the moment either changes.
 *
 * One phone, one WebDriver session for the WHOLE FILE ("Exactly one session
 * per device" -- the task brief). `beforeAll`/`afterAll` are declared at
 * module scope, not nested inside `describe.each`, so both locale blocks
 * share the one session; vitest.ios.config.ts's `fileParallelism: false` is
 * what keeps this file from ever running alongside another device-touching
 * file.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  getStrings,
  LOCALES,
  toolPath,
  type Locale,
} from '../../../src/lib/i18n';
import { startIosSession, type DeviceSession } from './session';
import { waitFor } from './webdriver';

let session: DeviceSession;

beforeAll(async () => {
  session = await startIosSession();
}, 120_000);

afterAll(async () => {
  // `session` is unset if `startIosSession` itself threw (a failed
  // precondition) -- nothing to tear down in that case, and nothing this
  // file could safely call teardown() on.
  await session?.teardown();
}, 120_000);

describe.each(LOCALES)('classroom groups, locale %s', (locale: Locale) => {
  const strings = getStrings(locale);
  const path = toolPath(locale);

  test('Journey 1 -- 12 students, default mode: groups render, the count is 12, and the heading matches', async () => {
    await session.navigateToPath(path);

    const count = await session.driver.findElement('#cg-count');
    await count.click();
    await count.clear();
    await count.sendKeys('12');

    const go = await session.driver.findElement('#cg-go');
    await go.click();

    const students = await waitFor(
      async () => {
        const found = await session.driver.findElements('#cg-tables .student');
        return found.length > 0 ? found : undefined;
      },
      {
        timeout: 20_000,
        describe: `student cards to render in #cg-tables after submitting 12 students (${locale})`,
      },
    );
    expect(students.length).toBe(12);

    const heading = await session.driver.findElement('#cg-results-h');
    expect(await heading.text()).toBe(strings.resultsHeading);

    // The success path really is a success -- not an error shown alongside
    // whatever happened to already be in #cg-tables from a stale state.
    const errorBox = await session.driver.findElement('#cg-error');
    expect(await errorBox.property('hidden')).toBe(true);
  });

  test('Journey 5 -- 0 students: the real localised error, no groups', async () => {
    await session.navigateToPath(path);

    const count = await session.driver.findElement('#cg-count');
    await count.click();
    await count.clear();
    await count.sendKeys('0');

    const go = await session.driver.findElement('#cg-go');
    await go.click();

    const errorBox = await waitFor(
      async () => {
        const el = await session.driver.findElement('#cg-error');
        const hidden = await el.property('hidden');
        return hidden === false ? el : undefined;
      },
      {
        timeout: 20_000,
        describe: `#cg-error to become visible after submitting 0 students (${locale})`,
      },
    );
    expect(await errorBox.text()).toBe(strings.errors.NO_STUDENTS);

    const results = await session.driver.findElement('#cg-results');
    expect(await results.property('hidden')).toBe(true);

    const groupCards = await session.driver.findElements('#cg-tables .group');
    expect(groupCards.length).toBe(0);
  });
});
