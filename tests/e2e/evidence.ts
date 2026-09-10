import { test, type Locator, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
    `${slug(title)}__${String(n).padStart(2, '0')}-${slug(label)}.png`,
  );

  const shot = target ?? page;
  await shot.screenshot({ path: join(DIR, file), scale: 'css' });

  appendFileSync(
    join(DIR, 'manifest.jsonl'),
    JSON.stringify({ project, title, order: n, label, file }) + '\n',
    'utf8',
  );
};
