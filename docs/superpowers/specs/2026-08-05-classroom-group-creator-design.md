# Classroom Group Creator — design

**Date:** 2026-08-05
**Status:** Approved (operator, 2026-08-05)

A free in-browser tool that splits a class into groups, shows the split as an
animated deal with sound, and works in English and Bahasa Indonesia.

## Why

Teachers split classes into groups constantly and do it by hand or with a
whiteboard tally. The site already hosts one single-purpose browser tool (the
Glory Points Calculator), and this follows that shape: no accounts, no upload,
nothing leaves the browser — which also means a class list of real children's
names never touches a server.

## Scope

In:

- Split a class by **students per group** or by **number of groups**.
- Optional **names**: a number alone gives anonymous slots; a pasted list gives
  named students.
- **Never fewer than the stated minimum** per group; leftovers either spread
  one-per-group or bunched into one group, teacher's choice.
- **Keep-apart pairs**: named students who must not share a group.
- **Group names**: numbered, or a themed set.
- **Animated deal** with avatars, names and sound; speed control and mute.
- **English (default) and Bahasa Indonesia**, as real indexed pages.

Out (deliberately):

- Saving, accounts, sharing links to a generated result. Nothing is persisted
  beyond the teacher's own settings in their browser.
- Balancing by ability, gender or any student attribute. Out of scope on
  purpose: it invites storing sensitive data about children.
- Printing/export. Easy to add later; not needed to be useful.

## Architecture

Follows the Glory Points precedent exactly — pure logic in `src/lib/`, DOM
wiring in `src/scripts/`, markup in `src/pages/`.

```
src/lib/grouping.ts                  pure engine — no DOM, no randomness source of its own
src/lib/grouping-types.ts            shared types
src/lib/i18n/index.ts                locale lookup + type-safe key list
src/lib/i18n/en.ts                   English strings (the reference locale)
src/lib/i18n/id.ts                   Bahasa Indonesia strings
src/scripts/classroom-groups.ts      UI wiring, animation, Web Audio
src/components/StudentCard.astro     avatar + name card
src/pages/classroom-groups.astro     English page
src/pages/id/classroom-groups.astro  Indonesian page
```

The engine takes a seeded random function as a parameter rather than calling
`Math.random()` itself. That is what makes the shuffle, the leftover placement
and the constraint solving reproducible in tests — otherwise every assertion
about "a random group" is either flaky or vacuous.

### The engine is computed first, animated second

`buildGroups(input) -> Result` returns the finished arrangement. The animation
replays that result; it never decides anything. Three things fall out of this:
"skip animation" is free, the result is testable without a browser, and the
finished groups can be written into the DOM as text immediately so assistive
technology and a teacher who skipped the show see the same thing.

## The grouping rules

Applied in this precedence order. Later rules never violate earlier ones.

1. **Keep-apart pairs** — hard constraint. If it cannot be satisfied, nothing
   is produced and the teacher is told exactly why.
2. **Minimum size** — in per-group mode, no group ends below the stated size.
3. **Leftovers** — spread one-per-group (default) or bunched into one randomly
   chosen group.

### Keep-apart is graph colouring, and some requests are impossible

Students are nodes; a keep-apart pair is an edge; groups are colours. Five
students who must all be separated cannot fit into four groups — no shuffle
will ever find an arrangement, so "shuffle and retry" would spin and then fail
with nothing useful to say.

Class sizes are tiny (≤ 40 students, a handful of constraints), so exact
backtracking is instant and gives a definite answer: a valid arrangement, or a
proof of impossibility with the specific students named —
*"Ana, Budi, Citra, Dewi and Eko all need separating, so you need at least 5
groups."* The message names the mutually-conflicting set, not just "impossible".

Keep-apart requires names: you cannot say "keep 7 and 12 apart" meaningfully
when students are anonymous. When no names are given, the keep-apart control is
disabled with an explanation rather than hidden, so the teacher understands why.

### Worked examples (these become the unit tests)

| Students | Mode | Leftovers | Result |
|---|---|---|---|
| 22 | 4 per group | spread | 5, 5, 4, 4, 4 |
| 22 | 4 per group | bunched | 6, 4, 4, 4, 4 |
| 22 | 5 groups | — | 5, 5, 4, 4, 4 |
| 7 | 4 per group | either | 7 — one group; a second would break the minimum |
| 3 | 4 per group | either | 3 — one group; fewer students than one full group |
| 0 | any | — | refuses with a message, produces no groups |

