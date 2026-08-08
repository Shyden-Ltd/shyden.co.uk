# Classroom Group Creator v2 — Stage 2: the compact layout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the page back onto the rewritten engine, move How to use above the tool, and make the collapsed default fit one screen — with every section header reporting its own state.

**Architecture:** `ClassroomGroupsPage.astro` renders the structure; `classroom-groups.ts` wires it. Section state strings are computed by **one function with one input**, so a header can never disagree with the thing it describes. Staleness lands here as a small state machine, because the controls that can invalidate a shuffle — group size, mode, leftovers, the sex switches — all exist by the end of this stage; stage 3 adds roster edits as further triggers to the **same** machine rather than a second one.

**Tech Stack:** Astro, TypeScript, Vitest, Playwright. No new dependencies.

**Depends on:** Stage 1 complete and merged. **The page does not work until this stage lands** — stage 1 changed `GroupingInput` and the script still calls the old shape. There is no type checker here, so nothing warns you; the page throws at runtime. Neither stage is deployed alone.

**Traceability:** ticks rows **L-01…L-05, L-07…L-11, H-01…H-08, S-01…S-10, B-01, G-01, G-02, G-05, G-06, G-19, E-01…E-04, E-12, E-13, E-14, E-18, E-19, K-06…K-09, M-10, Y-05** in `2026-08-06-classroom-groups-v2-test-traceability.md`.

## Global Constraints

- **Mobile-first.** Base CSS is small-screen; enhance up. Never the reverse.
- **No horizontal scroll at ≥320px, in any state.** Touch targets ≥44px. WCAG AA.
- **Accent `#0A7D66` is the AA floor** — never lightened without re-checking contrast.
- **The homepage still ships zero JS.** Only this page and `/glory-points` have scripts.
- **Whitespace between two nodes survives only while they share a line.** Assemble sentences in the frontmatter or write `{' '}`. Never rejoin lines — prettier re-wraps them and silently changes what the page says. `tests/e2e/rendered-text.spec.ts` scans for this and must stay green.
- **Locale files are a review surface.** Every string in `en.ts` **and** `id.ts`. `i18n.test.ts` and `dead-copy.test.ts` are what actually hold this up; there is no type checker.
- **The e2e suite measures `dist/`.** Assertions against `astro dev` are about bytes nobody receives.
- **Assert whole rendered sentences**, in both locales. Never a tag count.
- **No `waitForTimeout`; no `expect(await x.count())`.**
- Tests observed RED first. Commit per task.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/components/pages/ClassroomGroupsPage.astro` | Structure and copy. Modified throughout. |
| `src/scripts/classroom-groups.ts` | DOM wiring only. Rewired to the new engine in Task 1. |
| `src/lib/sections.ts` | **New.** Pure: turns tool state into the four header state strings. Pure because a string that must match a locale file is exactly what a unit test can pin and an e2e test cannot. |
| `src/lib/i18n/en.ts`, `id.ts` | Copy. Keys removed in Task 1, added in Tasks 2–5. |
| `tests/unit/sections.test.ts` | **New.** |
| `tests/e2e/classroom-groups*.spec.ts` | Extended. Cases for removed controls deleted in Task 1. |

---

## Task 1: Rewire the page to the new engine

Nothing else can be tested until the page runs again.

> **⚠️ THE BRANCH DOES NOT BUILD WHEN YOU START. This is expected — verify it, then fix it.**
>
> Stage 1 changed the engine's contract; this task is where the page catches up. Until it does:
>
> ```
> [ERROR] [vite] ✗ Build failed
> [MISSING_EXPORT] "parseKeepApart" is not exported by "src/lib/grouping.ts"
>     src/scripts/classroom-groups.ts:11
> ```
>
> **First step, before writing anything: run `npm run build` and confirm it fails with exactly
> that error.** If it fails differently, something happened that stage 1 did not intend, and you
> should stop and report rather than fix past it.
>
> Because `playwright.config.ts` builds `dist/` before running, **the entire e2e suite has been
> unavailable throughout stage 1** — eleven tasks landed with unit cover only. The first green
> `npm run build` is therefore also the first moment anything can be checked end-to-end since
> then. Expect e2e failures that have nothing to do with your own work, and triage them as
> stage-1 debt surfacing rather than as breakage you caused.
>
> **Do not delete or weaken an e2e assertion to get the suite green.** The engine is what changed;
> the promises the page makes to a teacher did not. If an assertion can no longer be satisfied,
> that is a finding to report, not a line to remove.

**Files:**
- Modify: `src/scripts/classroom-groups.ts`, `ClassroomGroupsPage.astro`, `en.ts`, `id.ts`
- Modify: `tests/e2e/classroom-groups.spec.ts`, `classroom-groups-controls.spec.ts`

**Interfaces:**
- Consumes: stage 1's `GroupingInput { students, mode, leftovers, sexMode, pinned, random }`
- Produces: a page that shuffles anonymous students again

- [ ] **Step 1: Write the failing test**

In `tests/e2e/classroom-groups.spec.ts`:

```ts
test('shuffles anonymous students against the rewritten engine', async ({ page }) => {
  await page.goto('/classroom-groups');
  await page.getByLabel('How many students?').fill('12');
  await page.getByRole('button', { name: 'Make groups' }).click();
  await expect(page.locator('#cg-groups .group')).toHaveCount(3);
});

