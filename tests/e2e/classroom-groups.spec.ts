import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import { openRoster, addSeveral, buildRoster } from './helpers';

/**
 * Every assertion is web-first (auto-retrying). No fixed waits: the tool deals
 * cards on a timer, so a sleep would make these pass or fail on machine speed
 * rather than on the product.
 */

const fill = async (
  page: Page,
  opts: {
    count?: string;
    size?: string;
    /** Switches to "number of groups" mode and sets it. */
    groups?: string;
    speed?: 'normal' | 'fast' | 'skip';
  },
) => {
  if (opts.count !== undefined) await page.fill('#cg-count', opts.count);
  if (opts.size !== undefined) await page.fill('#cg-size', opts.size);
  if (opts.groups !== undefined) {
    await page.check('input[name="mode"][value="groupCount"]');
    await page.fill('#cg-groups', opts.groups);
  }
  // Stage 2, Task 7 folded Sound & animation into the tool's fourth
  // collapsible section, the same treatment Task 4 already gave the
  // leftovers radios -- #cg-speed now lives in #cg-sound-body, which starts
  // collapsed, and Playwright's `selectOption` waits for a visible target
  // rather than acting on a hidden one. Idempotent (checked, not clicked
  // unconditionally): `fill()` runs more than once inside some tests, and a
  // second click would close what the first one just opened.
  const soundBody = page.locator('#cg-sound-body');
  if (await soundBody.isHidden()) {
    await page.locator('#cg-sound-toggle').click();
  }
  // Default to skip so the tests assert the RESULT, not the show. The
  // animation gets its own test below.
  await page.selectOption('#cg-speed', opts.speed ?? 'skip');
};

/**
 * Playwright cannot hear a sound effect, so the wiring tests below assert
 * the one thing that IS observable: whether `classroom-groups.ts` created
 * an `AudioContext` at all, and how many. This subclasses the REAL
 * `AudioContext` -- every constructed instance still calls `super(...)`,
 * so the actual Web Audio implementation underneath is exactly what
 * ships; nothing here is a fake standing in for it, only an added counter.
 * Installed via `addInitScript` so it is in place before
 * `classroom-groups.ts`'s module code (which creates its AudioContext
 * lazily, on first effect) ever runs.
 */
const installAudioContextCounter = (page: Page) =>
  page.addInitScript(() => {
    const w = window as Window & {
      __cgAudioContexts?: number;
      webkitAudioContext?: typeof AudioContext;
    };
    w.__cgAudioContexts = 0;
    const RealAudioContext = window.AudioContext ?? w.webkitAudioContext;
    if (!RealAudioContext) return; // no Web Audio support at all -- nothing to count
    class CountingAudioContext extends RealAudioContext {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        w.__cgAudioContexts = (w.__cgAudioContexts ?? 0) + 1;
      }
    }
    window.AudioContext = CountingAudioContext;
    if (w.webkitAudioContext) w.webkitAudioContext = CountingAudioContext;
  });

const audioContextCount = (page: Page) =>
  page.evaluate(
    () => (window as Window & { __cgAudioContexts?: number }).__cgAudioContexts,
  );

/** Every audio request this page could ever legitimately make matches this --
 *  used both to prove "none happened" and to prove "the ones that did are
 *  ours". A trailing query string is tolerated (Vite's own content-hashed
 *  filenames never carry one, but a URL match should not depend on that). */
const AUDIO_URL_PATTERN = /\.m4a(?:\?|$)/;

/** Walks `dist/` (the just-built output `playwright.config.ts`'s own
 *  webServer produces before any test runs) and returns every `.m4a` file
 *  found, as full filesystem paths -- not hardcoded to `dist/_astro/`
 *  specifically, so this stays correct if Vite's own asset directory ever
 *  changes. Mirrors baseurl-guard.spec.ts's own recursive file-walk. */
function listM4aFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listM4aFiles(full));
    else if (entry.name.endsWith('.m4a')) out.push(full);
  }
  return out;
}

/** A filesystem path under `dist/` -> the URL path the built site actually
 *  serves it at, e.g. `dist/_astro/shuffle.AbC123.m4a` -> `/_astro/shuffle.
 *  AbC123.m4a`. `sep`-split/rejoined so this is correct on any platform,
 *  not just one that happens to use `/` as its own path separator. */
const distPathToUrlPath = (fullPath: string): string =>
  '/' + relative('dist', fullPath).split(sep).join('/');