The 7-student row is the case worth stating explicitly: two groups would mean
a group of 3, below the stated minimum of 4, so the correct answer is a single
group of 7. "Never fewer than specified" beats "as many groups as possible".

## Internationalisation

Astro's built-in i18n. `en` is the default and stays unprefixed; `id` lives
under `/id/`. Both are real built pages, so both are indexed, both appear in the
existing sitemap, and each carries `hreflang` links to the other. `BaseLayout`
gains a `lang` prop — it currently hardcodes `<html lang="en">`.

Strings live in typed dictionaries. `en.ts` is the reference; `id.ts` must
implement the same key type, so a missing translation is a **build error**, not
a silently English string on the Indonesian page. Themed group names and every
error message are translated, including the impossibility explanation.

An in-page switcher links to the same tool in the other language.

## Animation and sound

Cards carry an inline-SVG avatar and the student's name. With no names, the
same card reads "Student 7" / "Siswa 7" — the no-name path is a first-class
case, not a fallback, because it is the mode the teacher gets by default.

Avatars are drawn as inline SVG from a small set of shapes and a colour
palette, chosen deterministically from the student's index. No image files: no
licensing, no downloads, no layout shift.

Sound is synthesised with the Web Audio API — a shuffle riffle, a click per
card landing, a chime on completion. No audio assets (the site has none today)
and nothing to license. Audio only ever starts after the teacher presses the
button, which satisfies browsers' autoplay gesture requirement.

**Sound defaults ON** (operator decision, 2026-08-05). A prominent mute control
sits next to the button and the choice persists in `localStorage`.

Speed: normal / fast / skip.

## Accessibility

An animated picker is easy to get wrong, so these are requirements, not
nice-to-haves:

- The finished groups exist as real text in the DOM regardless of animation
  state. Skipping, muting, or never seeing the animation loses nothing.
- `prefers-reduced-motion` defaults the speed to "skip"; the teacher can
  override.
- Sound never carries information the screen does not.
- The result region is a polite live region, announced once when settled — not
  once per card.
- Every control is keyboard reachable and labelled; contrast meets AA.

## Error handling

Every failure names the cause and the fix, in the page's language:

| Situation | Response |
|---|---|
| No students, or 0 | Refuse; explain a class is needed |
| Group size below 1, or groups below 1 | Refuse; explain the minimum |
| More groups requested than students | Refuse; state the most groups possible |
| Keep-apart impossible | Refuse; name the conflicting students and the groups needed |
| Keep-apart names not in the class list | Refuse; name the unrecognised entries |
| Duplicate/blank lines in the class list | Blanks dropped; duplicates kept and flagged, since two children may share a name |

## Testing

**Unit (Vitest), `tests/unit/grouping.test.ts`** — the engine, with a seeded
random so every assertion is deterministic:

- every worked example in the table above
- the minimum-size guarantee holds across a sweep of sizes
- every student appears exactly once, none invented or lost
- leftovers spread vs bunched
- number-of-groups mode
- keep-apart satisfied when satisfiable
- impossibility detected, and the message names the right students
- keep-apart referencing an unknown name refuses
- no-names mode produces correctly numbered anonymous students

**Unit, `tests/unit/i18n.test.ts`** — `id` implements every `en` key; no
string is accidentally identical to the English one where it must differ
(catches copy-paste); themed group names exist in both.

**E2E (Playwright), `tests/e2e/classroom-groups.spec.ts`** — both languages:

- the page renders and the tool produces groups
- results are readable as text with animation skipped
- mute persists across reload
- `prefers-reduced-motion` skips the animation
- the language switcher moves between `/classroom-groups` and
  `/id/classroom-groups` and the content is genuinely translated
- an impossible keep-apart shows the explanation, not a crash
- keyboard-only operation reaches every control

**SEO** — extend the existing `tests/e2e/seo.spec.ts` expectations to cover
`hreflang` and the Indonesian page appearing in the sitemap.

## Risks

| Risk | Mitigation |
|---|---|
| Constraint solving hangs on a hostile input | Bounded backtracking with an explicit node cap; beyond it, report impossibility rather than spin. Class sizes make the cap unreachable in practice |
| "Random" makes tests flaky or vacuous | The engine takes its random function as a parameter; tests seed it |
| Indonesian page silently falls back to English strings | `id.ts` is typed against `en.ts`'s key union — a missing key fails the build |
| Sound on by default is unwelcome in a shared room | Operator's explicit decision; mitigated by a prominent mute that persists |
| Animation becomes the only way to read the result | Result text is written to the DOM independently of the animation, and asserted with animation skipped |