test('the paste-names box and the keep-apart box are gone', async ({ page }) => {
  await page.goto('/classroom-groups');
  await expect(page.locator('#cg-names')).toHaveCount(0);
  await expect(page.locator('#cg-apart')).toHaveCount(0);
});
```

- [ ] **Step 2: Run and watch it fail**

```
npx playwright test classroom-groups.spec.ts --project=chromium
```

Expected: FAIL. The first throws in the page script (`keepApart` is not a property the engine reads, and `parseKeepApart` no longer exists to import); the second finds both textareas present.

- [ ] **Step 3: Remove the two controls that feed deleted inputs**

**Why here and not stage 3, where §14 puts the removals:** these two are not cosmetic. `#cg-names` supplies `students: string[]` and `#cg-apart` supplies `keepApart` — both deleted in stage 1. A control whose value has nowhere to go is worse than a missing one, because it silently does nothing. The themes and the naming radio only affect group *labels*, so they wait for stage 3 as planned.

In `ClassroomGroupsPage.astro`, delete the blocks containing `#cg-names`, `#cg-names-help`, `#cg-apart`, `#cg-apart-help`, `#cg-apart-hint` and their labels.

In `en.ts` **and** `id.ts`, delete: `namesLabel`, `namesHelp`, `keepApartHeading`, `keepApartLabel`, `keepApartHelp`, `keepApartNeedsNamesHint`.

- [ ] **Step 4: Rewire the script**

In `classroom-groups.ts`, the input construction becomes:

```ts
const outcome = buildGroups({
  students: count,                 // a number until stage 3 gives us a roster
  mode,
  leftovers: readRadio('leftovers') === 'bunch' ? 'bunch' : 'spread',
  sexMode: 'off',                  // Task 4 wires the switches
  pinned: [],                      // stage 3 wires the pins
  random: Math.random,
});
```

Delete the `parseKeepApart` import and its call site. Update the error renderer: delete the branches for `KEEP_APART_NEEDS_NAMES` and `KEEP_APART_UNKNOWN_NAME`, and **add a branch for every new code stage 1 introduced** — `DUPLICATE_NUMBER`, `TOGETHER_UNIT_TOO_LARGE`, `TOGETHER_APART_CLASH`, `SEX_NEEDS_ALL_SET`, `SEX_SEPARATE_SPLITS_UNIT`, `PINNED_SPLITS_UNIT`.

> Several of those cannot be reached until stage 3 puts a roster on the page. Render them anyway, with real copy in both locales. An unhandled code falling through to a blank message is a silent failure, and the stage that makes it reachable will not think to check.

Handle the new `warnings` array — for now, render nothing and leave a comment pointing at Task 4. **Do not** drop it silently without the comment.

- [ ] **Step 5: Delete the tests for the removed controls**

Every case in the e2e suites that types into `#cg-names` or `#cg-apart`. Delete them; do not skip them.

- [ ] **Step 6: Run**

```
npm run test:unit && npx playwright test --project=chromium; echo "exit=$?"
```

Expected: pass, `exit=0`. `dead-copy.test.ts` will fail if a deleted key is still referenced — that is it doing its job.

- [ ] **Step 7: Commit**

```bash
git add -u src/ tests/
git commit -m "refactor(classroom): rewire the page to the rewritten engine

Stage 1 changed GroupingInput and there is no type checker here, so the
page has been throwing at runtime since. Rewired, with sexMode off and
no pins until later stages supply them.

The paste-names box and the free-text keep-apart box go now rather than
in stage 3: they feed inputs the engine no longer has, and a control
whose value has nowhere to go is worse than a missing one. Every new
error code gets a rendered message in both locales even where it is not
yet reachable -- an unhandled code renders blank, and the stage that
makes it reachable will not think to look."
```

---

## Task 2: How to use, above the tool

**Files:**
- Modify: `ClassroomGroupsPage.astro`, `classroom-groups.ts`, `en.ts`, `id.ts`
- Modify: `tests/e2e/classroom-groups-controls.spec.ts`

**Traceability:** H-01…H-08, Y-05

- [ ] **Step 1: Write the failing tests**