test.describe('classroom group creator', () => {
  // Stage 2, Task 1's own RED tests. The brief's literal snippet used
  // `getByLabel('How many students?')` and `#cg-groups .group` — neither
  // matches this page: the label reads "Number of students" (`studentsLabel`
  // in en.ts) and `#cg-groups` is the "how many groups" NUMBER INPUT's id,
  // not the results container (that's `#cg-results`, as every other test in
  // this file already uses). Corrected to the real label and the real
  // selector rather than reproduced verbatim.
  test('shuffles anonymous students against the rewritten engine', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('Number of students').fill('12');
    await page.getByRole('button', { name: 'Make groups' }).click();
    // 12 students at the default group size (4) => 3 groups.
    await expect(page.locator('#cg-results .group')).toHaveCount(3);
  });

  test('the paste-names box and the keep-apart box are gone', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await expect(page.locator('#cg-names')).toHaveCount(0);
    await expect(page.locator('#cg-apart')).toHaveCount(0);
  });

  // Two more tests retired along with the keep-apart box (#cg-apart) above
  // -- both fed `apart`, free text the rewritten engine no longer accepts
  // (see grouping.ts's GroupingInput). Their SUBJECTS are still alive and
  // worth reinstating once apart-letters are reachable from the page again:
  //
  // - 'explains an impossible keep-apart instead of failing silently':
  //   KEEP_APART_IMPOSSIBLE names the conflicting students and states how
  //   many groups they would need (src/lib/i18n/index.ts:113).
  // - 'an unarrangeable class is explained without accusing anyone':
  //   KEEP_APART_NO_ARRANGEMENT's promise that a refusal names NOBODY --
  //   proving no arrangement exists is not the same as blaming a student,
  //   and a later stage could silently re-break that
  //   (src/lib/i18n/index.ts:118).

  test('splits a class and shows every student exactly once', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await fill(page, { count: '22', size: '4' });
    await page.click('#cg-go');

    // 22 students in groups of 4 => 5 groups.
    await expect(page.locator('#cg-results .group')).toHaveCount(5);
    await expect(page.locator('#cg-results .student')).toHaveCount(22);
    await expect(page.locator('#cg-summary')).toContainText('22');
  });

  test('never makes a group smaller than the size asked for', async ({
    page,
  }) => {
    // The operator's core rule: 7 students in groups of 4 is ONE group of 7,
    // not 4 and 3.
    await page.goto('/classroom-groups');
    await fill(page, { count: '7', size: '4' });
    await page.click('#cg-go');

    await expect(page.locator('#cg-results .group')).toHaveCount(1);
    await expect(page.locator('#cg-results .student')).toHaveCount(7);
  });

  test('numbers students since there is no roster to name them from yet', async ({
    page,
  }) => {
    // The paste-names box is gone: it fed `students: string[]`, an input
    // shape the rewritten engine no longer accepts (see grouping.ts's
    // GroupingInput). Numbered students are the only mode there is until a
    // later stage brings a roster back, so this is the default case, not a
    // fallback from something else.
    //
    // Asserts the whole SET of labels, not `.first()`'s: placeBlocks in
    // grouping.ts shuffles block order with the real, unseeded Math.random
    // this page wires in, so which student renders first is never
    // deterministic -- only which four labels appear is. A substring check
    // (`toContainText('Student')`) would also pass for a malformed label
    // like "Student NaN" -- Student.number carries no whole/positive
    // validation on the record path (see the stage-2 ledger) -- so this
    // pins each full sentence, not a fragment of one.
    await page.goto('/classroom-groups');
    await fill(page, { count: '4', size: '2' });
    await page.click('#cg-go');
    const labels = await page.locator('#cg-results .student').allTextContents();
    expect(labels.sort()).toEqual([
      'Student 1',
      'Student 2',
      'Student 3',
      'Student 4',
    ]);
  });

  // Task 8, the locale sweep. studentsHelp used to read "Leave the names box
  // empty to use numbered students." -- the paste-names box it describes was
  // removed by Task 1's engine rewrite (see 'the paste-names box and the
  // keep-apart box are gone' above), so this sentence had been describing a
  // control that no longer exists on the page since stage 2 began. Nothing
  // pinned its literal text before now, so the drift shipped silently.
  // Rewritten to state what is actually true today -- every student this
  // field produces is anonymous and numbered -- matching the exact label
  // 'numbers students since there is no roster to name them from yet' above
  // already proves the results themselves carry ("Student 1", "Student 2",
  // …). Would fail on either the old sentence returning or a typo dropping
  // "numbered"/"anonymous".
  test('the help text under Number of students describes what happens now, not the removed names box', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await expect(page.locator('#cg-count-help')).toHaveText(
      'Students are anonymous and numbered — Student 1, Student 2, and so on.',
    );
  });

  test('results are readable with the animation skipped', async ({ page }) => {
    // The whole accessibility argument: the answer exists as text regardless
    // of whether anyone watched it being dealt.
    await page.goto('/classroom-groups');
    await fill(page, { count: '8', size: '4', speed: 'skip' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .student')).toHaveCount(8);
    await expect(page.locator('#cg-results .student').first()).toBeVisible();
  });

  test('the animation deals every card and settles', async ({ page }) => {
    await page.goto('/classroom-groups');
    await fill(page, { count: '6', size: '3', speed: 'fast' });
    await page.click('#cg-go');
    // Auto-retries until the deal finishes — no timing bet.
    await expect(page.locator('#cg-results .student.dealt')).toHaveCount(6);
    await expect(page.locator('#cg-go')).toBeEnabled();
  });

  test('with sound muted, running the animation creates no AudioContext at all', async ({
    page,
  }) => {
    await installAudioContextCounter(page);
    await page.goto('/classroom-groups');
    await fill(page, { count: '6', size: '3', speed: 'fast' });
    // Sound is ON by default (operator decision) -- mute it before the run.
    await page.uncheck('#cg-sound-check');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .student.dealt')).toHaveCount(6);
    expect(await audioContextCount(page)).toBe(0);
  });

  test('with sound on, two animation runs share exactly one AudioContext', async ({
    page,
  }) => {
    await installAudioContextCounter(page);
    await page.goto('/classroom-groups');
    // Sound stays ON (the default) for this one.
    await fill(page, { count: '4', size: '2', speed: 'fast' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .student.dealt')).toHaveCount(4);
    expect(await audioContextCount(page)).toBe(1);

    // Shuffle again -- a second effect run must REUSE the context that
    // already exists, not open a second one.
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .student.dealt')).toHaveCount(4);
    expect(await audioContextCount(page)).toBe(1);
  });

  // Task 9: the operator picked sound set C, six real CC0 files at
  // src/assets/sfx/ (provenance and licence in that directory's own
  // CREDITS.md), imported through Vite in classroom-groups.ts's own "sound"
  // section. The five tests below are what actually protect that: the
  // files really ship and really serve; sound-off and reduced-motion really
  // download nothing (the CLAUDE.md/third-party-requests promise, asserted
  // rather than assumed); sound-on requests really are ours, same-origin;
  // and the tool really keeps working when every one of those requests is
  // blocked -- the one that stands in for a browser that cannot decode AAC.
  test('all six sound assets are reachable from the built site and appear in dist/', async ({
    page,
  }) => {
    const files = listM4aFiles(join('dist'));
    // A silent guard that found zero files would pass for the wrong reason
    // -- prove the walk actually found the build output before trusting the
    // loop below proves anything about it (same reasoning as
    // baseurl-guard.spec.ts's own "found none, which means this guard's own
    // file-walk is broken" check).
    expect(
      files.length,
      'expected to find .m4a files under dist/ (a fresh build should always ' +
        'produce them); found none, which means this walk is broken, not ' +
        'that the six sound assets are missing',
    ).toBeGreaterThan(0);

    for (const role of [
      'shuffle',
      'land-1',
      'land-2',
      'land-3',
      'land-4',
      'done',
    ]) {
      const pattern = new RegExp(`^${role}\\.[\\w-]+\\.m4a$`);
      const matches = files.filter((f) => pattern.test(basename(f)));
      expect(
        matches,
        `expected exactly one built asset for "${role}" in dist/, found: [${matches.join(', ')}]`,
      ).toHaveLength(1);

      const urlPath = distPathToUrlPath(matches[0]);
      const response = await page.request.get(urlPath);
      expect(
        response.ok(),
        `GET ${urlPath} was not reachable from the built site (status ${response.status()})`,
      ).toBe(true);
      expect((await response.body()).length).toBeGreaterThan(0);
    }
  });

  test('with sound off, a full shuffle fetches no audio at all', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-sound-toggle').click();
    await page.uncheck('#cg-sound-check');

    const audioRequests: string[] = [];
    page.on('request', (r) => {
      if (AUDIO_URL_PATTERN.test(r.url())) audioRequests.push(r.url());
    });

    // The reload is what matters: classroom-groups.ts's own "sound asset
    // network prefetch" section reads the REMEMBERED preference at MODULE
    // LOAD time, which only a fresh load (not a same-page uncheck) can
    // exercise -- see that section's own doc comment.
    await page.reload();
    await page.locator('#cg-sound-toggle').click();
    await expect(page.locator('#cg-sound-check')).not.toBeChecked();

    await fill(page, { count: '6', size: '3', speed: 'fast' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .student.dealt')).toHaveCount(6);
    expect(audioRequests).toEqual([]);
  });

  test('with sound on, the audio requests that happen are exactly ours and same-origin', async ({
    page,
  }) => {
    const audioRequests: string[] = [];
    page.on('request', (r) => {
      if (AUDIO_URL_PATTERN.test(r.url())) audioRequests.push(r.url());
    });

    // Sound stays ON (the default) and speed stays 'normal' (not 'skip') --
    // the on-load prefetch trigger fires for all six purely from loading the
    // page, with no form interaction at all.
    await page.goto('/classroom-groups');

    expect(audioRequests).toHaveLength(6);
    const pageOrigin = new URL(page.url()).origin;
    for (const url of audioRequests) {
      // The CLAUDE.md/no-third-party-requests promise, asserted directly --
      // the origin, not just that six requests happened to fire.
      expect(new URL(url).origin).toBe(pageOrigin);
    }
  });

  test.describe('a reduced-motion visitor', () => {
    test('downloads no audio at all', async ({ page }) => {
      const audioRequests: string[] = [];
      page.on('request', (r) => {
        if (AUDIO_URL_PATTERN.test(r.url())) audioRequests.push(r.url());
      });

      // `page.emulateMedia`, not `test.use({ reducedMotion: 'reduce' })`:
      // verified by hand that the declarative context option does not
      // reliably reach `window.matchMedia` reads against this project's
      // static, prerendered pages, while this imperative call -- issued
      // before `goto`, same as every other emulateMedia call needs to
      // precede the navigation whose script reads it -- does.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/classroom-groups');
      // Sound stays ON (untouched, the default) -- speed is forced to
      // 'skip' by classroom-groups.ts's own reduceMotion handling, which
      // predates this task. What is new here: that now also has to mean
      // zero downloads, not just zero sound -- a real bandwidth promise on
      // a phone (see classroom-groups.ts's own "sound asset network
      // prefetch" section).
      await expect(page.locator('#cg-speed')).toHaveValue('skip');
      await page.fill('#cg-count', '6');
      await page.click('#cg-go');
      await expect(page.locator('#cg-results .student')).toHaveCount(6);
      expect(audioRequests).toEqual([]);
    });
  });

  test('the fallback plays through a full shuffle when every audio request is blocked', async ({
    page,
  }) => {
    // Simulates both "still downloading" (forever, in this test's case) and
    // "a browser that cannot decode AAC" identically -- classroom-groups.ts's
    // own sampleFor treats a blocked fetch and a rejected decodeAudioData
    // the same way, so proving the fetch-failure branch proves the
    // mechanism both real-world causes fall back through.
    await page.route('**/*.m4a', (route) => route.abort());

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto('/classroom-groups');
    await fill(page, { count: '6', size: '3', speed: 'fast' });
    await page.click('#cg-go');

    // Same assertions "the animation deals every card and settles" already
    // makes for the unblocked case -- the point here is that blocking every
    // audio request changes nothing about this outcome.
    await expect(page.locator('#cg-results .student.dealt')).toHaveCount(6);
    await expect(page.locator('#cg-go')).toBeEnabled();
    expect(pageErrors).toEqual([]);
  });

  test('splits by number of groups, not just by group size', async ({
    page,
  }) => {
    // The whole second half of the "how to split them" fieldset — reachable
    // from the page, and until now asserted by nothing.
    await page.goto('/classroom-groups');
    await fill(page, { count: '20', groups: '3' });
    await page.click('#cg-go');

    await expect(page.locator('#cg-results .group')).toHaveCount(3);
    await expect(page.locator('#cg-results .student')).toHaveCount(20);
  });

  test('a mis-keyed class size is refused, not attempted', async ({ page }) => {
    // Before the cap this allocated 100 million objects and the tab died —
    // on a phone, taking the browser with it.
    await page.goto('/classroom-groups');
    await fill(page, { count: '100000000', size: '4' });
    await page.click('#cg-go');

    await expect(page.locator('#cg-error')).toHaveText(
      'That is more students than this tool will take. The most is 500.',
    );
    // Still alive and still usable, which is the actual claim.
    await expect(page.locator('#cg-go')).toBeEnabled();
    await expect(page.locator('#cg-results')).toBeHidden();
  });

  test('the summary reads as a sentence, singular included', async ({
    page,
  }) => {
    // The tool's own headline case, and the page has said "1 groups from 7
    // students." since it shipped. The old assertion was toContainText('22')
    // — a bare number, which would also have passed with the arguments the
    // wrong way round.
    await page.goto('/classroom-groups');
    await fill(page, { count: '7', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-summary')).toHaveText(
      '1 group from 7 students.',
    );

    await fill(page, { count: '22', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-summary')).toHaveText(
      '5 groups from 22 students.',
    );
  });

  test('the error clears the stale "Shuffle again" label', async ({ page }) => {
    await page.goto('/classroom-groups');
    await fill(page, { count: '8', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-go')).toHaveText('Shuffle again');

    // Now a refusal. Offering to reshuffle results that are no longer on
    // screen is an offer the page cannot keep.
    await fill(page, { count: '0', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-error')).toBeVisible();
    await expect(page.locator('#cg-go')).toHaveText('Make Groups');
  });

  test('the mute choice survives a reload', async ({ page }) => {
    await page.goto('/classroom-groups');
    // Stage 2, Task 7: the checkbox now lives inside #cg-sound-body, and
    // every visit starts with every tool section collapsed (design spec
    // section 11 names only the how-to state and a later print panel as
    // the UI preferences allowed to persist) -- so it has to be reopened
    // after the reload below too, not just before the first check.
    await page.locator('#cg-sound-toggle').click();
    // Sound is ON by default (operator decision).
    await expect(page.locator('#cg-sound-check')).toBeChecked();
    await page.uncheck('#cg-sound-check');
    await page.reload();
    await page.locator('#cg-sound-toggle').click();
    await expect(page.locator('#cg-sound-check')).not.toBeChecked();
  });
});

// Stage 2, Task 5: the class name, and the results heading it optionally
// heads (design spec section 8). "Class name is optional. Blank is fine and
// nothing is blocked... It heads the results: `7B — your groups`... It is
// not repeated on every group card."
test.describe('class name and results heading', () => {
  // Corrected from task-5-brief.md's own snippet, which located the
  // "not repeated on cards" check at `#cg-groups` -- that id belongs to the
  // "how many groups" NUMBER INPUT on this page, not the results container
  // (`#cg-tables`, where the script actually appends group cards) -- the
  // same class of locator mistake Task 1/Task 2's own ledger entries
  // already record and correct.
  test('the class name heads the results, once', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('Class (optional)').fill('7B');
    await fill(page, { count: '9', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText('7B — your groups');
    await expect(page.locator('#cg-tables').getByText('7B')).toHaveCount(0);
  });

  // task-5-brief.md's own count (9 students at the page's default group
  // size, 4) predicted `#cg-groups .group` would have count 3. The engine's
  // own targetSizes (src/lib/grouping.ts) says otherwise: groupCount =
  // floor(9/4) = 2, not ceil -- the same "never smaller than the size you
  // asked for" rule this file already pins above ('never makes a group
  // smaller than the size asked for'). Confirmed against grouping.test.ts's
  // own "Derivation: base = floor(9/4) = 2, remainder = 9 - 8 = 1" comment
  // before writing this, rather than trusting the brief's arithmetic.
  // Honestly: this passes even before #cg-class exists, since it never
  // references the field at all -- confirmed, not assumed, by running it
  // against the untouched page before implementing anything (RED baseline).
  // It is not decoration, though: it pins the exact branch
  // resultsHeadingText takes when nothing was typed, which is the same
  // branch a teacher who never opens the class field exercises on the real
  // page. What would redden it: a bug in that blank check (e.g. reading
  // `classInput.value` before it exists, or comparing against `''` without
  // `.trim()` so a later whitespace-only fix regresses), or the page's own
  // default group size changing out from under the `.toHaveCount(2)` below.
  test('a blank class name blocks nothing', async ({ page }) => {
    await page.goto('/classroom-groups');
    await fill(page, { count: '9', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText('Your groups');
    await expect(page.locator('#cg-results .group')).toHaveCount(2);
    await expect(page.locator('#cg-results .student')).toHaveCount(9);
  });

  // Design spec section 8 says blank "blocks nothing" -- a teacher who
  // fat-fingers the space bar has not typed a name a class would recognise
  // as its own either. Distinct from the never-filled case above: this is
  // the one place the `.trim()` blank-test is proven through the real
  // control, not just the pure function (tests/unit/i18n.test.ts covers
  // resultsHeadingText directly).
  test('a class name of only spaces is treated as no class name', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('Class (optional)').fill('   ');
    await fill(page, { count: '9', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText('Your groups');
  });

  // Corrected from task-5-brief.md's own `#cg-groups .group h3` locator --
  // same mistake as above. Filling the class field first is what makes this
  // a real test of THIS task's own wiring rather than a pin of
  // stage-3-owned behaviour: a naive implementation that broke
  // render()/groupName()'s call order while adding the heading write would
  // show up here. The claim "groups are always numbered" -- i.e. that the
  // theme picker and the naming radio are gone -- was stage 3's own removal
  // (design spec section 3, delivery item 3; landed by Task 8, tested in
  // classroom-groups-controls.spec.ts's "the theme select and the naming
  // radio are gone" / "groups are numbered, always") and is NOT re-tested
  // here; this only pins that setting a class name does not disturb today's
  // numbered DEFAULT.
  test('groups stay numbered when a class name is set', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('Class (optional)').fill('7B');
    await fill(page, { count: '9', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .group h3').first()).toHaveText(
      'Group 1',
    );
  });

  // "A teacher's typed text is theirs" -- the class name reaches the DOM
  // through `.textContent`, never `.innerHTML` (classroom-groups.ts), the
  // same rule the results grid already follows for a student's name (see
  // that file's own comment on `who.textContent = label(student)`). Proven
  // by a payload that would look completely different if it were EVER
  // parsed as markup: an `<img>` tag consumed as an element would vanish
  // from the rendered TEXT and its `onerror` would fire (a dialog opening)
  // -- so the exact literal string surviving, with no `<img>` ELEMENT ever
  // created and no dialog raised, is the only way this test can pass.
  test('a class name is rendered literally, HTML metacharacters included', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    let dialogFired = false;
    page.on('dialog', (d) => {
      dialogFired = true;
      void d.dismiss();
    });
    const raw = '<img src=x onerror=alert(1)>7B & "Sons"';
    await page.getByLabel('Class (optional)').fill(raw);
    // #cg-speed sits inside #cg-sound-body since Stage 2, Task 7 (see
    // the fill() helper's own comment above -- this test does not use it).
    await page.locator('#cg-sound-toggle').click();
    await page.selectOption('#cg-speed', 'skip');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText(
      `${raw} — your groups`,
    );
    await expect(page.locator('#cg-results-h img')).toHaveCount(0);
    expect(dialogFired).toBe(false);
  });

  // Design spec section 9: "The class name is made safe for a filename, and
  // only there... The class name itself is never altered -- not on the
  // page, not in the `# Class:` line, not in the results heading."
  // Filenames are stage 4's own scope, but that line's promise about the
  // results heading is testable now, so it is pinned now rather than left
  // to whichever task builds the filename. A slash is the design doc's own
  // example of a filename-unsafe character (`Year 7 / Set B`).
  test('filename-unsafe characters reach the heading unaltered', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('Class (optional)').fill('Year 7 / Set B');
    await page.locator('#cg-sound-toggle').click();
    await page.selectOption('#cg-speed', 'skip');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText(
      'Year 7 / Set B — your groups',
    );
  });

  // CLAUDE.md's own rule: no horizontal scroll at >= 320px, in any state. A
  // class name has no length limit (MAX_ROSTER is stage 3's, and governs
  // the roster, not this field), so an unbroken long name is a real input,
  // not a contrived one -- ordinary word-wrapping cannot help a single
  // token with no spaces, which is exactly why this is a genuine check of
  // `#cg-results-h`'s own `overflow-wrap: anywhere` rather than something
  // normal text wrapping would already have covered.
  test(
    'a very long class name does not force the page to scroll sideways',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto('/classroom-groups');
      await page.getByLabel('Class (optional)').fill('x'.repeat(300));
      await page.locator('#cg-sound-toggle').click();
      await page.selectOption('#cg-speed', 'skip');
      await page.click('#cg-go');
      await expect(page.locator('#cg-results-h')).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    },
  );

  // The class name is read fresh at every submit (classroom-groups.ts), not
  // captured once -- a second shuffle with a different name in the field
  // must show the NEW name, not the first one cached. This is about the
  // correctness of THIS task's own wiring, not the staleness/dimming
  // behaviour a later task owns (design spec section 8's "when the class
  // changes after a shuffle") -- nothing here asserts the old groups are
  // marked out of date, only that the heading itself keeps up.
  test('a changed class name is picked up on the next shuffle', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    const classField = page.getByLabel('Class (optional)');
    await classField.fill('7B');
    await fill(page, { count: '8', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText('7B — your groups');

    await classField.fill('8C');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText('8C — your groups');
  });
});

// Task 8, the locale sweep. Design spec section 3's "Top row: Class
// (optional) · Students · Split by" -- Stage 2 Tasks 5 and 7 assembled this
// row out of what used to be two separate fieldsets, but every existing
// test that touches the mode radios or #cg-groups does it by CSS `value`
// attribute or by the OTHER field's own label (`groupSizeLabel`), never by
// these fields' own accessible names. modeLabel/modePerGroup/
// modeGroupCount/groupCountLabel had never once been asserted as rendered
// text, in either language -- a wrong or dropped label here would have
// failed nothing.
test.describe('the Split by row names its own fields', () => {
  for (const [path, splitBy, perGroup, groupCountRadio, howMany] of [
    [
      '/classroom-groups',
      'Split by',
      'Students per group',
      'Number of groups',
      'How many groups',
    ],
    [
      '/id/classroom-groups',
      'Bagi berdasarkan',
      'Siswa per kelompok',
      'Jumlah kelompok',
      'Berapa banyak kelompok',
    ],
  ] as const) {
    test(`the fields are correctly labelled (${path})`, async ({ page }) => {
      await page.goto(path);
      // The radiogroup's own name -- an `aria-labelledby` span
      // (`#cg-mode-label`), the same pattern the leftovers radiogroup
      // elsewhere on this page already uses. `#cg-mode-label` targeted
      // directly with `toHaveText` (an EXACT match) rather than
      // `page.getByText(splitBy)`: a mutation spot-check ('Split by' ->
      // 'Split by-ish') proved getByText's default SUBSTRING match cannot
      // catch a suffix tacked onto the real sentence -- it stayed green
      // against the mutant. The sibling leftovers assertions elsewhere in
      // this suite (`getByText('Jika ada siswa tersisa')` and its English
      // counterpart) share that same weakness; out of this task's own
      // scope to rewrite, recorded in task-8-report.md instead.
      await expect(page.locator('#cg-mode-label')).toHaveText(splitBy);
      // { exact: true } on all three: a second mutation spot-check
      // ('Students per group' -> 'Students per group of frogs') proved
      // getByLabel's default match is ALSO substring, not just getByText's
      // -- it resolved the mutated control uniquely and stayed green. Every
      // other getByLabel call in this file (and its siblings) shares that
      // same default; recorded in task-8-report.md rather than swept
      // project-wide, which is well beyond one locale-sweep task.
      await expect(page.getByLabel(perGroup, { exact: true })).toBeVisible();
      // #cg-groups ("How many groups") ships `hidden` until "Number of
      // groups" is chosen -- the same reveal 'splits by number of groups,
      // not just by group size' already exercises by CSS value, exercised
      // here by the radio's own accessible name instead.
      await page.getByLabel(groupCountRadio, { exact: true }).check();
      await expect(page.getByLabel(howMany, { exact: true })).toBeVisible();
    });
  }
});

test.describe('classroom group creator — Bahasa Indonesia', () => {
  test('the Indonesian page is genuinely in Indonesian', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await expect(page.locator('h1')).toHaveText('Pembuat Kelompok Kelas');
    await expect(page.locator('#cg-go')).toHaveText('Buat Kelompok');
  });

  test('anonymous students are labelled in Indonesian', async ({ page }) => {
    // Same whole-set assertion as the English cover above, for the same
    // reason: render order is genuinely shuffled, and a substring would
    // also pass for a malformed "Siswa NaN".
    await page.goto('/id/classroom-groups');
    await fill(page, { count: '4', size: '2' });
    await page.click('#cg-go');
    const labels = await page.locator('#cg-results .student').allTextContents();
    expect(labels.sort()).toEqual(['Siswa 1', 'Siswa 2', 'Siswa 3', 'Siswa 4']);
    // groupLabel's Indonesian output ("Kelompok N") was only ever proven at
    // the unit level (i18n.test.ts's groupName tests), never against the
    // real page in Indonesian -- the numbered heading every teacher sees
    // (Stage 3, Task 8 made this the ONLY form: the theme picker and the
    // naming radio that used to choose between it and a themed heading are
    // both gone, design spec section 5) had no e2e assertion in Indonesian
    // at all before this test.
    await expect(page.locator('#cg-results .group h3').first()).toHaveText(
      'Kelompok 1',
    );
  });

  test('errors are shown in Indonesian, not English', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await fill(page, { count: '0', size: '2' });
    await page.click('#cg-go');
    const error = page.locator('#cg-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('Tambahkan siswa');
  });

  // Task 8, the locale sweep. Mirrors the English 'the help text under
  // Number of students…' test above -- studentsHelp's Indonesian copy
  // described the same removed paste-names box ("Biarkan kotak nama kosong
  // untuk memakai siswa bernomor.") and had no test in either language.
  test('the help text under Jumlah siswa reads in Indonesian, as a whole sentence', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await expect(page.locator('#cg-count-help')).toHaveText(
      'Siswa bersifat anonim dan diberi nomor — Siswa 1, Siswa 2, dan seterusnya.',
    );
  });

  // Mirrors the English 'the error clears the stale "Shuffle again" label'
  // test -- `again` ("Acak lagi") had no Indonesian assertion anywhere.
  test('the button relabels to Acak lagi after a shuffle, and back to Buat Kelompok on a refusal', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await fill(page, { count: '8', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-go')).toHaveText('Acak lagi');

    await fill(page, { count: '0', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-error')).toBeVisible();
    await expect(page.locator('#cg-go')).toHaveText('Buat Kelompok');
  });

  // Mirrors the English 'class name and results heading' describe block
  // above -- "assert whole rendered sentences, in both locales" applies
  // regardless of what task-5-brief.md's own snippet happened to show (it
  // was English-only).
  test('the class name heads the results, once', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await page.getByLabel('Kelas (opsional)').fill('7B');
    await fill(page, { count: '9', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText(
      '7B — kelompok Anda',
    );
    await expect(page.locator('#cg-tables').getByText('7B')).toHaveCount(0);
  });

  // Same honesty note as the English version above: passes before
  // #cg-class exists too, for the same reason (never references the
  // field), confirmed against the RED baseline rather than assumed.
  test('a blank class name blocks nothing', async ({ page }) => {
    await page.goto('/id/classroom-groups');
    await fill(page, { count: '9', size: '4' });
    await page.click('#cg-go');
    await expect(page.locator('#cg-results-h')).toHaveText('Kelompok Anda');
    await expect(page.locator('#cg-results .group')).toHaveCount(2);
  });
});

// Stage 2, Task 6: staleness (design spec section 8, "When the class
// changes after a shuffle"). task-6-brief.md's own six tests, corrected the
// same way Task 1/Task 2/Task 5's own ledger entries already correct this
// brief's sibling snippets: `getByLabel('How many students?')` matches
// nothing (the real label is "Number of students"), and
// `getByLabel('Students per group')` matches the MODE RADIO ("Students per
// group", `modePerGroup`) rather than the group-size NUMBER FIELD this test
// actually means to change -- that field's own label is "Students in each
// group" (`groupSizeLabel`). Playwright's `.fill()` throws outright on a
// radio input ("Input of type radio cannot be filled"), so the brief's own
// snippet could not have run as written. The leftovers radio also needs its
// section OPENED first: Stage 2, Task 4 rehomed it inside
// `#cg-grouping-body`, which starts collapsed -- the brief's snippet
// predates that move. `#cg-go` is clicked by id throughout, not by
// accessible name: its own label changes to "Shuffle again" after the first
// success (see 'the error clears the stale "Shuffle again" label' above),
// and once results are stale, `#cg-stale`'s own button carries that SAME
// name too -- `getByRole('button', { name: 'Shuffle again' })` would then
// match two elements.
test.describe('out-of-date groups', () => {
  const shuffle = async (page: Page) => {
    await page.getByLabel('Number of students').fill('12');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .group')).toHaveCount(3);
  };

  test('changing the group size marks them out of date, naming the change', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students in each group').fill('3');
    await expect(
      page.getByText('These groups are out of date — the group size changed.'),
    ).toBeVisible();
  });

  test('changing the leftovers choice marks them out of date', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.locator('#cg-grouping-toggle').click();
    await page.getByLabel('Put them all in one group').check();
    await expect(
      page.getByText(
        'These groups are out of date — the leftovers choice changed.',
      ),
    ).toBeVisible();
  });

  // C-1 (review, task 6 fix): #cg-count ("Number of students") is the
  // page's ONLY population control this stage -- there is no roster yet,
  // so changing it is not cosmetic the way the class NAME is (see the very
  // next test): it changes who the groups are actually made FROM. Before
  // this fix, `snapshot()` (classroom-groups.ts) never read it at all, so
  // shuffling 12 into 3 groups and then asking for 30 left the sheet
  // showing three groups built from twelve students with no warning.
  // `readRoster` folds the count into the SAME `roster` field
  // staleness.ts's own Snapshot doc comment reserves for "a student was
  // edited", rather than a parallel mechanism -- reusing `staleRoster`'s
  // existing English ("the class list changed"), which is exactly what
  // changing the count IS at this stage.
  test('changing the number of students marks them out of date, naming the change', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Number of students').fill('30');
    await expect(
      page.getByText('These groups are out of date — the class list changed.'),
    ).toBeVisible();
  });

  // Pinned in the OTHER direction too, the same reason "undoing the
  // change clears it" exists for group size below: staleness is a
  // comparison against a fresh read of the form, not a flag, so putting
  // the count back needs no code of its own to clear the notice.
  test('undoing the count change clears it', async ({ page }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Number of students').fill('30');
    await page.getByLabel('Number of students').fill('12');
    await expect(page.getByText('out of date')).toHaveCount(0);
  });

  // The brief's own snippet also asserted `#cg-results-h` already read
  // '7B — your groups' at this point. It does not, and confirming that
  // against the RED baseline (before any staleness code existed) is what
  // caught it: the heading is written once, at submit
  // (classroom-groups.ts), and Task 5's own "a changed class name is
  // picked up on the next shuffle" test already covers that timing
  // directly. Typing a class name here does not reshuffle, so asserting a
  // live heading update pins a DIFFERENT, already-false claim that has
  // nothing to do with whether the change also marks the groups stale --
  // which is the one thing this test's own name promises.
  test('the class name does NOT mark them out of date', async ({ page }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Class (optional)').fill('7B');
    await expect(page.getByText('out of date')).toHaveCount(0);
  });

  test('the old groups stay visible while stale', async ({ page }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students in each group').fill('3');
    await expect(page.locator('#cg-results .group')).toHaveCount(3);
  });

  test('shuffling clears it', async ({ page }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students in each group').fill('3');
    await page.click('#cg-go');
    await expect(page.getByText('out of date')).toHaveCount(0);
  });

  test('undoing the change clears it', async ({ page }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students in each group').fill('3');
    await page.getByLabel('Students in each group').fill('4');
    await expect(page.getByText('out of date')).toHaveCount(0);
  });

  // Stage 3, Task 9 (E-05…E-11). Every one of the tests above changes a
  // control in the FORM. These four change the ROSTER, which reaches
  // `Snapshot.roster` by a different path -- `serialiseForCompare`
  // (src/lib/roster.ts) rather than `#cg-count` -- and so is only proven by
  // driving the roster's own controls.
  //
  // Parameterised over the four edits deliberately: each is a separate call
  // site into `setRoster`, and a wiring that forgot one of them would still
  // pass a single hand-picked case. `absent` in particular is the one a
  // reader is most likely to think does not count -- it changes nobody's
  // membership of the list, only who is placed today, which is exactly why
  // it changes who ends up with whom.
  for (const [what, edit] of [
    [
      'marking a student absent',
      (page: Page) =>
        page.locator('.cg-student').first().getByLabel('Absent').check(),
    ],
    [
      'adding a student',
      (page: Page) => page.getByRole('button', { name: 'Add student' }).click(),
    ],
    [
      'removing a student',
      (page: Page) =>
        page
          .locator('.cg-student')
          .first()
          .getByRole('button', { name: 'Remove' })
          .click(),
    ],
    [
      'changing a letter',
      (page: Page) =>
        page
          .locator('.cg-student')
          .first()
          .getByLabel('Together')
          .selectOption('A'),
    ],
  ] as const) {
    test(`${what} marks the groups out of date`, async ({ page }) => {
      await openRoster(page);
      await addSeveral(page, 11);
      await page.getByRole('button', { name: 'Make Groups' }).click();
      await expect(page.locator('#cg-results .group').first()).toBeVisible();
      await edit(page);
      await expect(
        page.getByText(
          'These groups are out of date — the class list changed.',
        ),
      ).toBeVisible();
    });
  }

  // E-07, the MIRROR of "marking a student absent" above, and not a
  // duplicate of it: a wiring that keyed on absence becoming TRUE rather
  // than on the roster changing at all would pass that one and fail this.
  // Who is in today's shuffle changed in both directions.
  test('marking a student present again marks the groups out of date', async ({
    page,
  }) => {
    await openRoster(page);
    await addSeveral(page, 11);
    await page.locator('.cg-student').first().getByLabel('Absent').check();
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await expect(page.locator('#cg-results .group').first()).toBeVisible();
    await page.locator('.cg-student').first().getByLabel('Absent').uncheck();
    await expect(
      page.getByText('These groups are out of date — the class list changed.'),
    ).toBeVisible();
  });

  // E-11. A sex is the one roster field that changes nothing about who can
  // go with whom UNTIL a sex option is on -- but `serialiseForCompare`
  // folds it in unconditionally, so this is stale either way, which is the
  // safe direction. Set up WITH separate mode on, because that is the case
  // the row names and the only one where a reader would expect it to
  // matter.
  test('changing a sex under a sex option marks the groups out of date', async ({
    page,
  }) => {
    await buildRoster(page, [
      ['M'],
      ['M'],
      ['M'],
      ['M'],
      ['F'],
      ['F'],
      ['F'],
      ['F'],
    ]);
    await page.locator('#cg-grouping-toggle').click();
    await page.getByLabel('Keep boys and girls separate').check();
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await expect(page.locator('#cg-results .group').first()).toBeVisible();
    await page
      .locator('.cg-student')
      .first()
      .getByLabel('Sex')
      .selectOption('F');
    await expect(
      page.getByText('These groups are out of date — the class list changed.'),
    ).toBeVisible();
  });

  // The sex SWITCH itself, as opposed to a student's sex: `readSexMode` was
  // a hard-coded `'off'` until Stage 3 Task 9, so `staleReason`'s own
  // `staleSexMode` branch (src/lib/staleness.ts) has existed since stage 2
  // with no way to be reached from the page and no end-to-end test. It is
  // reachable now, and this is that test -- a different SENTENCE from every
  // other case in this block, so a branch that fell through to
  // `staleRoster` would fail it.
  test('turning a sex option on marks the groups out of date, naming the change', async ({
    page,
  }) => {
    await buildRoster(page, [
      ['M'],
      ['M'],
      ['M'],
      ['M'],
      ['F'],
      ['F'],
      ['F'],
      ['F'],
    ]);
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await expect(page.locator('#cg-results .group').first()).toBeVisible();
    await page.locator('#cg-grouping-toggle').click();
    await page.getByLabel('Keep boys and girls separate').check();
    // The literal sentence, not `en.staleSexMode`: importing the locale
    // would make this pass against whatever the table happens to say,
    // including a wrong or untranslated value (CLAUDE.md -- "locale files
    // are a review surface").
    await expect(
      page.getByText(
        'These groups are out of date — how boys and girls are grouped changed.',
      ),
    ).toBeVisible();
  });

  // The counterweight, and the reason `serialiseForCompare` excludes the
  // name at all (see its own doc comment): a teacher typing a name onto a
  // student who was already in the shuffle has not changed who ends up with
  // whom. Asserted in BOTH directions -- no notice, and the new name
  // actually reaching the groups on screen -- because a mutant that simply
  // stopped rendering the roster would satisfy the first half alone.
  test('a rename does not mark the groups out of date', async ({ page }) => {
    await openRoster(page);
    await addSeveral(page, 11);
    await page.getByRole('button', { name: 'Make Groups' }).click();
    await expect(page.locator('#cg-results .group').first()).toBeVisible();
    await page.locator('.cg-student').first().getByLabel('Name').fill('Anna');
    await expect(page.getByText('out of date')).toHaveCount(0);
    // `#cg-results`, NOT `#cg-groups` -- that id belongs to the "number of
    // groups" number input. The same correction this suite has already had
    // to make three times over (see tests/e2e/helpers.ts's own header).
    await expect(page.locator('#cg-results')).toContainText('Anna');
  });

  // None of the six tests above ever has TWO live changes at once -- the
  // whole reason staleReason (src/lib/staleness.ts) is a comparison against
  // a fresh read of the form, rather than a set of flags, is so this stays
  // correct with no extra code: undoing the higher-priority change does not
  // clear the notice, it just changes what the notice SAYS, because the
  // very next recompute finds the leftovers mismatch still live.
  test('when two things change, undoing one still names the other', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students in each group').fill('3');
    await page.locator('#cg-grouping-toggle').click();
    await page.getByLabel('Put them all in one group').check();
    await page.getByLabel('Students in each group').fill('4'); // undoes ONLY the size change
    await expect(
      page.getByText(
        'These groups are out of date — the leftovers choice changed.',
      ),
    ).toBeVisible();
    await expect(page.locator('#cg-results')).toHaveClass(/stale/);
  });

  test('when two things change, undoing both clears it', async ({ page }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students in each group').fill('3');
    await page.locator('#cg-grouping-toggle').click();
    await page.getByLabel('Put them all in one group').check();
    await page.getByLabel('Students in each group').fill('4');
    await page.getByLabel('Share them out evenly').check();
    await expect(page.getByText('out of date')).toHaveCount(0);
    await expect(page.locator('#cg-results')).not.toHaveClass(/stale/);
  });

  // Pins the WHOLE sentence against the notice's own element, not just that
  // SOME element on the page contains this text -- getByText above proves
  // the sentence renders somewhere; this proves it renders exactly here.
  // toHaveText is an EXACT match, unlike getByText's substring default, so
  // a dropped trailing space or a second sentence glued on would fail this
  // without failing the tests above.
  test('the notice element itself carries the exact sentence', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students in each group').fill('3');
    await expect(page.locator('#cg-stale-text')).toHaveText(
      'These groups are out of date — the group size changed.',
    );
  });

  // Design spec section 8's own "the way out": the badge is not merely a
  // notice, it is also how a teacher acts on it without scrolling back up
  // to #cg-go. `form="cg-form"` associates the button to the form despite
  // sitting outside it in the DOM -- proven here by getting the SAME
  // reshuffle #cg-go itself would have produced, not by reading the
  // attribute.
  test('the notice offers its own way to reshuffle, without hunting for the main button', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students in each group').fill('3');
    await expect(page.locator('#cg-stale')).toBeVisible();
    await page.locator('#cg-stale button').click();
    await expect(page.locator('#cg-stale')).toBeHidden();
    // 12 students at the NEW size (3) => 4 groups. Proves a real reshuffle
    // happened, not merely that the notice hid itself.
    await expect(page.locator('#cg-results .group')).toHaveCount(4);
  });

  // "Dimmed AND badged" (design spec section 8) -- the tests above only
  // ever prove the cards are still PRESENT, never that anything about their
  // appearance actually changed. This is the one that would catch a
  // `.stale` class added to #cg-results with no CSS rule behind it at all.
  test('the old groups are visually dimmed while stale, not merely still present', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    const before = await page
      .locator('#cg-results .group')
      .first()
      .evaluate((el) => getComputedStyle(el).opacity);
    await page.getByLabel('Students in each group').fill('3');
    await expect(page.locator('#cg-results')).toHaveClass(/stale/);
    const after = await page
      .locator('#cg-results .group')
      .first()
      .evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(after)).toBeLessThan(Number(before));
  });

  // C-2 (review, task 6 fix): the test above only proves darker-than-before,
  // which passes at ANY opacity, including one that fails WCAG AA -- it
  // stayed green throughout the bug (opacity: 0.55 measured 3.9:1 against
  // this page's actual background, `--bg`, under the 4.5:1 floor for
  // normal text). This computes the contrast the browser actually PAINTS,
  // from real computed styles read live off the page, using the same
  // relative-luminance formula WCAG 2.1 defines -- not a pinned opacity
  // constant that would drift silently if `--ink`/`--bg` were ever retuned
  // without anyone re-running a contrast checker by hand (tokens.css's own
  // "do NOT lighten past AA" on --accent is why that retuning is a real
  // risk on this page, not a hypothetical one).
  test('the dim stays above the WCAG AA contrast floor for normal text', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students in each group').fill('3');
    await expect(page.locator('#cg-results')).toHaveClass(/stale/);
    const contrast = await page
      .locator('#cg-results .group')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        const opacity = Number(style.opacity);
        // `.group` paints no background of its own (see this page's own
        // :global CSS comment on why the results area is styled that way)
        // -- walk up for the first ancestor that actually sets one, the
        // same resolution the browser performs when compositing.
        let bgEl = el.parentElement;
        let backgroundCss = 'rgba(0, 0, 0, 0)';
        while (bgEl) {
          const c = getComputedStyle(bgEl).backgroundColor;
          if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
            backgroundCss = c;
            break;
          }
          bgEl = bgEl.parentElement;
        }
        const nums = (css: string) => css.match(/[\d.]+/g)!.map(Number);
        const [ir, ig, ib] = nums(style.color);
        const [br, bgn, bb] = nums(backgroundCss);
        const mix = (i: number, b: number) => opacity * i + (1 - opacity) * b;
        const lin = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        const luminance = (r: number, g: number, b: number) =>
          0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const textLum = luminance(mix(ir, br), mix(ig, bgn), mix(ib, bb));
        const bgLum = luminance(br, bgn, bb);
        const lighter = Math.max(textLum, bgLum);
        const darker = Math.min(textLum, bgLum);
        return (lighter + 0.05) / (darker + 0.05);
      });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  // CLAUDE.md's binding rules apply to anything this task adds: no
  // horizontal scroll at 320px in any state, and every interactive target
  // is >= 44px. The full sweep across every width and every OTHER state on
  // the page is a later task's own (this task owns staleness, not the
  // no-scroll rule as a whole) -- this defends the one new element this
  // task is actually adding.
  test(
    'the notice fits at 320px with no horizontal scroll, and its button meets the touch-target minimum',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto('/classroom-groups');
      await shuffle(page);
      await page.getByLabel('Students in each group').fill('3');
      await expect(page.locator('#cg-stale')).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const box = await page.locator('#cg-stale button').boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    },
  );

  // "Assert whole rendered sentences, in both locales" (CLAUDE.md) -- every
  // test above is English-only, and the reason TEXT itself is
  // locale-varying content (unlike Task 5's own textContent/CSS mechanisms,
  // which are locale-invariant and deliberately not mirrored -- see that
  // task's own note in the 'class name and results heading' describe
  // block above).
  test('the reason reads in Indonesian, as a whole sentence', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await page.getByLabel('Jumlah siswa').fill('12');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .group')).toHaveCount(3);
    await page.getByLabel('Siswa dalam setiap kelompok').fill('3');
    await expect(page.locator('#cg-stale-text')).toHaveText(
      'Kelompok ini sudah tidak berlaku lagi — ukuran kelompok berubah.',
    );
  });

  // Task 8, the locale sweep. Only staleMode (immediately above) had an
  // Indonesian assertion; staleLeftovers and staleRoster are equally
  // reachable today (the leftovers radios and #cg-count both work on this
  // page) but had none. This test also exercises leftoversBunch's own
  // Indonesian LABEL for the first time anywhere in this suite -- every
  // other Indonesian leftovers test reaches the "bunch" radio through its
  // `value` attribute (`input[name="leftovers"][value="bunch"]`), never
  // through `getByLabel`, so a corrupted or deleted
  // "Masukkan semuanya ke satu kelompok" string could not have failed
  // anything before now. `{ exact: true }` because getByLabel's default
  // match is a substring, not a whole string -- see 'the Split by row
  // names its own fields' above for the mutation spot-check that found it.
  test('the leftovers-choice reason reads in Indonesian, as a whole sentence', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await page.getByLabel('Jumlah siswa').fill('12');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .group')).toHaveCount(3);
    await page.locator('#cg-grouping-toggle').click();
    await page
      .getByLabel('Masukkan semuanya ke satu kelompok', { exact: true })
      .check();
    await expect(page.locator('#cg-stale-text')).toHaveText(
      'Kelompok ini sudah tidak berlaku lagi — pilihan siswa tersisa berubah.',
    );
  });

  // Mirrors the English 'changing the number of students marks them out of
  // date' test (C-1 above): the count is this stage's whole roster, so
  // changing it is staleRoster ("the class list changed"), not cosmetic.
  test('the class-list reason reads in Indonesian, as a whole sentence', async ({
    page,
  }) => {
    await page.goto('/id/classroom-groups');
    await page.getByLabel('Jumlah siswa').fill('12');
    await page.click('#cg-go');
    await expect(page.locator('#cg-results .group')).toHaveCount(3);
    await page.getByLabel('Jumlah siswa').fill('30');
    await expect(page.locator('#cg-stale-text')).toHaveText(
      'Kelompok ini sudah tidak berlaku lagi — daftar kelas berubah.',
    );
  });
});

