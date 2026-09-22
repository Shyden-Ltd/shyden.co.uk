import { test, type Locator, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  EVIDENCE_JPEG_QUALITY,
  EVIDENCE_MANIFEST,
} from '../../scripts/evidence-files.mjs';

/**
 * Capture, as a journey runs, what an operator needs to believe it ran.
 *
 * The standing rule (operator, 2026-08-22) is a screenshot per ASSERTION and a
 * video per JOURNEY, presented as a page he checks off before anything merges.
 * The reason is specific and repeated: green CI has meant nothing three times
 * -- a support form nothing was wired to, a page that could not be submitted on
 * iPhone, and a fortnight of "flaky" re-runs. He wants to see it himself.
 *
 * Two properties this has to keep:
 *
 * 1. **Captured DURING the run, never retrofitted.** A screenshot taken
 *    afterwards, from a page rebuilt by hand, is a picture of something that
 *    resembles the assertion -- which is worse than no evidence, because it
 *    looks like proof.
 * 2. **Free when not wanted.** Gated on `EVIDENCE_DIR`, so CI runs ~2200 tests
 *    with no capture cost, the same reason `trace` is `retain-on-failure`.
 *
 * `shoot` is called AFTER the assertion it documents, so the existence of the
 * image is itself the result: Playwright stops the test at the first failed
 * expect, so a missing shot is a failed or unreached assertion, and the JSON
 * report says which.
 */

const DIR = process.env.EVIDENCE_DIR;

/** Filesystem-safe, still readable in a directory listing. */
const slug = (s: string) =>
  s
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .toLowerCase();

const counters = new Map<string, number>();

/**
 * Record one assertion as an image plus a manifest line.
 *
 * `target` clips the shot to the element under assertion when given. Clipping
 * is not cosmetic: a full-page shot per assertion across six projects runs to
 * tens of megabytes, and an operator scanning for one badge should not have to
 * hunt for it in a screenshot of the whole homepage.
 */
export const shoot = async (
  page: Page,
  label: string,
  target?: Locator,
): Promise<void> => {
  if (!DIR) return;
  const info = test.info();
  const project = info.project.name;
  const title = info.titlePath.slice(1).join(' > ');
  const key = `${project}|${title}`;
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);

  const dir = join(DIR, slug(project));
  mkdirSync(dir, { recursive: true });
  const file = join(
    slug(project),
    `${slug(title)}__${String(n).padStart(2, '0')}-${slug(label)}.jpg`,
  );

  const shot = target ?? page;
  await shot.screenshot(captureOptions(join(DIR, file)));

  appendFileSync(
    join(DIR, EVIDENCE_MANIFEST),
    JSON.stringify(
      manifestRow({ project, title, order: n, label, file }, new Date()),
    ) + '\n',
    'utf8',
  );
};

/** What one assertion shot records about itself. */
type Capture = {
  project: string;
  title: string;
  order: number;
  label: string;
  file: string;
};

/**
 * One manifest line: a capture, stamped with the instant it was written.
 *
 * The manifest is appended to and never cleared, so a second run into the same
 * evidence directory left the first run's rows -- and their pictures -- on a
 * page built from the second run's report (#171). The stamp is how
 * `scripts/build-evidence-page.mjs` tells them apart: a run's rows are the ones
 * stamped once its report's `stats.startTime` had passed.
 *
 * PURE, with the clock as an argument, so `tests/unit/evidence-page.test.ts`
 * feeds the builder rows this function wrote rather than a copy of their shape.
 */
export const manifestRow = (capture: Capture, now: Date) => ({
  ...capture,
  at: now.toISOString(),
});

/**
 * How every assertion shot is taken.
 *
 * Exported so `tests/unit/evidence-page.test.ts` can pin the format without a
 * browser: the quality is a judgement about legible Thai glyphs, and a
 * judgement that lives only inside a call nobody can reach is a judgement
 * nothing protects.
 *
 * `scale: 'css'` throughout -- a device pixel ratio of 3 triples the bytes to
 * say the same thing.
 */
export const captureOptions = (path: string) => ({
  path,
  scale: 'css' as const,
  type: 'jpeg' as const,
  quality: EVIDENCE_JPEG_QUALITY,
});

/**
 * A spec's opt-in to being recorded: `test.use(recorded)`.
 *
 * The ONE home for `video:` outside `playwright.config.ts`, whose shared value
 * is now the literal `'off'`. A recording earns its place only where a still
 * cannot show what happened -- a click, a scroll, an orientation change -- so
 * a spec that loads a page and asserts gets screenshots and nothing else.
 * Operator, 2026-09-18: "recordings are pointless and useless on static
 * content."
 *
 * Still `'off'` outside an evidence run, so an ordinary `npm run test:e2e`
 * never pays for a recording however many specs opt in.
 *
 * Which specs may declare this is neither a judgement nor a list:
 * `tests/unit/evidence-recording.test.ts` DERIVES it from each spec's own
 * source -- a spec that acts must record, and a spec that records must act --
 * and fails in both directions. The declaration is only ever one half of a
 * pair, and the source is the authority.
 */
export const recorded = { video: DIR ? ('on' as const) : ('off' as const) };