```ts
test.describe('How to use', () => {
  test('sits above the form and outside the tool sections', async ({ page }) => {
    await page.goto('/classroom-groups');
    const howTo = page.locator('#cg-howto');
    const form = page.locator('#cg-form');
    const hy = (await howTo.boundingBox())!.y;
    const fy = (await form.boundingBox())!.y;
    expect(hy).toBeLessThan(fy);
    // and it is not one of the tool's collapsible sections
    await expect(form.locator('#cg-howto')).toHaveCount(0);
  });

  // Amended after design spec section 2's operator ruling 2 (2026-08-08):
  // "expanded by default" reversed to "collapsed by default" once
  // measurement showed how much of a phone screen the intro paragraph and
  // three steps cost. A later code review folded in a further amendment:
  // the raw markup ships EXPANDED regardless (see ClassroomGroupsPage.astro's
  // own comment on `#cg-howto-body`), so a visitor without JavaScript can
  // still read the who/why paragraph -- collapsed is what a script running
  // in THIS test actually produces, opened here before asserting on it.
  test('holds both parts and starts collapsed', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.getByRole('button', { name: 'How to use' }).click();
    // The whole sentence, and it must name WHO and WHY -- not just what.
    await expect(page.getByText(
      'Built for teachers, by Shyden. Splitting a class fairly takes time you do not have, and doing it by hand invites an argument about favourites. This does it in one press — free, with no sign-up, and with nothing about your class ever leaving your browser.'
    )).toBeVisible();
    await expect(page.getByText('Say how many students are in your class.')).toBeVisible();
  });

  test('both parts collapse together, and the header survives', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.getByRole('button', { name: 'How to use' }).click();
    await expect(page.getByText('Say how many students are in your class.')).toBeHidden();
    await expect(page.getByText('Built for teachers, by Shyden.')).toBeHidden();
    await expect(page.getByRole('button', { name: 'How to use' })).toBeVisible();
  });

  test('the collapsed state survives a reload', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.getByRole('button', { name: 'How to use' }).click();
    await page.reload();
    await expect(page.getByText('Say how many students are in your class.')).toBeHidden();
    await expect(page.getByRole('button', { name: 'How to use' })).toBeVisible();
  });

  test('only the preference is stored, never class data', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.getByLabel('How many students?').fill('12');
    await page.getByRole('button', { name: 'How to use' }).click();
    const stored = await page.evaluate(() => ({ ...localStorage }));
    expect(Object.values(stored).join(' ')).not.toContain('12');
    expect(Object.keys(stored)).toContain('cg-howto-collapsed');
    // Every key this page writes starts `cg-`, and none of them may carry class
    // data. Asserting the EXACT list here would be a false economy: stage 5 adds
    // four print preferences and would break a test that is not about printing.
    expect(Object.keys(stored).every((k) => k.startsWith('cg-'))).toBe(true);
  });
});
```

Mirror all five for `/id/classroom-groups` with the Indonesian sentences.

- [ ] **Step 2: Run and watch them fail**

```
npx playwright test classroom-groups-controls.spec.ts --project=chromium -t 'How to use'
```

Expected: 5 failed — `#cg-howto` does not exist; the how-to is currently a section inside the form.

- [ ] **Step 3: Implement**

In the Astro page, above `<form id="cg-form">`:

A bare `<button>` carries no heading role, so wrap it in an `<h2>` — matching this page's own `#cg-results-h` and glory-points' `#how-to-heading` — or a screen-reader user loses heading navigation to this section (a stage-2 review caught this snippet shipping without it).

```astro
<section id="cg-howto" class="howto">
  <h2>
    <button
      type="button"
      class="howto-toggle"
      id="cg-howto-toggle"
      aria-expanded="true"
      aria-controls="cg-howto-body"
    >{t.howToHeading}</button>
  </h2>
  <div id="cg-howto-body" class="howto-body">
    <p>{t.howToWhat}</p>
    <ol>{t.howToSteps.map((s) => <li>{s}</li>)}</ol>
  </div>
</section>
```

New keys in both locales:

```ts
// en.ts
howToHeading: 'How to use',
// Part 1 must say WHO it is for and WHY it was built, not only what it does --
// an explicit operator instruction. See spec section 3, which carries the
// approved copy. Assemble with `+` here; never across template lines.
howToWhat:
  'Built for teachers, by Shyden. Splitting a class fairly takes time you do ' +
  'not have, and doing it by hand invites an argument about favourites. This ' +
  'does it in one press — free, with no sign-up, and with nothing about your ' +
  'class ever leaving your browser.',
howToSteps: [
  'Say how many students are in your class.',
  'Choose how to split them.',
  'Press Make groups.',
],
```

> `howToWhat` is **assembled in the locale file with `+`**, not written across lines in the template. This is the seam that has already shipped three broken sentences: whitespace between two nodes survives only while they share a line, and prettier re-wraps them.

Wire the toggle:

```ts
const HOWTO_KEY = 'cg-howto-collapsed';
const toggle = byId<HTMLButtonElement>('cg-howto-toggle');
const body = byId<HTMLElement>('cg-howto-body');
if (toggle && body) {
  const collapsed = remember.read(HOWTO_KEY) === '1';
  const apply = (isCollapsed: boolean) => {
    body.hidden = isCollapsed;
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
  };
  apply(collapsed);
  toggle.addEventListener('click', () => {
    const next = !body.hidden;
    apply(next);
    remember.write(HOWTO_KEY, next ? '1' : '0');
  });
}
```

`remember` already exists in this file, wrapping `localStorage` in try/catch. Reuse it.

- [ ] **Step 4: Run and watch them pass**

```
npx playwright test classroom-groups-controls.spec.ts --project=chromium
```