test.describe('site-wide language switching', () => {
  test('the switcher moves between the two versions of the SAME page', async ({
    page,
  }) => {
    // The classic i18n bug is a switcher that dumps you on the homepage.
    await page.goto('/classroom-groups');
    await page.click('header a.lang');
    await expect(page).toHaveURL(/\/id\/classroom-groups\/?$/);
    await page.click('header a.lang');
    await expect(page).toHaveURL(/\/classroom-groups\/?$/);
  });

  for (const [path, heading] of [
    [
      '/id/',
      'Kami membangun perangkat lunak khusus — dipercepat AI, sepenuhnya milik Anda.',
    ],
    ['/id/glory-points', 'Kalkulator Glory Points'],
  ] as const) {
    test(`${path} is translated`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', 'id');
      await expect(page.locator('h1')).toHaveText(heading);
    });
  }

  test('Indonesian nav links stay inside Indonesian — and read as Indonesian', async ({
    page,
  }) => {
    await page.goto('/id/');
    await expect(page.locator('nav a[href="/id/#services"]')).toHaveCount(1);
    // The hrefs were asserted; the WORDS were not. An entirely English nav
    // bar on every Indonesian page passed the whole suite.
    await expect(page.locator('nav a')).toHaveText([
      'Layanan',
      'Karya',
      'Kontak',
    ]);
  });

  test('the Indonesian homepage links to the Indonesian tools', async ({
    page,
  }) => {
    // localisePath's own doc comment calls this "the classic i18n bug", and
    // nothing asserted it anywhere: an Indonesian visitor clicking a work
    // card landed on the English page.
    await page.goto('/id/');
    await expect(
      page.locator('#work a[href="/id/classroom-groups"]'),
    ).toHaveCount(1);
    await expect(page.locator('#work a[href="/id/glory-points"]')).toHaveCount(
      1,
    );
    await expect(page.locator('#work a[href="/classroom-groups"]')).toHaveCount(
      0,
    );
  });

  test.describe('what each page tells a search engine', () => {
    // Asserted by VALUE. Counting the tags cannot tell the difference between
    // a correct alternate and every page on the site advertising the
    // Indonesian homepage as its translation.
    const SITE = 'https://shyden.co.uk';
    for (const [path, self, other, locale] of [
      ['/', '/', '/id/', 'en_GB'],
      ['/id/', '/id/', '/', 'id_ID'],
      [
        '/classroom-groups',
        '/classroom-groups/',
        '/id/classroom-groups/',
        'en_GB',
      ],
      [
        '/id/classroom-groups',
        '/id/classroom-groups/',
        '/classroom-groups/',
        'id_ID',
      ],
      ['/glory-points', '/glory-points/', '/id/glory-points/', 'en_GB'],
      ['/id/glory-points', '/id/glory-points/', '/glory-points/', 'id_ID'],
    ] as const) {
      test(`${path}`, async ({ page }) => {
        await page.goto(path);
        const isId = locale === 'id_ID';
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          'href',
          SITE + self,
        );
        await expect(
          page.locator('link[rel="alternate"][hreflang="id"]'),
        ).toHaveAttribute('href', SITE + (isId ? self : other));
        await expect(
          page.locator('link[rel="alternate"][hreflang="en"]'),
        ).toHaveAttribute('href', SITE + (isId ? other : self));
        // English is x-default, the correct convention for the unprefixed
        // locale — and asserted nowhere before this.
        await expect(
          page.locator('link[rel="alternate"][hreflang="x-default"]'),
        ).toHaveAttribute('href', SITE + (isId ? other : self));
        await expect(
          page.locator('meta[property="og:locale"]'),
        ).toHaveAttribute('content', locale);
        await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
          'content',
          SITE + self,
        );
      });
    }
  });

  test('the 404 answers in both languages', async ({ page }) => {
    // Cloudflare Pages serves this one file for any unknown path, including
    // /id/*, so an Indonesian visitor must not be stranded in English.
    const response = await page.goto('/definitely-not-a-page');
    expect(response?.status()).toBe(404);
    await expect(page.locator('body')).toContainText('Page not found');
    await expect(page.locator('body')).toContainText('Halaman tidak ditemukan');
  });
});

