/**
 * The two filenames an evidence directory is defined by.
 *
 * An evidence run and the page built from it are two programs separated by a
 * directory, and nothing between them checks that they agree. They stopped
 * agreeing once already: `playwright.config.ts` promised that an evidence run
 * "needs no second flag anybody could forget", while the builder read a
 * `report.json` that invocation never produced. The captures landed, the run
 * went green, and the page could not be built.
 *
 * So the names live HERE, once, and every consumer imports them --
 * `tests/e2e/evidence.ts` writes the manifest, `scripts/test-e2e.mjs` writes
 * the report, `scripts/build-evidence-page.mjs` reads both.
 * `tests/unit/evidence-page.test.ts` asserts no consumer spells either name
 * for itself, derived from the filesystem rather than a list, because a
 * filename spelled twice is two filenames the day one of them moves.
 *
 * `.mjs` deliberately: the builder is plain node with no TypeScript step, so a
 * `.ts` home could not be the one home.
 */

/** Playwright's json report, as the page builder expects to find it. */
export const EVIDENCE_REPORT = 'report.json';

/** One line per captured assertion, appended as the run goes. */
export const EVIDENCE_MANIFEST = 'manifest.jsonl';

/**
 * The capture format, and the quality it is encoded at.
 *
 * A screenshot of a page containing photographs stores losslessly at roughly
 * ten times the size of a quality-90 JPEG, for a fidelity nobody consumes: the
 * page is read by an eye, and pixel-exact comparison belongs to the
 * visual-regression suite, which keeps its own PNG baselines. Measured on #138
 * before the change: 80 shots = 18.9 MiB, a 25.34 MiB page that exceeded the
 * publish limit, and every one of its 80 journey videos dropped against a
 * budget the shots had already spent (#146).
 *
 * 90, not 80: the operator judges whether a Thai capture is really Thai, so
 * the glyphs are the thing the encoder must not soften.
 */
export const EVIDENCE_JPEG_QUALITY = 90;

/**
 * This file's own basename.
 *
 * The guard against re-spelling has to exempt the module that does the
 * spelling, and naming it here keeps that exemption from being a string in the
 * test that outlives a rename.
 */
export const CONTRACT_MODULE = 'evidence-files.mjs';