- [ ] **Step 5: Commit**

```bash
git add -u src/ tests/
git commit -m "feat(classroom): How to use moves above the tool

It is the page's summary and description, not a feature, so it sits
above the form and outside the tool's sections. Both parts collapse
together under one header, the header survives the collapse, and the
state is remembered -- a tick, not a child.

howToWhat is assembled in the locale file rather than across template
lines. That seam has already shipped three broken sentences here."
```

---

## Task 3: The four sections, and one function that names their state

**Files:**
- Create: `src/lib/sections.ts`, `tests/unit/sections.test.ts`
- Modify: `ClassroomGroupsPage.astro`, `classroom-groups.ts`, `en.ts`, `id.ts`

**Traceability:** S-01…S-10, L-10, L-11

**Interfaces:**
- Produces:
  ```ts
  export interface ToolState {
    named: number; absent: number; together: number; apart: number;
    rosterSize: number;
    sexMode: SexMode; leftovers: Leftovers;
    dirty: boolean;
  }
  export function sectionState(state: ToolState, t: Strings): {
    studentDetails: string; groupingOptions: string; importExport: string;
  };
  ```

> **`dirty` needs an owner, and it is not this stage.** Nothing here can make it true — a roster is
> what gets lost, and there is no roster until stage 3. It is declared now because `ToolState` is
> defined now, and it is **wired in stage 3 Task 1** to exactly one rule:
>
> - **true** when the roster is non-empty and has changed since the last export or import
> - **false** on load, after any export, and after an import
>
> Stage 3 writes that rule and its tests. Until then `sectionState` reads a field that is always
> `false`, which is honest — there is genuinely nothing to save yet.

- [ ] **Step 1: Write the failing unit tests**

```ts
describe('section header states', () => {
  const empty: ToolState = {
    named: 0, absent: 0, together: 0, apart: 0, rosterSize: 0,
    sexMode: 'off', leftovers: 'spread', dirty: false,
  };

  it('says nothing is added when the roster is empty', () => {
    expect(sectionState(empty, en).studentDetails).toBe('none added');
  });

  it('counts names', () => {
    expect(sectionState({ ...empty, rosterSize: 24, named: 24 }, en).studentDetails)
      .toBe('24 named');
  });

  it('adds absences', () => {
    expect(sectionState({ ...empty, rosterSize: 24, named: 24, absent: 2 }, en).studentDetails)
      .toBe('24 named · 2 absent');
  });

  it('adds the letters, in a fixed order', () => {
    expect(sectionState(
      { ...empty, rosterSize: 24, named: 24, absent: 2, together: 2, apart: 1 }, en,
    ).studentDetails).toBe('24 named · 2 absent · 2 together · 1 apart');
  });

  it('reports grouping options', () => {
    expect(sectionState({ ...empty, sexMode: 'mix' }, en).groupingOptions)
      .toBe('mixed by sex');
    expect(sectionState({ ...empty, sexMode: 'mix', leftovers: 'bunch' }, en).groupingOptions)
      .toBe('mixed by sex · leftovers in one group');
    expect(sectionState(empty, en).groupingOptions).toBe('none');
  });

  it('warns permanently once anything is unsaved', () => {
    expect(sectionState(empty, en).importExport).toBe('nothing to save yet');
    expect(sectionState({ ...empty, dirty: true }, en).importExport)
      .toBe('unsaved changes — export to keep them');
  });

  it('produces the Indonesian strings from the Indonesian table', () => {
    expect(sectionState({ ...empty, rosterSize: 24, named: 24, absent: 2 }, id).studentDetails)
      .toBe('24 diberi nama · 2 tidak hadir');
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```
npx vitest run tests/unit/sections.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `src/lib/sections.ts`**

```ts
/**
 * The four collapsed headers' state strings.
 *
 * Pure, and one function, because the failure this prevents is a header that
 * disagrees with the thing it describes -- and that only happens when two
 * places compute the same sentence. A unit test can pin every branch of this
 * against both locale tables; an end-to-end test can only ever sample it.
 */
export function sectionState(state: ToolState, t: Strings) {
  const parts: string[] = [];
  if (state.rosterSize === 0) parts.push(t.stateNoneAdded);
  else {
    if (state.named > 0) parts.push(t.stateNamed(state.named));
    if (state.absent > 0) parts.push(t.stateAbsent(state.absent));
    if (state.together > 0) parts.push(t.stateTogether(state.together));
    if (state.apart > 0) parts.push(t.stateApart(state.apart));
    if (parts.length === 0) parts.push(t.stateAdded(state.rosterSize));
  }

  const opts: string[] = [];
  if (state.sexMode === 'mix') opts.push(t.stateMixed);
  if (state.sexMode === 'separate') opts.push(t.stateSeparated);
  if (state.leftovers === 'bunch') opts.push(t.stateBunched);

  return {
    studentDetails: parts.join(' · '),
    groupingOptions: opts.length ? opts.join(' · ') : t.stateNone,
    importExport: state.dirty ? t.stateUnsaved : t.stateNothingToSave,
  };
}
```