// Stage 2, Task 7. Design spec section 2: "The default, collapsed state must
// fit without scrolling on every device, phone included." Section 13: L-01
// through L-09 in docs/superpowers/plans/2026-08-06-classroom-groups-v2-
// test-traceability.md.
//
// L-05 ("no horizontal page scroll at any of those four widths, in any
// state") is NOT re-tested here as a fresh four-width loop -- that would
// duplicate real coverage rather than add any: task-4-brief.md's own Step 3
// already put a "no horizontal scroll at {width}px" sweep (four widths, both
// locales) and a "with Grouping options open" sweep (320/768) into
// classroom-groups-controls.spec.ts's 'classroom groups — mobile-first
// layout' describe block, both explicitly labelled L-05/L-06 in their own
// comment. Two near-identical loops asserting the same fact in two files is
// exactly the shape that lets one drift stale while the other gets fixed
// (the same reasoning this page's own `sectionState`/`resolveStudent`
// functions exist to avoid). This task instead EXTENDS that describe block
// with the two states it does not yet cover -- Sound & animation open (the
// section this task builds) and results on screen (nobody had checked that
// state at all) -- rather than forking a second measurement of the ones it
// already does.
//
// L-06 ("...including with Student details open and a 100-student roster
// loaded") is not testable in this stage: #cg-students-body has no content
// until stage 3 builds the roster table (src/components/pages/
// ClassroomGroupsPage.astro's own comment on why it renders empty).
// Re-homed to stage 3 Task 3, which already opens the roster at 320px --
// recorded here so the traceability row is not silently skipped.
//
// L-07 ("expanding a section is allowed to scroll vertically -- this is not
// a failure") has no dedicated assertion, on purpose: it is the complement
// of L-01..L-04 below, which measure ONLY the collapsed state. Nothing in
// this file asserts vertical fit once a section is open, so opening one and
// getting a taller page cannot redden anything here -- the rule is held by
// what these tests do NOT check, not by a check that would pass no matter
// what happened. Recorded so a reader does not go looking for a test that
// was never meant to exist.
test.describe('the no-scroll rule, measured', () => {
  // Ruling 1 (design spec section 2, "Amended 2026-08-08" -- an operator
  // ruling made after the numbers below were first measured, and corrected
  // again after a code review caught what the first version of this block
  // still got wrong): "fits one screen" means a teacher can see the *Make
  // groups* button without scrolling. That is a POSITION claim, not a
  // height claim. This block used to assert a height instead -- "tool
  // height" (#cg-howto's own top to #cg-go's own bottom) compared to
  // `window.innerHeight` -- and it was wrong in a way that stayed green: at
  // 1280x800 the tool's own height (652px) fits comfortably inside 800px,
  // so the old assertion passed, while `#cg-go` itself rendered at
  // `.bottom === 881`, 81px below the fold. A height number can be
  // satisfied by a tool pushed off-screen; a position cannot. What is
  // asserted below is `#cg-go`'s own `getBoundingClientRect().bottom`
  // against `window.innerHeight`, at scroll 0 -- direct, and it subsumes
  // the old height check rather than replacing it with an unrelated one.
  //
  // Ruling 1 also excludes the site-wide header and footer from the budget
  // this page is judged on -- "a page cannot be held to a budget it does
  // not control", and BaseLayout's <Header>/<Footer> render unconditionally
  // on every page this site has. That exclusion never covered this page's
  // OWN hero: the `h1`/`.lead`/`.privacy` block just above #cg-howto
  // (ClassroomGroupsPage.astro:70-72). This page's own stylesheet sets that
  // block's size and spacing, so it is not page furniture and nothing stops
  // an operator trimming it -- excluding it from the numbers below was
  // never what the ruling said, even though the old "#cg-howto top to
  // #cg-go bottom" span happened to exclude it too, as a side effect of
  // where the span started rather than a decision anyone made about the
  // hero.
  //
  // The position assertion below does not need a "top" to be correct --
  // `#cg-go`'s own bottom, at scroll 0, already reflects everything
  // rendered above it: header, hero and tool alike. But the table further
  // down still reports a page-height figure, for the numbers to mean
  // something to a reader, and that figure now starts at `#main`
  // (BaseLayout.astro) rather than `#cg-howto`. `#main` is the first
  // element below the site header -- it is also the skip-link's own
  // target, BaseLayout.astro's `<a class="skip-link" href="#main">` -- so
  // measuring from it counts the hero and excludes the header, exactly
  // what the ruling asks for. Measured DIRECTLY off real elements' own
  // `getBoundingClientRect()`, never by subtracting an estimated
  // header/footer height from `document.documentElement.scrollHeight` --
  // that subtraction was this block's own earlier approach and left an
  // unexplained ~55-65px residual at every width (see this file's git
  // history); direct measurement is the page's real rendered extent, not a
  // sum of parts chosen by hand.
  //
  // Each width is paired with its OWN real device height (design spec
  // section 2's own measurement table), not a uniform 800px for all four --
  // an iPhone SE is 568px tall, not 800, and a budget that does not exist
  // on the device is not a budget.
  //
  // Ruling 2, same amendment: How to use collapsed by default (reversing
  // section 3's original expanded-by-default) is now the tool's actual
  // landing state for a visitor with JavaScript, so reaching "the collapsed
  // default" needs no click here any more -- the previous version of this
  // loop clicked "How to use" first because collapsing it was the only way
  // to reach a state the page did not start in. (A visitor WITHOUT
  // JavaScript sees it open instead, by design -- ClassroomGroupsPage.astro's
  // own comment on `#cg-howto-body` has that reasoning. It does not change
  // what this block measures: every project this suite runs under has
  // JavaScript enabled.)
  //
  // Measured #main-to-#cg-go, the collapsed landing state, honestly.
  // RE-MEASURED after this stage's Task 8 deleted the naming/theme picker
  // fieldset ("Name the groups") -- the numbers below are that second
  // measurement, not the first, and not the arithmetic the paragraph after
  // the old table predicted:
  //
  //   width x height   #cg-go.bottom   budget    vs budget
  //   320x568          1221px          568px     653px OVER
  //   375x667          1191px          667px     524px OVER
  //   768x1024          707px          1024px    317px to spare
  //   1280x800          707px           800px     93px to spare
  //
  // Every width fell by exactly 174px (1395->1221, 1365->1191, 881->707 at
  // both wide widths) -- one fixed-height box leaving the flow, the same
  // saving regardless of viewport, which is what the pre-removal note
  // predicted and what re-measuring confirmed to the pixel. Nothing else
  // moved: the roster section this stage added is absent from the landing
  // state until a roster exists, so it costs nothing here.
  //
  // 768px and 1280x800 both fit now, neither on a technicality (317px and
  // 93px to spare). 1280x800 flips from `fixme` to a real `test` on this
  // measurement -- it was `fits: false` because 881px genuinely sat 81px
  // past an 800px fold, and it is `fits: true` now because the box that
  // put it there is gone, not because the check was weakened.
  //
  // 320px and 375px stay the furthest over by a wide margin, and stay
  // `fixme`: measured, not guessed, not weakened, not deleted. The picker
  // was the last always-visible bordered box available to delete; with it
  // gone, only an operator decision to trim the hero copy (h1/lead/
  // privacy), the collapsed section headers' own density, or the How to
  // use copy itself (ruled unchanged, section 2) would move the phone
  // numbers again. Nothing left in this stage's plan touches them.
  const VIEWPORTS = [
    { width: 320, height: 568, fits: false }, // iPhone SE
    { width: 375, height: 667, fits: false }, // iPhone 8
    { width: 768, height: 1024, fits: true }, // iPad
    { width: 1280, height: 800, fits: true }, // laptop -- see table above
  ];

  const measureFit = async (page: Page) => {
    await page.goto('/classroom-groups');
    const { bottom, budget } = await page.evaluate(() => ({
      bottom: Math.round(
        document.getElementById('cg-go')!.getBoundingClientRect().bottom,
      ),
      budget: window.innerHeight,
    }));
    expect(bottom).toBeLessThanOrEqual(budget);
  };

  for (const { width, height, fits } of VIEWPORTS) {
    // `test.fixme` for the three that still do not fit -- tracked, not
    // hidden; `test` for the one that genuinely passes. Written as an
    // explicit if/else, each branch opening with a literal `test(`/
    // `test.fixme(` token immediately followed by its own inline title --
    // rather than the earlier `const run = fits ? test : test.fixme;
    // run(title, ...)` indirection -- so a source scanner that attributes a
    // viewport call to its enclosing test by looking for exactly that
    // literal shape (tests/unit/viewport-tagging.test.ts, and any reader
    // grepping for `test(`) can find this declaration at all: neither an
    // aliased callee nor a title passed by variable reference is visible to
    // a scan like that -- tests/unit/viewport-tagging.test.ts's own
    // "aliased callee" synthetic test proves what that scan sees instead
    // (an actionable finding, not silence). `measureFit` above is the one
    // body the passing and failing cases still share, so they cannot drift
    // into checking two different things -- only the trivial two-line
    // wrapper that resizes the page and picks which registration function
    // to call is duplicated, and it carries no assertion of its own.
    if (fits) {
      test(
        `the tool fits without scrolling at ${width}x${height}`,
        { tag: '@emulated-viewport' },
        async ({ page }) => {
          await page.setViewportSize({ width, height });
          await measureFit(page);
        },
      );
    } else {
      test.fixme(
        `the tool fits without scrolling at ${width}x${height}`,
        { tag: '@emulated-viewport' },
        async ({ page }) => {
          await page.setViewportSize({ width, height });
          await measureFit(page);
        },
      );
    }
  }

  // The table above, and the `fits` flags it feeds, are hand-maintained --
  // written by re-measuring and pasting the numbers in, not computed by
  // this file. `test.fixme` bodies never run, so if a later change (stage
  // 3 removing the picker, or anything else) closes the gap at a viewport
  // still marked `fits: false`, nothing above would notice: the row would
  // stay silently skipped, describing a bug that is no longer there. A
  // hand-maintained table nothing ever re-checks is exactly how a
  // `test.fixme` row outlives the bug it was tracking. This companion test
  // re-measures all four, unconditionally -- never `fixme`'d -- and fails
  // the moment reality and the declared `fits` table disagree, in EITHER
  // direction: a viewport that starts passing while still marked `false`,
  // or one that starts failing while marked `true`. Either failure means
  // the table above is stale and needs updating by hand, the same way it
  // was written.
  test(
    'the declared fits table matches what the page actually does',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      const actual: Record<string, boolean> = {};
      for (const { width, height } of VIEWPORTS) {
        await page.setViewportSize({ width, height });
        await page.goto('/classroom-groups');
        const { bottom, budget } = await page.evaluate(() => ({
          bottom: Math.round(
            document.getElementById('cg-go')!.getBoundingClientRect().bottom,
          ),
          budget: window.innerHeight,
        }));
        actual[`${width}x${height}`] = bottom <= budget;
      }
      const declared = Object.fromEntries(
        VIEWPORTS.map(({ width, height, fits }) => [
          `${width}x${height}`,
          fits,
        ]),
      );
      expect(actual).toEqual(declared);
    },
  );

  // L-08. The brief's own literal query measured only what page LOAD
  // already shows -- nothing inside any of the four sections is on screen
  // until its own toggle is clicked, so a control that shipped at 30px
  // inside a collapsed body could never appear in `small`, no matter how
  // broken it was ("every interactive target" would have meant "every
  // interactive target visible before a teacher does anything"). Opening
  // every section first closes that gap, and makes this test
  // forward-compatible with stage 3/4 filling #cg-students-body/
  // #cg-io-body: whatever they add is already inside the loop that opens
  // every section, with no second sweep to remember to write.
  //
  // This does not replace the narrower 44px tests already in
  // classroom-groups-controls.spec.ts ('every control meets the 44px touch
  // target', 'the two sex switches meet the 44px touch target once open')
  // -- those exist to prove specific controls stay correct in isolation,
  // scoped so a move or a rename would be caught even if this broader sweep
  // somehow was not. This is the comprehensive gate the brief itself asks
  // for, sized to catch anything the narrower ones do not happen to cover.
  //
  // 320px only, not all four widths: every control on this page sizes off
  // `min-height`/`min-width` (fixed rem/px values -- see
  // ClassroomGroupsPage.astro's own styles) or `width: 100%` of its own
  // grid column, never off the viewport directly, and the >=768px grid only
  // changes how many COLUMNS sit side by side, not each column's own
  // min-height. Nothing on this page can be SMALLER at a wider viewport
  // than it is at the narrowest one, so 320px is the one width that can
  // actually catch a regression.
  // A native radio or checkbox on this page is deliberately drawn small
  // (`.radios input, .switch input { width/height: 1.15rem }` in
  // ClassroomGroupsPage.astro's own styles) -- its real tap target is the
  // `<label>` wrapping it, which carries the 44px `min-height`
  // (`.radios label, .switch { min-height: 44px }`), the same
  // whole-row-is-the-target pattern 'the two sex switches meet the 44px
  // touch target once open' (classroom-groups-controls.spec.ts) already
  // measures by calling `.closest('label')` rather than reading the input's
  // own rect. Measuring the bare `<input>` here at first found NINE
  // "failures" -- all six radios (mode/naming/leftovers) plus both sex
  // switches plus the new #cg-sound-check -- none of them a real defect,
  // every one of them a correctly-sized label wrapping a deliberately small
  // glyph. This walk now measures the SAME element a real tap would land
  // on: the label for a radio/checkbox, the element itself for everything
  // else. It can still fail for real: any control whose min-height/padding
  // regresses below 44px, radio/checkbox label included, still shows up.
  test(
    'every interactive target is at least 44px, collapsed and with every section open',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto('/classroom-groups');
      for (const id of ['cg-students', 'cg-grouping', 'cg-io', 'cg-sound']) {
        await page.locator(`#${id}-toggle`).click();
      }
      const small = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            'button, input, select, textarea, summary, a',
          ),
        ]
          .map((el) => {
            const isBoxControl =
              el instanceof HTMLInputElement &&
              (el.type === 'radio' || el.type === 'checkbox');
            const target = isBoxControl ? (el.closest('label') ?? el) : el;
            return {
              tag: el.tagName,
              id: el.id,
              r: target.getBoundingClientRect(),
            };
          })
          .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
          .map(({ tag, id }) => `${tag}#${id}`),
      );
      expect(small).toEqual([]);
    },
  );

  // L-09. The accent colour is the AA floor by design ("never lighten
  // without re-checking contrast", CLAUDE.md) -- this computes the REAL
  // painted contrast of the one button styled with it, the same
  // relative-luminance formula the 'the dim stays above the WCAG AA
  // contrast floor for normal text' test above already uses, rather than
  // pinning the hex value. A pinned hex would only prove the STRING did not
  // change, not what it renders as -- it would stay green even if
  // `--accent`/`--bg` in tokens.css were retuned to something that fails
  // AA. What would redden this: those custom properties moving closer
  // together, or `.actions button`'s own background/color rules drifting
  // from the variables entirely.
  test('the accent colour still meets the WCAG AA contrast floor', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    const contrast = await page.locator('#cg-go').evaluate((el) => {
      const style = getComputedStyle(el);
      const nums = (css: string) => css.match(/[\d.]+/g)!.map(Number);
      const [ir, ig, ib] = nums(style.color);
      const [br, bg, bb] = nums(style.backgroundColor);
      const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (r: number, g: number, b: number) =>
        0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const textLum = luminance(ir, ig, ib);
      const bgLum = luminance(br, bg, bb);
      const lighter = Math.max(textLum, bgLum);
      const darker = Math.min(textLum, bgLum);
      return (lighter + 0.05) / (darker + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  // M-11. The one test in this file that never touches /classroom-groups --
  // CLAUDE.md's "homepage ships zero JS" is a site-wide promise this task's
  // own work could put at risk only by accident (a shared layout partial, a
  // global script tag), so it earns a direct check rather than an inference
  // from the tool page's own tests passing.
  test('the homepage still ships no JavaScript', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url());
    });
    await page.goto('/');
    expect(scripts).toEqual([]);
  });
});