Add every `state*` key to both locale files. The counted ones are functions: `stateNamed: (n: number) => \`${n} named\``.

- [ ] **Step 4: Render the four sections**

**Corrected during implementation.** This step originally said "four `<details>`-shaped blocks", and Task 4/Task 7 below originally located them with `page.locator('#cg-grouping summary')` — a native `<details><summary>`. That is a SECOND collapsible pattern on this page: `#cg-howto` (Task 2) already had one, and Task 2's own fix round found a real defect in it — a bare `<button>` toggle loses the heading role the old markup had, so a screen-reader user can no longer reach the section by heading navigation. The fix there was `<h2><button aria-expanded aria-controls>`, not `<details>`. Two accessible patterns for the same kind of control on one page is how the second one ships with the first one's already-fixed defect. Use the SAME pattern `#cg-howto` uses, not `<details>` — same heading level (`<h2>`, matching `#cg-howto` and `#cg-results-h`, checked against the page's own usage rather than assumed), same `aria-expanded`/`aria-controls` wiring, same "only the body ever gets `hidden`, the toggle never hides itself" rule. Task 4 and Task 7 below are corrected to match (their `summary` locators would otherwise match nothing).

One component pattern — id, heading, `<span class="state">`, body — for `cg-students`, `cg-grouping`, `cg-io`, `cg-sound`. Grid two-by-two at ≥768px via CSS grid; stacked below.

`cg-students` and `cg-io` render an empty body plus a "coming in a later stage" — **no.** Render them **collapsed with their state string and no body content at all**; a body that says "not built yet" would ship to production if a stage slipped. Stage 3 and stage 4 fill them.

**`cg-grouping` is ALSO empty at the end of this task, not just the two above** — Task 4 below is what moves the leftovers fieldset in, and its own RED prediction ("3 failed — the section is empty and the leftovers radios still sit in the top-level form") already says so; this step should not be read as asking for that move too.

**`cg-sound` is not built by this task at all — corrected, with a reason.** The existing sound/speed fieldset already has a live, tested checkbox at `id="cg-sound"` (five e2e assertions across `classroom-groups.spec.ts`, `classroom-groups-controls.spec.ts` and `classroom-groups-privacy.spec.ts` use it). A fourth section sharing that literal id with its wrapper is a duplicate id, but a different id would not itself fix the real problem: that fieldset already renders `<legend>{t.playbackHeading}</legend>` — "Sound and animation" — with every control inside it already visible. An empty `cg-sound`-shaped shell wrapped around or beside it, whatever id it used (`cg-sound`, `cg-playback`, anything), would put a *second* "Sound and animation" heading on the page for content the fieldset already shows in full — worse than not building it. The real fix folds the existing fieldset into the same `<h2><button>` pattern the other three sections use, removing its `<legend>` rather than merely renaming its checkbox; that still ripples into those three spec files and `tests/dev/dev-sanity.spec.ts` (`#cg-speed`), out of this task's own file list and untested by anything this task or Task 4 actually asserts (no traceability row below names a Sound & animation state string; `sectionState`'s own interface returns three fields, not four). Left for whichever task finally gives sound its own section and makes that restructuring deliberately, rather than as a side effect of this one.

- [ ] **Step 5: Write the e2e assertions**

```ts
test('every header reports its own state', async ({ page }) => {
  await page.goto('/classroom-groups');
  await expect(page.locator('#cg-students .state')).toHaveText('none added');
  await expect(page.locator('#cg-grouping .state')).toHaveText('none');
  await expect(page.locator('#cg-io .state')).toHaveText('nothing to save yet');
});

test('sections sit two-by-two on a laptop and stacked on a phone', async ({ page }) => {
  await page.goto('/classroom-groups');
  await page.setViewportSize({ width: 1280, height: 900 });
  const a = (await page.locator('#cg-students').boundingBox())!;
  const b = (await page.locator('#cg-grouping').boundingBox())!;
  expect(b.y).toBeCloseTo(a.y, 0);          // same row
  await page.setViewportSize({ width: 320, height: 800 });
  const c = (await page.locator('#cg-students').boundingBox())!;
  const d = (await page.locator('#cg-grouping').boundingBox())!;
  expect(d.y).toBeGreaterThan(c.y);          // stacked
});
```

- [ ] **Step 6: Run both suites, then commit**

```bash
npm run test:unit && npx playwright test --project=chromium; echo "exit=$?"
git add -u src/ tests/ && git add src/lib/sections.ts tests/unit/sections.test.ts
git commit -m "feat(classroom): four sections, each reporting its own state

One pure function computes all four strings, because a header that
disagrees with what it describes only happens when two places compute
the same sentence. A unit test pins every branch against both locale
tables; an e2e test could only sample it.

The two sections later stages fill render collapsed with their state and
no body. A body saying \"not built yet\" ships to production if a stage
slips."
```

---

## Task 4: Grouping options — the sex switches and leftovers

**Files:**
- Modify: `ClassroomGroupsPage.astro`, `classroom-groups.ts`, `en.ts`, `id.ts`

**Traceability:** G-01, G-02, G-05, G-06, G-19, G-11 (rendering the warning)

- [ ] **Step 1: Write the failing tests**

```ts
test.describe('Grouping options', () => {
  test('holds both sex switches and the leftovers choice', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-grouping-toggle').click();
    await expect(page.getByLabel('Mix boys and girls evenly')).toBeVisible();
    await expect(page.getByLabel('Keep boys and girls separate')).toBeVisible();
    await expect(page.getByText('If students are left over')).toBeVisible();
    await expect(page.getByLabel('Share them out evenly')).toBeChecked();
  });

  test('both switches are off by default', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-grouping-toggle').click();
    await expect(page.getByLabel('Mix boys and girls evenly')).not.toBeChecked();
    await expect(page.getByLabel('Keep boys and girls separate')).not.toBeChecked();
  });

  test('with no list at all, both are disabled and say why', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.locator('#cg-grouping-toggle').click();
    await expect(page.getByLabel('Mix boys and girls evenly')).toBeDisabled();
    await expect(page.getByText(
      'Add your students in Student details and set M or F for each to use these.'
    )).toBeVisible();
  });

  test('a separate-mode spillover warning renders, naming who', async ({ page }) => {
    // Driven through the page rather than the engine: this asserts the message
    // reaches the teacher, which is the part the engine cannot prove.
    await page.goto('/classroom-groups');
    // …roster fixture arrives in stage 3; until then this test is skipped with
    // a reason that names the stage. See Step 4.
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```
npx playwright test --project=chromium -t 'Grouping options'
```

Expected: 3 failed — the section is empty and the leftovers radios still sit in the top-level form.

- [ ] **Step 3: Implement**

Move the existing leftovers `<fieldset>` from the form body into `#cg-grouping`'s body **without changing its markup, its name attribute or its four locale keys** — this control is live and works; it is being rehomed, not rewritten.

Add the two checkboxes plus a `<p class="why" id="cg-sex-why">` that carries the disabled reason. Both start `disabled`, because with no roster nobody has a sex.

```ts
const sexWhy = (roster: Student[] | null, t: Strings): string | null => {
  if (roster === null || roster.length === 0) return t.sexWhyNoList;
  const grouped = roster.filter((s) => !s.absent);
  const unset = grouped.filter((s) => s.sex === null);
  if (unset.length === 0) return null;
  return t.sexWhyUnset(unset.length, grouped.length);
};
```

> Returning `null` for "enabled" rather than an empty string is deliberate: `if (why)` then reads correctly, and an empty string that means "fine" is the kind of stringly-typed signal that gets tested as truthy by accident.

Wire it so the reason is rendered whenever the switches are disabled — **never a bare disabled control**.

- [ ] **Step 4: Mark the roster-dependent cases explicitly**

The spillover test cannot run until stage 3 supplies a roster. **Do not delete it and do not leave it silently passing.**

```ts
test.fixme('a separate-mode spillover warning renders, naming who',
  async ({ page }) => { /* … */ });
// fixme, not skip: fixme fails the run if it starts passing, which is exactly
// what should happen the moment stage 3 lands. A silent skip would not.
```

Add a row to the traceability matrix noting G-11 is owed by stage 3.

- [ ] **Step 5: Run, then commit**

```bash
npx playwright test --project=chromium; echo "exit=$?"
git add -u src/ tests/
git commit -m "feat(classroom): Grouping options holds the sex switches and leftovers

The leftovers control is rehomed, not rewritten -- same markup, same
name, same four locale keys. It works today and this stage is about
where it lives.

Both sex switches start disabled, because with no roster nobody has a
sex, and the reason is rendered beside them. A disabled control that
does not say why is the defect this design keeps catching."
```

---

## Task 5: Class name, and the results heading

**Files:** `ClassroomGroupsPage.astro`, `classroom-groups.ts`, `en.ts`, `id.ts`
**Traceability:** E-01…E-04

- [ ] **Step 1: Write the failing tests**

```ts
test('the class name heads the results, once', async ({ page }) => {
  await page.goto('/classroom-groups');
  await page.getByLabel('Class (optional)').fill('7B');
  await page.getByLabel('How many students?').fill('9');
  await page.getByRole('button', { name: 'Make groups' }).click();
  await expect(page.locator('#cg-results-h')).toHaveText('7B — your groups');
  // not repeated on the cards
  await expect(page.locator('#cg-groups').getByText('7B')).toHaveCount(0);
});

test('a blank class name blocks nothing', async ({ page }) => {
  await page.goto('/classroom-groups');
  await page.getByLabel('How many students?').fill('9');
  await page.getByRole('button', { name: 'Make groups' }).click();
  await expect(page.locator('#cg-results-h')).toHaveText('Your groups');
  await expect(page.locator('#cg-groups .group')).toHaveCount(3);
});

test('groups are always numbered', async ({ page }) => {
  await page.goto('/classroom-groups');
  await page.getByLabel('How many students?').fill('9');
  await page.getByRole('button', { name: 'Make groups' }).click();
  await expect(page.locator('#cg-groups .group h3').first()).toHaveText('Group 1');
});
```

- [ ] **Step 2: Run, watch fail, implement**

Add `<input id="cg-class">` to the top row. The heading is assembled in **one place**:

```ts
const resultsHeading = (className: string, t: Strings): string =>
  className.trim() === '' ? t.resultsHeading : t.resultsHeadingNamed(className.trim());
```

- [ ] **Step 3: Run, commit**

```bash
git add -u src/ tests/
git commit -m "feat(classroom): an optional class name, heading the results once

Blank is fine and blocks nothing. The heading is assembled in one place
so the named and unnamed forms cannot drift apart, and it is not
repeated on every card."
```

---

## Task 6: Staleness

The machine that stage 3 will extend rather than duplicate.

**Files:** `classroom-groups.ts`, `en.ts`, `id.ts`
**Traceability:** E-12, E-13, E-14, E-18, E-19

- [ ] **Step 1: Write the failing tests**

```ts
test.describe('out-of-date groups', () => {
  const shuffle = async (page) => {
    await page.getByLabel('How many students?').fill('12');
    await page.getByRole('button', { name: 'Make groups' }).click();
    await expect(page.locator('#cg-groups .group')).toHaveCount(3);
  };

  test('changing the group size marks them out of date, naming the change', async ({ page }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students per group').fill('3');
    await expect(page.getByText('These groups are out of date — the group size changed.'))
      .toBeVisible();
  });

  test('changing the leftovers choice marks them out of date', async ({ page }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Put them all in one group').check();
    await expect(page.getByText('These groups are out of date — the leftovers choice changed.'))
      .toBeVisible();
  });

  test('the class name does NOT mark them out of date', async ({ page }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Class (optional)').fill('7B');
    await expect(page.getByText('out of date')).toHaveCount(0);
    await expect(page.locator('#cg-results-h')).toHaveText('7B — your groups');
  });

  test('the old groups stay visible while stale', async ({ page }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students per group').fill('3');
    await expect(page.locator('#cg-groups .group')).toHaveCount(3);
  });

  test('shuffling clears it', async ({ page }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students per group').fill('3');
    await page.getByRole('button', { name: 'Make groups' }).click();
    await expect(page.getByText('out of date')).toHaveCount(0);
  });

  test('undoing the change clears it', async ({ page }) => {
    await page.goto('/classroom-groups');
    await shuffle(page);
    await page.getByLabel('Students per group').fill('3');
    await page.getByLabel('Students per group').fill('4');
    await expect(page.getByText('out of date')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run, watch all six fail**

- [ ] **Step 3: Implement**

```ts
/**
 * What the groups on screen were made from.
 *
 * Staleness is a comparison, not a flag. A flag has to be cleared by every
 * code path that could undo the change, and the one that forgets is the bug --
 * so "the teacher put the size back to 4" would leave a badge saying the
 * groups are wrong when they are not.
 */
interface Snapshot { mode: string; leftovers: Leftovers; sexMode: SexMode; roster: string; }

const snapshot = (): Snapshot => ({
  mode: JSON.stringify(readMode()),
  leftovers: readLeftovers(),
  sexMode: readSexMode(),
  roster: '',            // stage 3 fills this; '' is honest until then
});

const staleReason = (then: Snapshot, now: Snapshot, t: Strings): string | null => {
  if (then.mode !== now.mode) return t.staleMode;
  if (then.leftovers !== now.leftovers) return t.staleLeftovers;
  if (then.sexMode !== now.sexMode) return t.staleSexMode;
  if (then.roster !== now.roster) return t.staleRoster;
  return null;
};
```

Recompute on every `change` and `input` event on the form; render the badge and add `.stale` to `#cg-results`.

> **Comparison, not a flag** is the whole point of this task, and the reason the "undoing the change clears it" test exists. It is also what lets stage 3 add roster edits by filling one field of `Snapshot` rather than finding every place that sets a flag.

- [ ] **Step 4: Run, commit**

```bash
git add -u src/ tests/
git commit -m "feat(classroom): groups go out of date when their inputs change

Staleness is a comparison against a snapshot taken at shuffle time, not
a flag. A flag has to be cleared by every path that could undo the
change, and the path that forgets is the bug -- putting the group size
back to 4 would leave a badge saying the groups are wrong when they are
not.

The class name is deliberately not a trigger: it is cosmetic, and nobody
moved. Stage 3 adds roster edits by filling one field of the snapshot
rather than finding every place that sets a flag."
```

---

## Task 7: The no-scroll rule, measured

**Files:** `tests/e2e/classroom-groups.spec.ts`
**Traceability:** L-01…L-09, M-10, M-11

- [ ] **Step 1: Write the tests**

> **`cg-sound` does not exist yet, and will not by the time this task runs either.** Task 3's own
> Step 4 (corrected) explains why: it is not just an id collision with the existing sound/speed
> fieldset's checkbox, but that fieldset already rendering the section's whole heading and
> content — building the real fourth section is a restructuring, not a rename, and is left for its
> own task. The loop below covers `cg-grouping` only. The matching no-scroll and 44px coverage for
> `cg-sound` is not dropped — it is carried as owed work in this doc's own Self-review, under
> Linkage out, until whichever task finally builds that section picks it up.

```ts
const WIDTHS = [320, 375, 768, 1280];

for (const width of WIDTHS) {
  test(`collapsed default fits without scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/classroom-groups');
    await page.getByRole('button', { name: 'How to use' }).click();   // the regular's view
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollHeight - window.innerHeight);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test(`no horizontal scroll at ${width}px, in any state`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/classroom-groups');
    const check = async (label: string) => {
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, label).toBeLessThanOrEqual(0);
    };
    await check('collapsed');
    for (const id of ['cg-grouping']) {
      await page.locator(`#${id}-toggle`).click();
      await check(id);
    }
    await page.getByLabel('How many students?').fill('120');
    await page.getByRole('button', { name: 'Make groups' }).click();
    await check('with results');
  });
}

test('every interactive target is at least 44px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/classroom-groups');
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, input, select, textarea, summary, a')]
      .map((el) => ({ tag: el.tagName, id: el.id, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
      .map(({ tag, id }) => `${tag}#${id}`));
  expect(small).toEqual([]);
});

test('the homepage still ships no JavaScript', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
  await page.goto('/');
  expect(scripts).toEqual([]);
});
```

- [ ] **Step 2: Run across every project**

```
npx playwright test classroom-groups.spec.ts; echo "exit=$?"
```

All five projects. **Read the exit code, not the tail of the output** — a summary line reporting failures is easy to scroll past.

> **L-06 is not testable in this stage** — it needs Student details to have a body and a
> 100-student roster to load into it, neither of which exists until stage 3. It is re-homed to
> stage 3 Task 3, which already opens the roster at 320px. Recorded here so the row is not
> silently skipped.

- [ ] **Step 3: Fix whatever fails, then commit**

The likely failures are the 44px rule on the leftovers radios and the 320px height with the how-to open. Fix the CSS; do not relax the test.

```bash
git add -u src/ tests/
git commit -m "test(classroom): measure the no-scroll rule instead of eyeballing it

Four widths, both axes, in every state the page can reach -- collapsed,
each section open, and with results. Plus a 44px sweep that reports
which elements failed rather than just that something did, and a guard
that the homepage still ships zero JavaScript."
```

---

## Task 8: Both locales, whole sentences

**Files:** `tests/e2e/classroom-groups.spec.ts`, `tests/unit/i18n.test.ts`
**Traceability:** S-09, H-08, G-19, M-01…M-03

- [ ] **Step 1: Assert every new sentence in both locales**

For each string added in Tasks 2–6, assert the **whole sentence** on both `/classroom-groups` and `/id/classroom-groups`. Not a fragment, not a substring of a fragment.

- [ ] **Step 2: Confirm the seam scan is still green**

```
npx playwright test rendered-text.spec.ts; echo "exit=$?"
```

If it reports a new join, the fix is in the **frontmatter**, not in the template — rejoining the lines is what breaks next time prettier runs.

- [ ] **Step 3: Confirm the locale invariants**

```
npx vitest run tests/unit/i18n.test.ts tests/unit/dead-copy.test.ts; echo "exit=$?"
```

Both locales must have identical key sets, no blanks, and nothing unrendered.

- [ ] **Step 4: Full run, then commit**

```bash
npm test; echo "exit=$?"
git add -u tests/
git commit -m "test(classroom): every new sentence, whole, in both locales

Fragments pass while the sentence around them is broken -- which is
exactly how this page shipped three sentences that said the wrong thing."
```

---

## Self-review

**Spec coverage** — §3 layout, How to use, header states and naming (T2, T3); §6 sex switches and leftovers placement (T4); §8 class name and results (T5); staleness (T6); §2's rule (T7); §13's i18n rules (T8). The engine rewire (T1) is not in the spec's stage list because the spec did not notice the page breaks between stages — recorded here as the finding it is.

**Placeholders** — none. Every step names its file, command and expected result.

**Type consistency** — `ToolState` and `sectionState` in T3 are what T4's `sexWhy` and T6's `Snapshot` read from; `Snapshot.roster` is `string` in T6 and stage 3 fills it with a serialised roster rather than changing its type.

**Linkage out** — stage 3 must: fill `Snapshot.roster`, un-`fixme` the G-11 spillover test, replace `students: count` with the roster, and fill the `cg-students` body. Each is named in the task that leaves it. Sound & animation's own fourth section is a fifth debt this stage leaves, but not stage 3's: checked against stage 3's own plan, which names exactly four; stage 5's Task 6 already assumes `cg-sound` exists as a collapsible without claiming to build it. Owed, to whichever stage finally does: folding the existing sound/speed fieldset into the shared `<h2><button>` pattern (Task 3's own Step 4 has the reason a bare rename cannot), the checkbox rename that ripples into three e2e spec files plus `tests/dev/dev-sanity.spec.ts`, and the no-scroll/44px coverage Task 7 above skips for it.
