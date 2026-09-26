import { readFileSync } from 'node:fs';
import type { Locator, Page, TestInfo } from '@playwright/test';
import {
  journeysOfPage,
  renderEvidencePage,
  REVIEW_DATA_ID,
  sha256Of,
} from '../../scripts/build-evidence-page.mjs';
import {
  installCapabilityStandIns,
  type CapabilityStandInOptions,
  type CapabilityStandInWindow,
} from './capability-stand-ins';
import {
  installDbStandIn,
  type DbStandInOptions,
  type StandInWindow,
  type StoredBody,
} from './db-stand-in';
import {
  counters,
  evidenceTest as test,
  journeySection,
  ORIGIN,
  PIXEL,
  serveEvidencePage,
  storeKeyOf,
  WRITE_ORDERS,
  type ServedFile,
} from './evidence-harness';
import { recorded } from './evidence';
import { searched } from '../source-files';
import { expect } from './fixtures';
import { contrastRatio } from './helpers';

/**
 * The evidence page's review viewer (#205), driven through the page's OWN
 * rendered script in a real browser.
 *
 * The page is built by the real builder from a fixture run: two journeys on two
 * engines, one capture missing and one recording missing, so the eight review
 * items include both kinds and neither placeholder. Storage is the db stand-in
 * (#172), run in both orders a write can complete in wherever a decision or a
 * note is stored; downloads and comments are their own stand-ins.
 */

test.use(recorded);

const FIRST = 'the first journey';
const SECOND = 'the second journey';
const SIGNOFF_KEY = 'ticket-205-fixture';
const DOC = `signoff/${SIGNOFF_KEY}`;
const ITEMS_PATH = `${DOC}/items`;
const ENGINES = ['chromium', 'webkit'] as const;

/**
 * The sandbox the artifact runtime puts a published page in, read off the
 * real iframe on 2026-09-18. `allow-modals` is NOT in it, which is what makes
 * `showModal()` a silent no-op there.
 */
const RUNTIME_SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups';

/** A real VP8 recording, one second long, so a recording's metadata can load. */
const RECORDING = readFileSync('tests/e2e/evidence-recording.webm');

/**
 * Where the asset store would serve a recording. A real id is assigned by the
 * upload and opaque, so a test fabricates a stable one from the key: the SHAPE
 * (`/_blob/` and 32 hex digits) is what the page has to handle.
 */
const blobOf = (key: string) =>
  `/_blob/${sha256Of(Buffer.from(key)).slice(0, 32)}`;
/** Bytes no engine can decode, so a screenshot that never loads can be shown. */
const BROKEN_SHOT = `data:image/png;base64,${Buffer.from('not a picture').toString('base64')}`;

const slug = (title: string) => title.replace(/ /g, '-');

const CAPTURES = [
  { journey: FIRST, order: 1, label: 'the form is empty', engine: 'chromium' },
  { journey: FIRST, order: 1, label: 'the form is empty', engine: 'webkit' },
  { journey: FIRST, order: 2, label: 'the result shows', engine: 'chromium' },
  { journey: FIRST, order: 2, label: 'the result shows', engine: 'webkit' },
  { journey: SECOND, order: 1, label: 'the page loads', engine: 'chromium' },
];
const RECORDED = [
  [FIRST, 'chromium'],
  [FIRST, 'webkit'],
  [SECOND, 'chromium'],
] as const;

const MANIFEST = CAPTURES.map((c) => ({
  project: c.engine,
  title: `evidence review > ${c.journey}`,
  order: c.order,
  label: c.label,
  file: `${c.engine}/${slug(c.journey)}-${c.order}.png`,
}));

const render = ({ brokenShot = false } = {}): string =>
  renderEvidencePage({
    manifest: MANIFEST,
    report: {
      stats: {
        startTime: '2026-09-17T08:00:00.000Z',
        duration: 1000,
        expected: 4,
        unexpected: 0,
        flaky: 0,
        skipped: 0,
      },
      suites: [
        {
          specs: [FIRST, SECOND].map((title) => ({
            title,
            tests: ENGINES.map((projectName) => ({
              projectName,
              results: [{ status: 'passed', duration: 100, attachments: [] }],
            })),
          })),
        },
      ],
    },
    content: {
      title: 'Review fixture',
      eyebrow: 'fixture',
      headline: 'A page reviewed one item at a time',
      lede: 'Rendered by the real builder.',
      signoffKey: SIGNOFF_KEY,
    },
    shots: new Map(
      MANIFEST.map((m, index) => [
        m.file,
        brokenShot && index === 4 ? BROKEN_SHOT : PIXEL,
      ]),
    ),
    videos: new Map(
      RECORDED.map(([journey, engine]) => {
        const key = `${slug(journey)}|${engine}`;
        return [
          key,
          { src: blobOf(key), sha256: sha256Of(RECORDING), ext: 'webm' },
        ];
      }),
    ),
  });

const HTML = render();

interface ReviewItem {
  key: string;
  kind: 'screenshot' | 'recording';
  journey: string;
  journeyTitle: string;
  assertion: number | null;
  label: string;
  engine: string;
  filename: string;
  src?: string;
}

/** The items as a rendered page hands them to its own script. */
const itemsOf = (html: string): ReviewItem[] => {
  const open = `<script type="application/json" id="${REVIEW_DATA_ID}">`;
  const start = html.indexOf(open);
  const end = html.indexOf('</script>', start);
  return start < 0
    ? []
    : JSON.parse(html.slice(start + open.length, end)).items;
};

const ITEMS: ReviewItem[] = itemsOf(HTML);

/**
 * The page whose second-journey capture cannot be decoded, and ITS items.
 *
 * Kept as a pair, and every helper below takes the items it is addressing,
 * because an item is keyed by a digest of the bytes it shows: swapping a
 * capture for bytes no engine can paint is exactly the case the digest
 * exists for, so this page's keys are NOT the default page's keys. Read
 * through `ITEMS` it addressed a figure that is not on the page under test,
 * and `storedItem` would have asked a path nothing could ever write.
 */
const BROKEN_HTML = render({ brokenShot: true });
const BROKEN_ITEMS: ReviewItem[] = itemsOf(BROKEN_HTML);

/** Item positions in page order, named once so each test reads as a review. */
const AT = {
  firstFormChromium: 0,
  firstFormWebkit: 1,
  firstResultChromium: 2,
  firstResultWebkit: 3,
  firstRecordingChromium: 4,
  firstRecordingWebkit: 5,
  secondLoadsChromium: 6,
  secondRecordingChromium: 7,
} as const;

const itemAt = (index: number, items: ReviewItem[] = ITEMS): ReviewItem => {
  const item = items[index];
  if (!item)
    throw new Error(
      `the rendered page has no review item at ${index}; it has ${items.length}`,
    );
  return item;
};
const pathOf = (index: number, items: ReviewItem[] = ITEMS) =>
  `${ITEMS_PATH}/${itemAt(index, items).key}`;

/** A stored item, as an earlier visit or another viewer left it. */
const storedAs = (
  index: number,
  decision: 'approved' | 'rejected' | null,
  note = '',
): Record<string, StoredBody> => ({
  [pathOf(index)]: { decision, note, at: '2026-09-17T08:00:00.000Z' },
});

const everyItemApproved = (): Record<string, StoredBody> =>
  Object.assign({}, ...ITEMS.map((_, index) => storedAs(index, 'approved')));

interface OpenOptions extends Partial<DbStandInOptions> {
  html?: string;
  capabilities?: Partial<CapabilityStandInOptions>;
  recordingsUntil?: Promise<void>;
}

async function openReviewPage(
  page: Page,
  testInfo: TestInfo,
  { html = HTML, capabilities = {}, recordingsUntil, ...db }: OpenOptions = {},
): Promise<void> {
  const files: Record<string, ServedFile> = {};
  for (const item of ITEMS)
    if (item.src)
      files[item.src] = {
        contentType: 'video/webm',
        body: RECORDING,
        until: recordingsUntil,
      };
  await serveEvidencePage(page, html, files);
  // Annotated, not inlined: `addInitScript`'s parameter is a union, so it
  // cannot contextually type the literal, and 'accept' widens to `string`
  // (ts2345). The annotation pins it to SaveAnswer and keeps every caller's
  // override checked -- a cast here would have silenced the checker at the one
  // place it was right.
  const standIns: CapabilityStandInOptions = {
    downloads: 'accept',
    comments: { canSend: 'available', send: 'post' },
    ...capabilities,
  };
  await page.addInitScript(installCapabilityStandIns, standIns);
  const options: DbStandInOptions = {
    ...storeKeyOf(testInfo, { kind: 'evidence-review-db' }),
    order: 'resolve-then-confirm',
    seed: {},
    holdUse: false,
    subscriptionDies: false,
    getFails: false,
    ...db,
  };
  await page.addInitScript(installDbStandIn, options);
  await page.goto(`${ORIGIN}/`);
  if (!options.holdUse && !options.absent)
    await expect
      .poll(
        async () => (await counters(page)).deliveries,
        'the page received its stored state',
      )
      .toBeGreaterThan(1);
}

const viewer = (page: Page) =>
  page.getByRole('dialog', { name: 'Review evidence' });
const control = (page: Page, name: string) =>
  viewer(page).getByRole('button', { name, exact: true });
const position = (page: Page) => viewer(page).locator('#viewer-position');
const noteField = (page: Page) =>
  viewer(page).getByRole('textbox', { name: /^Note for Claude/ });
const figureOf = (page: Page, index: number, items: ReviewItem[] = ITEMS) =>
  page.locator(`[data-item="${itemAt(index, items).key}"]`);
const signoff = (page: Page) => page.locator('#signoff');

/** What a person taps to open an item: its screenshot, or its recording's Review button. */
async function openItem(
  page: Page,
  index: number,
  items: ReviewItem[] = ITEMS,
): Promise<Locator> {
  const item = itemAt(index, items);
  const section = journeySection(page, item.journeyTitle);
  if (item.kind === 'recording') {
    const recordings = section.locator('details.videos');
    if (!(await recordings.evaluate((d) => (d as HTMLDetailsElement).open)))
      await recordings.locator('summary').click();
    const review = figureOf(page, index, items).getByRole('button', {
      name: `Review the recording, ${item.engine}`,
    });
    await review.click();
    await expect(viewer(page)).toBeVisible();
    return review;
  }
  const thumbnail = figureOf(page, index, items).getByRole('button', {
    name: `Review assertion ${item.assertion}, ${item.engine}: ${item.label}`,
  });
  await thumbnail.click();
  await expect(viewer(page)).toBeVisible();
  return thumbnail;
}

const expectShowing = (page: Page, index: number) =>
  expect(position(page)).toHaveText(`${index + 1} of ${ITEMS.length}`);

/** Once Approve is enabled: the item has loaded and can be approved. */
const approveWhenLoaded = async (page: Page) => {
  await expect(control(page, 'Approve')).toBeEnabled();
  await control(page, 'Approve').click();
};

const storedItem = (page: Page, index: number, items: ReviewItem[] = ITEMS) =>
  page.evaluate(
    (path) => (window as StandInWindow).__dbStandIn.read(path),
    pathOf(index, items),
  );
const storedDecision = async (page: Page, index: number) =>
  (await storedItem(page, index))?.decision ?? null;
const writesTo = (page: Page, path: string) =>
  page.evaluate(
    (target) => (window as StandInWindow).__dbStandIn.writesTo(target),
    path,
  );
const storedSignoff = (page: Page) =>
  page.evaluate(
    (path) => (window as StandInWindow).__dbStandIn.read(path),
    DOC,
  );
const capabilityControl = (page: Page) => ({
  saves: () =>
    page.evaluate(() =>
      (window as CapabilityStandInWindow).__capabilityControl.saves(),
    ),
  sends: () =>
    page.evaluate(() =>
      (window as CapabilityStandInWindow).__capabilityControl.sends(),
    ),
});

/** A horizontal touch swipe that starts at the centre of `target`. */
const swipe = (target: Locator, dx: number) =>
  target.evaluate((element, distance) => {
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const fire = (type: string, clientX: number) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 41,
          pointerType: 'touch',
          isPrimary: true,
          clientX,
          clientY: y,
        }),
      );
    fire('pointerdown', x);
    fire('pointermove', x + distance / 2);
    fire('pointerup', x + distance);
  }, dx);

test.describe('evidence review: opening the viewer', () => {
  test('a screenshot opens the viewer on that item', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo);
    await openItem(page, AT.firstResultWebkit);

    await expectShowing(page, AT.firstResultWebkit);
    await expect(viewer(page).locator('#viewer-journey')).toHaveText(FIRST);
    await expect(viewer(page).locator('#viewer-title')).toHaveText(
      'Assertion 2: the result shows',
    );
    await expect(viewer(page).locator('#viewer-engine')).toHaveText('webkit');
    await expect(viewer(page).locator('#viewer-image')).toBeVisible();
  });

  test('a recording’s Review button opens the viewer on that recording, which does not play by itself', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo);
    await openItem(page, AT.firstRecordingWebkit);

    await expectShowing(page, AT.firstRecordingWebkit);
    await expect(viewer(page).locator('#viewer-title')).toHaveText('Recording');
    await expect(viewer(page).locator('#viewer-engine')).toHaveText('webkit');
    const video = viewer(page).locator('video');
    await expect(video).toBeVisible();
    await expect(control(page, 'Approve')).toBeEnabled();
    expect(
      await video.evaluate((v: HTMLVideoElement) => ({
        controls: v.controls,
        autoplay: v.autoplay,
        paused: v.paused,
      })),
    ).toEqual({ controls: true, autoplay: false, paused: true });
  });

  test('"Review one by one" opens at the first undecided item', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo, {
      seed: {
        ...storedAs(AT.firstFormChromium, 'approved'),
        ...storedAs(AT.firstFormWebkit, 'rejected'),
      },
    });
    await page
      .locator('#review-start')
      .getByRole('button', { name: 'Review one by one' })
      .click();
    await expectShowing(page, AT.firstResultChromium);
  });

  test('"Review one by one" in the sign-off opens at the first item once every item is decided', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo, { seed: everyItemApproved() });
    await signoff(page)
      .getByRole('button', { name: 'Review one by one' })
      .click();
    await expectShowing(page, AT.firstFormChromium);
  });

  test('every screenshot and recording on the page is named for what it opens', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo);
    await page
      .locator('details.videos')
      .evaluateAll((all) =>
        all.forEach((details) => ((details as HTMLDetailsElement).open = true)),
      );
    for (const [index, item] of ITEMS.entries()) {
      const name =
        item.kind === 'recording'
          ? `Review the recording, ${item.engine}`
          : `Review assertion ${item.assertion}, ${item.engine}: ${item.label}`;
      await expect(
        figureOf(page, index).getByRole('button', { name }),
        `item ${index}`,
      ).toHaveCount(1);
    }
    expect(ITEMS).toHaveLength(8);
  });

  test('the enlarge-only lightbox is gone', async ({ page }, testInfo) => {
    await openReviewPage(page, testInfo);
    await expect(page.locator('#lb')).toHaveCount(0);
    // Control: the viewer that replaced it is on the page.
    await expect(page.locator('dialog#viewer')).toHaveCount(1);
  });
});

test.describe('evidence review: the viewer is a modal dialog', () => {
  test('focus moves in, the page behind cannot be reached, and Esc returns focus to the screenshot', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo);
    const opener = await openItem(page, AT.firstFormWebkit);

    const focusIsInside = () =>
      page.evaluate(() => {
        const dialog = document.querySelector('dialog#viewer');
        const active = document.activeElement;
        return (
          !!dialog && !!active && (active === dialog || dialog.contains(active))
        );
      });
    expect(await focusIsInside()).toBe(true);

    const reachedBehind = await page.evaluate(() => {
      const behind = document.getElementById('btn-approve');
      behind?.focus();
      return document.activeElement === behind;
    });
    expect(reachedBehind, 'focused a control behind the dialog').toBe(false);

    for (let step = 0; step < 16; step += 1) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const dialog = document.querySelector('dialog#viewer');
        const active = document.activeElement;
        if (!active || active === document.body) return 'nowhere';
        return dialog?.contains(active) || active === dialog
          ? 'inside'
          : `outside: ${active.id || active.localName}`;
      });
      expect(where, `after ${step + 1} Tab presses`).not.toMatch(/^outside/);
    }

    await page.keyboard.press('Escape');
    await expect(viewer(page)).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('the Close button closes it and returns focus to what opened it', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo);
    const opener = await openItem(page, AT.firstRecordingChromium);
    await control(page, 'Close').click();
    await expect(viewer(page)).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('the viewer opens where the runtime serves this page: a sandboxed iframe', async ({
    page,
  }, testInfo) => {
    // Every other test in this file serves the page as a TOP-LEVEL document,
    // and the published page is never one. The artifact runtime serves it in
    // an iframe sandboxed exactly as below, measured on the real runtime on
    // 2026-09-18 -- and `allow-modals` is not in that list. With the
    // sandboxed modals flag set, `showModal()` RETURNS WITHOUT OPENING: no
    // throw, no error, no dialog. The viewer was unreachable on the published
    // page while all 54 tests here passed, because none of them was in a
    // frame. This one is.
    const files: Record<string, ServedFile> = {};
    for (const item of ITEMS)
      if (item.src)
        files[item.src] = { contentType: 'video/webm', body: RECORDING };
    await serveEvidencePage(page, HTML, files);
    // A PREDICATE, not a literal. `${ORIGIN}/framed` is absolute at runtime,
    // but `baseurl-guard` reads raw source text and cannot resolve a template
    // that opens with an interpolation, so it read this absolute URL as a
    // relative one. A matcher function has no baseURL resolution at all --
    // the same category the guard already exempts for a regex literal -- and
    // it stays exact, where a `**/framed` glob would match any origin.
    await page.route(
      (url) => url.href === `${ORIGIN}/framed`,
      (route) =>
        route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body:
            '<!doctype html><meta charset="utf-8">' +
            '<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style>' +
            `<iframe sandbox="${RUNTIME_SANDBOX}" src="/"></iframe>`,
        }),
    );
    const standIns: CapabilityStandInOptions = {
      downloads: 'accept',
      comments: { canSend: 'available', send: 'post' },
    };
    await page.addInitScript(installCapabilityStandIns, standIns);
    const options: DbStandInOptions = {
      ...storeKeyOf(testInfo, { kind: 'evidence-review-framed' }),
      order: 'resolve-then-confirm',
      seed: {},
      holdUse: false,
      subscriptionDies: false,
      getFails: false,
    };
    await page.addInitScript(installDbStandIn, options);
    await page.goto(`${ORIGIN}/framed`);

    const framed = page.frameLocator('iframe');
    // Control: the page itself rendered inside the frame, so a failure below
    // is the viewer refusing to open rather than nothing having loaded.
    await expect(framed.locator('#items-progress')).toHaveText(
      `0 approved, 0 rejected, ${ITEMS.length} undecided of ${ITEMS.length} items`,
    );
    await framed
      .locator('#review-start')
      .getByRole('button', { name: 'Review one by one' })
      .click();
    const framedViewer = framed.getByRole('dialog', {
      name: 'Review evidence',
    });
    await expect(framedViewer).toBeVisible();
    await expect(framedViewer.locator('#viewer-position')).toHaveText(
      `1 of ${ITEMS.length}`,
    );

    // The top layer was giving the page two things a non-modal dialog does
    // not: the rest of the document unreachable, and Escape closing it. Both
    // are properties of the viewer, so both are asserted here rather than
    // left to whichever mechanism happens to provide them.
    const inner = page.frames().find((frame) => frame.url() === `${ORIGIN}/`);
    if (!inner) throw new Error('the sandboxed frame did not load the page');
    expect(
      await inner.evaluate(() => {
        const behind = document.getElementById('btn-approve');
        behind?.focus();
        return document.activeElement === behind;
      }),
      'focused a control behind the viewer',
    ).toBe(false);

    await page.keyboard.press('Escape');
    await expect(framedViewer).toBeHidden();
    expect(
      await inner.evaluate(() => {
        const behind = document.getElementById('btn-approve');
        behind?.focus();
        return document.activeElement === behind;
      }),
      'the page behind stayed unreachable after the viewer closed',
    ).toBe(true);
  });
});

test.describe('evidence review: what the viewer shows', () => {
  test('an item’s stored decision and note are shown in words', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo, {
      seed: storedAs(
        AT.firstResultChromium,
        'rejected',
        'the total is cut off',
      ),
    });
    await openItem(page, AT.firstResultChromium);
    await expect(viewer(page).locator('#viewer-decision')).toHaveText(
      'Rejected',
    );
    await expect(noteField(page)).toHaveValue('the total is cut off');

    await control(page, 'Previous').click();
    await expectShowing(page, AT.firstFormWebkit);
    await expect(viewer(page).locator('#viewer-decision')).toHaveText(
      'Not decided',
    );
    await expect(noteField(page)).toHaveValue('');
  });

  test('a decision stored against an earlier capture of the item is not shown', async ({
    page,
  }, testInfo) => {
    const earlier = itemAt(AT.firstFormChromium).key.replace(
      /[0-9a-f]{12}$/,
      '000000000000',
    );
    expect(earlier).not.toBe(itemAt(AT.firstFormChromium).key);
    await openReviewPage(page, testInfo, {
      seed: {
        [`${ITEMS_PATH}/${earlier}`]: {
          decision: 'approved',
          note: 'about the old picture',
          at: '2026-09-16T08:00:00.000Z',
        },
      },
    });
    await openItem(page, AT.firstFormChromium);
    await expect(viewer(page).locator('#viewer-decision')).toHaveText(
      'Not decided',
    );
    await expect(noteField(page)).toHaveValue('');
  });
});

for (const { order, when } of WRITE_ORDERS) {
  test.describe(`evidence review decisions, when ${when}`, () => {
    test('Approve, Reject and Skip each move on; Approve and Reject store the decision and Skip stores none', async ({
      page,
    }, testInfo) => {
      await openReviewPage(page, testInfo, { order });
      await openItem(page, AT.firstFormChromium);

      await approveWhenLoaded(page);
      await expectShowing(page, AT.firstFormWebkit);
      await control(page, 'Reject').click();
      await expectShowing(page, AT.firstResultChromium);
      await control(page, 'Skip').click();
      await expectShowing(page, AT.firstResultWebkit);
      await approveWhenLoaded(page);
      await expectShowing(page, AT.firstRecordingChromium);

      await expect
        .poll(() => storedDecision(page, AT.firstResultWebkit))
        .toBe('approved');
      expect(await storedDecision(page, AT.firstFormChromium)).toBe('approved');
      expect(await storedDecision(page, AT.firstFormWebkit)).toBe('rejected');
      expect(await storedItem(page, AT.firstResultChromium)).toBeNull();
      expect(await writesTo(page, pathOf(AT.firstResultChromium))).toBe(0);
    });

    test('Skip keeps a decision already made, and pressing it again never withdraws it', async ({
      page,
    }, testInfo) => {
      await openReviewPage(page, testInfo, {
        order,
        seed: {
          ...storedAs(AT.firstFormChromium, 'approved'),
          ...storedAs(AT.firstFormWebkit, 'rejected'),
        },
      });
      await openItem(page, AT.firstFormChromium);
      await control(page, 'Skip').click();
      await expectShowing(page, AT.firstFormWebkit);
      await control(page, 'Reject').click();
      await expectShowing(page, AT.firstResultChromium);
      await control(page, 'Previous').click();
      await control(page, 'Previous').click();
      await expectShowing(page, AT.firstFormChromium);
      await approveWhenLoaded(page);
      await expectShowing(page, AT.firstFormWebkit);
      await approveWhenLoaded(page);

      await expect
        .poll(() => storedDecision(page, AT.firstFormWebkit))
        .toBe('approved');
      expect(await storedDecision(page, AT.firstFormChromium)).toBe('approved');
      await expect(figureOf(page, AT.firstFormChromium)).toContainText(
        'Approved',
      );
    });

    test('Previous returns to an item whose decision can then be changed, and every change survives a reload', async ({
      page,
    }, testInfo) => {
      await openReviewPage(page, testInfo, { order });
      await openItem(page, AT.firstFormChromium);
      await approveWhenLoaded(page);
      await approveWhenLoaded(page);
      await control(page, 'Previous').click();
      await control(page, 'Previous').click();
      await expectShowing(page, AT.firstFormChromium);
      await expect(viewer(page).locator('#viewer-decision')).toHaveText(
        'Approved',
      );
      await control(page, 'Reject').click();

      await expect
        .poll(() => storedDecision(page, AT.firstFormChromium))
        .toBe('rejected');
      await expect
        .poll(() => storedDecision(page, AT.firstFormWebkit))
        .toBe('approved');

      await page.reload();
      await expect(figureOf(page, AT.firstFormChromium)).toContainText(
        'Rejected',
      );
      await expect(figureOf(page, AT.firstFormWebkit)).toContainText(
        'Approved',
      );
    });

    test('a note is saved as it is typed, capped at 2,000 characters with a visible count', async ({
      page,
    }, testInfo) => {
      await openReviewPage(page, testInfo, { order });
      await openItem(page, AT.firstResultWebkit);
      const count = viewer(page).locator('#viewer-note-count');
      await expect(count).toHaveText('0 of 2,000 characters');

      await noteField(page).fill('the heading wraps onto the icon');
      await expect(count).toHaveText('31 of 2,000 characters');
      await expect
        .poll(async () => (await storedItem(page, AT.firstResultWebkit))?.note)
        .toBe('the heading wraps onto the icon');
      expect(await storedDecision(page, AT.firstResultWebkit)).toBeNull();

      await noteField(page).fill('x'.repeat(2001));
      await expect(noteField(page)).toHaveValue('x'.repeat(2000));
      await expect(count).toHaveText('2,000 of 2,000 characters');
      await expect
        .poll(
          async () =>
            ((await storedItem(page, AT.firstResultWebkit))?.note as string)
              ?.length,
        )
        .toBe(2000);

      await page.reload();
      await openItem(page, AT.firstResultWebkit);
      await expect(noteField(page)).toHaveValue('x'.repeat(2000));
      await expect(figureOf(page, AT.firstResultWebkit)).toContainText('Note');
    });

    test('each item is its own document, and the sign-off document is left alone', async ({
      page,
    }, testInfo) => {
      await openReviewPage(page, testInfo, { order });
      await openItem(page, AT.firstFormWebkit);
      await noteField(page).fill('fine on a phone');
      await approveWhenLoaded(page);

      await expect
        .poll(() => storedItem(page, AT.firstFormWebkit))
        .toMatchObject({ decision: 'approved', note: 'fine on a phone' });
      const stored = await storedItem(page, AT.firstFormWebkit);
      expect(Object.keys(stored ?? {}).sort()).toEqual([
        'at',
        'decision',
        'note',
      ]);
      expect(Date.parse(String(stored?.at))).not.toBeNaN();
      expect(await storedSignoff(page)).toBeNull();
      expect(await writesTo(page, DOC)).toBe(0);
    });

    test('a decision made before the stored items load is written once they have, beside the stored note', async ({
      page,
    }, testInfo) => {
      await openReviewPage(page, testInfo, {
        order,
        holdUse: true,
        seed: storedAs(AT.firstFormChromium, null, 'written earlier'),
      });
      await openItem(page, AT.firstFormChromium);
      await approveWhenLoaded(page);
      await expectShowing(page, AT.firstFormWebkit);
      expect((await counters(page)).writes).toBe(0);

      await page.evaluate(() => (window as StandInWindow).__dbStandIn.answer());
      await expect
        .poll(() => storedItem(page, AT.firstFormChromium))
        .toMatchObject({ decision: 'approved', note: 'written earlier' });
    });

    test('approving every item in a journey ticks it; rejecting one unticks it; anything else leaves the tick alone', async ({
      page,
    }, testInfo) => {
      await openReviewPage(page, testInfo, { order });
      const tick = (title: string) =>
        journeySection(page, title).getByRole('checkbox');
      const storedTick = async (title: string) =>
        ((await storedSignoff(page))?.journeys as Record<string, boolean>)?.[
          itemAt(
            title === FIRST ? AT.firstFormChromium : AT.secondLoadsChromium,
          ).journey
        ];

      await openItem(page, AT.secondLoadsChromium);
      await approveWhenLoaded(page);
      await expectShowing(page, AT.secondRecordingChromium);
      await approveWhenLoaded(page);
      await control(page, 'Go to sign-off').click();
      await expect(tick(SECOND)).toBeChecked();
      await expect.poll(() => storedTick(SECOND)).toBe(true);

      await journeySection(page, FIRST).locator('label').first().click();
      await expect(tick(FIRST)).toBeChecked();
      await openItem(page, AT.firstFormChromium);
      await approveWhenLoaded(page);
      await control(page, 'Close').click();
      await expect(tick(FIRST)).toBeChecked();

      await openItem(page, AT.firstFormWebkit);
      await control(page, 'Reject').click();
      await control(page, 'Close').click();
      await expect(tick(FIRST)).not.toBeChecked();
      await expect.poll(() => storedTick(FIRST)).toBe(false);
    });

    test('a malformed stored item is ignored and never written back', async ({
      page,
    }, testInfo) => {
      const malformed = { decision: 'maybe', note: 42 };
      await openReviewPage(page, testInfo, {
        order,
        seed: { [pathOf(AT.firstFormChromium)]: malformed },
      });
      await openItem(page, AT.firstFormChromium);
      await expect(viewer(page).locator('#viewer-decision')).toHaveText(
        'Not decided',
      );
      await expect(noteField(page)).toHaveValue('');
      await control(page, 'Skip').click();
      await approveWhenLoaded(page);

      // Liveness: the next item's decision reached the store, so the page was
      // writing while it left the malformed one alone.
      await expect
        .poll(() => storedDecision(page, AT.firstFormWebkit))
        .toBe('approved');
      expect(await storedItem(page, AT.firstFormChromium)).toEqual(malformed);
      expect(await writesTo(page, pathOf(AT.firstFormChromium))).toBe(0);
    });
  });
}

test.describe('evidence review: Approve waits for the item to load', () => {
  test('a screenshot that has not loaded cannot be approved, and says why', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo, { html: BROKEN_HTML });
    await openItem(page, AT.secondLoadsChromium, BROKEN_ITEMS);
    await expect(control(page, 'Approve')).toBeDisabled();
    await expect(viewer(page).locator('#viewer-wait')).toBeVisible();
    await expect(viewer(page).locator('#viewer-wait')).toHaveText(/screenshot/);
    await expect(control(page, 'Reject')).toBeEnabled();
    await expect(control(page, 'Skip')).toBeEnabled();

    await page.keyboard.press('a');
    await expectShowing(page, AT.secondLoadsChromium);
    expect(
      await storedItem(page, AT.secondLoadsChromium, BROKEN_ITEMS),
    ).toBeNull();

    // Control: a screenshot that loads can be approved, and says nothing.
    await control(page, 'Close').click();
    await openItem(page, AT.firstResultWebkit, BROKEN_ITEMS);
    await expect(control(page, 'Approve')).toBeEnabled();
    await expect(viewer(page).locator('#viewer-wait')).toHaveCount(1);
    await expect(viewer(page).locator('#viewer-wait')).toBeHidden();
  });

  test('a recording can be approved once its metadata has loaded, and not before', async ({
    page,
  }, testInfo) => {
    let release = () => {};
    const recordingsUntil = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openReviewPage(page, testInfo, { recordingsUntil });
    await openItem(page, AT.firstRecordingChromium);
    await expect(control(page, 'Approve')).toBeDisabled();
    await expect(viewer(page).locator('#viewer-wait')).toHaveText(
      'Approve is available once the recording has loaded.',
    );
    await expect(control(page, 'Reject')).toBeEnabled();
    await expect(control(page, 'Skip')).toBeEnabled();

    release();
    await expect(control(page, 'Approve')).toBeEnabled();
    await expect(viewer(page).locator('#viewer-wait')).toHaveCount(1);
    await expect(viewer(page).locator('#viewer-wait')).toBeHidden();
  });
});

test.describe('evidence review: keys and swipes', () => {
  test('A, R and S decide, and Left and Right move without deciding', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo);
    await openItem(page, AT.firstFormChromium);
    await expect(control(page, 'Approve')).toBeEnabled();

    await page.keyboard.press('a');
    await expectShowing(page, AT.firstFormWebkit);
    await page.keyboard.press('r');
    await expectShowing(page, AT.firstResultChromium);
    await page.keyboard.press('s');
    await expectShowing(page, AT.firstResultWebkit);
    await page.keyboard.press('ArrowRight');
    await expectShowing(page, AT.firstRecordingChromium);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expectShowing(page, AT.firstResultChromium);

    await expect
      .poll(() => storedDecision(page, AT.firstFormWebkit))
      .toBe('rejected');
    expect(await storedDecision(page, AT.firstFormChromium)).toBe('approved');
    expect(await storedItem(page, AT.firstResultChromium)).toBeNull();
    expect(await storedItem(page, AT.firstResultWebkit)).toBeNull();
  });

  test('no key acts while the note field has focus', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo);
    await openItem(page, AT.firstFormChromium);
    await expect(control(page, 'Approve')).toBeEnabled();
    await noteField(page).click();
    await page.keyboard.type('ars');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');

    await expect(viewer(page)).toBeVisible();
    await expectShowing(page, AT.firstFormChromium);
    await expect(noteField(page)).toHaveValue('ars');
    await expect
      .poll(async () => (await storedItem(page, AT.firstFormChromium))?.note)
      .toBe('ars');
    expect(await storedDecision(page, AT.firstFormChromium)).toBeNull();
  });

  test('a swipe across a screenshot moves to the next or previous item without deciding', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo);
    await openItem(page, AT.firstFormWebkit);
    const stage = viewer(page).locator('#viewer-stage');

    await swipe(stage, -160);
    await expectShowing(page, AT.firstResultChromium);
    await swipe(stage, 160);
    await swipe(stage, 160);
    await expectShowing(page, AT.firstFormChromium);
    expect((await counters(page)).writes).toBe(0);
  });

  test('a swipe that starts on a recording does not move', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo);
    await openItem(page, AT.firstRecordingChromium);
    await swipe(viewer(page).locator('video'), -160);
    await expectShowing(page, AT.firstRecordingChromium);

    // Control: the same swipe on the screenshot before it does move.
    await control(page, 'Previous').click();
    await swipe(viewer(page).locator('#viewer-stage'), -160);
    await expectShowing(page, AT.firstRecordingChromium);
  });
});

test.describe('evidence review: the summary after the last item', () => {
  test('counts the decisions, lists what was rejected or noted, and hands on to the undecided and to sign-off', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo, {
      seed: {
        ...storedAs(AT.firstFormWebkit, 'rejected', 'the label overlaps'),
        ...storedAs(AT.firstResultChromium, 'approved', 'a little slow'),
      },
    });
    await openItem(page, AT.secondLoadsChromium);
    await approveWhenLoaded(page);
    await control(page, 'Skip').click();

    const summary = viewer(page).getByRole('region', {
      name: 'Review summary',
    });
    await expect(summary).toBeVisible();
    await expect(summary.locator('#viewer-summary-counts')).toHaveText(
      '2 approved, 1 rejected, 5 undecided of 8 items',
    );
    const listed = summary.getByRole('listitem');
    await expect(listed).toHaveCount(2);
    await expect(listed.nth(0)).toContainText(
      'Rejected: the first journey, assertion 1, webkit',
    );
    await expect(listed.nth(0)).toContainText('the label overlaps');
    await expect(listed.nth(1)).toContainText(
      'Approved: the first journey, assertion 2, chromium',
    );

    await listed.nth(0).getByRole('button').click();
    await expectShowing(page, AT.firstFormWebkit);
    for (let step = AT.firstFormWebkit; step < ITEMS.length; step += 1)
      await page.keyboard.press('ArrowRight');
    await expect(summary).toBeVisible();

    await summary
      .getByRole('button', { name: 'Review the 5 undecided' })
      .click();
    await expectShowing(page, AT.firstFormChromium);
    await control(page, 'Skip').click();
    await expectShowing(page, AT.firstResultWebkit);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(summary).toBeVisible();
    await summary.getByRole('button', { name: 'Go to sign-off' }).click();
    await expect(viewer(page)).toBeHidden();
    await expect(signoff(page)).toBeFocused();
  });
});

test.describe('evidence review: assistive technology and layout', () => {
  test('each decision is announced with the item now shown', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo);
    await openItem(page, AT.firstFormChromium);
    await approveWhenLoaded(page);
    const announcer = viewer(page).locator('#viewer-announce');
    await expect(announcer).toHaveAttribute('aria-live', 'polite');
    await expect(announcer).toHaveText(
      'Approved. 2 of 8: the form is empty, webkit',
    );
    await control(page, 'Reject').click();
    await expect(announcer).toHaveText(
      'Rejected. 3 of 8: the result shows, chromium',
    );
  });

  /**
   * What every engine measures, and what only some can walk.
   *
   * The size of a control, and whether it can take focus at all, are
   * properties of this page and are asserted on all five engines. Whether
   * Tab VISITS a button is a platform policy: Safari's Tab sequence holds
   * text fields and links unless the visitor opts in, so a walk there
   * reaches the textarea and nothing else -- it would assert a browser
   * preference, not our markup. The walk therefore runs where the platform
   * performs it, and WebKit's half of the contract is the focusability
   * assertion below, which runs everywhere. This is the shape
   * `chrome.spec.ts` settled for the same reason.
   */
  const openForMeasuring = async (page: Page, testInfo: TestInfo) => {
    await openReviewPage(page, testInfo, {
      seed: storedAs(AT.firstFormChromium, 'rejected', 'noted'),
    });
    await openItem(page, AT.secondRecordingChromium);
    await expect(control(page, 'Approve')).toBeEnabled();
  };

  test('every control is at least 44 by 44 pixels and can take focus', async ({
    page,
  }, testInfo) => {
    await openForMeasuring(page, testInfo);

    const measure = () =>
      page.evaluate(() => {
        const dialog = document.querySelector('dialog#viewer');
        const controls = Array.from(
          dialog?.querySelectorAll('button, textarea') ?? [],
        ).filter((element) => element.getClientRects().length > 0);
        return controls.map((element) => {
          const box = element.getBoundingClientRect();
          return {
            name:
              element.id || element.textContent?.trim() || element.localName,
            width: box.width,
            height: box.height,
          };
        });
      });
    // The filter alone, wrapped in `searched` at each call site rather than
    // in here: `absence-liveness` reads the SUBJECT of the assertion, and a
    // helper that hides the control inside itself is invisible to it. The
    // recognised idiom is the one to write, not a detector widened to
    // recognise this spelling -- that is how a mandatory control acquires a
    // trivial escape hatch (#118).
    const tooSmall = (sizes: Awaited<ReturnType<typeof measure>>) =>
      sizes.filter((size) => size.width < 44 || size.height < 44);
    const named = (sizes: Awaited<ReturnType<typeof measure>>) =>
      sizes.map((size) => size.name);

    const onItem = await measure();
    expect(onItem.map((size) => size.name)).toEqual(
      expect.arrayContaining(['viewer-approve', 'viewer-note', 'viewer-close']),
    );
    expect(
      searched(tooSmall(onItem), {
        of: named(onItem),
        what: 'controls in the viewer',
      }),
    ).toEqual([]);

    // WebKit's half of the walk below: every control this page shows can
    // take focus, so none of them has been removed from the tab order by
    // our own markup, whatever the platform's Tab policy is.
    const unfocusable = await page.evaluate(() => {
      const dialog = document.querySelector('dialog#viewer');
      const controls = Array.from(
        dialog?.querySelectorAll('button, textarea') ?? [],
      ).filter(
        (element) =>
          element.getClientRects().length > 0 &&
          !(element as HTMLButtonElement).disabled,
      );
      return controls
        .filter((element) => {
          (element as HTMLElement).focus();
          return document.activeElement !== element;
        })
        .map((element) => element.id || element.localName);
    });
    expect(
      searched(unfocusable, {
        of: named(onItem),
        what: 'controls in the viewer',
      }),
    ).toEqual([]);

    await control(page, 'Skip').click();
    const onSummary = await measure();
    expect(onSummary.map((size) => size.name)).toEqual(
      expect.arrayContaining(['viewer-go-signoff']),
    );
    expect(
      searched(tooSmall(onSummary), {
        of: named(onSummary),
        what: 'controls in the summary',
      }),
    ).toEqual([]);
  });

  test('focus is visible on every control the Tab sequence reaches', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName === 'webkit',
      "Safari's Tab sequence holds text fields and links unless the visitor " +
        'opts in, so this walk reaches the textarea and nothing else -- it ' +
        'would assert a browser preference rather than our markup. Size and ' +
        'focusability are asserted for WebKit in the test above.',
    );
    await openForMeasuring(page, testInfo);

    const stops = await page.evaluate(
      () =>
        document.querySelectorAll(
          'dialog#viewer button, dialog#viewer textarea',
        ).length,
    );
    const focused = [];
    for (let step = 0; step < stops + 2; step += 1) {
      await page.keyboard.press('Tab');
      focused.push(
        await page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null;
          if (!active?.closest('dialog#viewer')) return { name: 'outside' };
          const style = getComputedStyle(active);
          return {
            name: active.id || active.localName,
            outline:
              style.outlineStyle !== 'none' &&
              parseFloat(style.outlineWidth) >= 2,
          };
        }),
      );
    }
    const indicated = focused.filter(
      (entry) => entry.name !== 'outside' && entry.name !== 'video',
    );
    expect(indicated.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['viewer-approve', 'viewer-note']),
    );
    expect(
      searched(
        indicated.filter((entry) => !entry.outline).map((entry) => entry.name),
        { of: indicated.map((entry) => entry.name), what: 'focused controls' },
      ),
    ).toEqual([]);
  });

  for (const colorScheme of ['light', 'dark'] as const)
    test(`the viewer's text meets AA contrast in the ${colorScheme} theme`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await openReviewPage(page, testInfo);
      await openItem(page, AT.firstFormChromium);
      await expect(control(page, 'Approve')).toBeEnabled();
      await noteField(page).fill('checked');

      const texts = [
        '#viewer-position',
        '#viewer-journey',
        '#viewer-title',
        '#viewer-engine',
        '#viewer-decision',
        '#viewer-note-count',
        'label[for="viewer-note"]',
        '#viewer-note',
        '#viewer-close',
        '#viewer-previous',
        '#viewer-approve',
        '#viewer-reject',
        '#viewer-skip',
        '#viewer-download',
      ];
      for (const selector of texts) {
        const target = viewer(page).locator(selector);
        await expect(target, selector).toBeVisible();
        expect(await contrastRatio(target), selector).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    });

  test(
    'nothing scrolls sideways at 320 pixels with the viewer open',
    { tag: '@emulated-viewport' },
    async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await openReviewPage(page, testInfo);
      await openItem(page, AT.firstResultWebkit);
      await expect(control(page, 'Approve')).toBeEnabled();

      const overflow = await page.evaluate(() => {
        const dialog = document.querySelector('dialog#viewer') as HTMLElement;
        const edge = dialog.getBoundingClientRect().right;
        const escaping = Array.from(dialog.querySelectorAll('*'))
          .filter((element) => element.getClientRects().length > 0)
          .filter(
            (element) => element.getBoundingClientRect().right > edge + 0.5,
          )
          .map((element) => element.id || element.localName);
        return {
          page: document.documentElement.scrollWidth - window.innerWidth,
          dialog: dialog.scrollWidth - dialog.clientWidth,
          dialogRight: edge - window.innerWidth,
          escaping,
          measured: dialog.querySelectorAll('*').length,
        };
      });
      expect(overflow.page).toBe(0);
      expect(overflow.dialog).toBe(0);
      expect(overflow.dialogRight).toBeLessThanOrEqual(0);
      expect(
        searched(overflow.escaping, {
          of: overflow.measured,
          what: 'elements in the open viewer',
        }),
      ).toEqual([]);
    },
  );
});

test.describe('evidence review: the page around the viewer', () => {
  test('each item shows its state in words with an icon, and the sign-off counts every item', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo, {
      seed: {
        ...storedAs(AT.firstFormChromium, 'approved'),
        ...storedAs(AT.firstFormWebkit, 'rejected'),
        ...storedAs(AT.firstRecordingWebkit, null, 'jumps at 3s'),
      },
    });
    const badge = (index: number) => figureOf(page, index).locator('.badge');

    await expect(badge(AT.firstFormChromium)).toHaveText('Approved');
    await expect(badge(AT.firstFormWebkit)).toHaveText('Rejected');
    await expect(badge(AT.firstRecordingWebkit)).toHaveText('Note');
    for (const index of [
      AT.firstFormChromium,
      AT.firstFormWebkit,
      AT.firstRecordingWebkit,
    ])
      await expect(badge(index).locator('svg')).toHaveCount(1);
    await expect(badge(AT.firstResultChromium)).toHaveCount(1);
    await expect(badge(AT.firstResultChromium)).toBeHidden();
    await expect(signoff(page).locator('#items-progress')).toHaveText(
      '1 approved, 1 rejected, 6 undecided of 8 items',
    );
  });

  test('"Signed off" with items outstanding asks first, and stores nothing until "Sign off anyway"', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo, {
      seed: storedAs(AT.firstFormWebkit, 'rejected'),
    });
    const signedOff = page.locator('#btn-approve');
    await signedOff.click();

    const outstanding = signoff(page).locator('#outstanding');
    await expect(outstanding).toBeVisible();
    await expect(outstanding).toContainText('1 rejected');
    await expect(outstanding).toContainText('7 undecided');
    await expect(signedOff).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#state')).not.toHaveText(/Saving/);

    await outstanding.getByRole('button', { name: 'Review them' }).click();
    await expectShowing(page, AT.firstFormChromium);
    await control(page, 'Close').click();

    await outstanding.getByRole('button', { name: 'Sign off anyway' }).click();
    await expect(signedOff).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => (await storedSignoff(page))?.verdict)
      .toBe('approved');
    await expect(outstanding).toBeHidden();
  });

  test('"Signed off" with every item approved signs off in one press', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo, { seed: everyItemApproved() });
    await expect(signoff(page).locator('#items-progress')).toHaveText(
      '8 approved, 0 rejected, 0 undecided of 8 items',
    );
    await page.locator('#btn-approve').click();
    await expect(page.locator('#btn-approve')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(signoff(page).locator('#outstanding')).toBeHidden();
    await expect
      .poll(async () => (await storedSignoff(page))?.verdict)
      .toBe('approved');
  });

  test('without storage the viewer still works and says its decisions are local', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo, { absent: true });
    await openItem(page, AT.firstFormChromium);
    await expect(viewer(page).locator('#viewer-status')).toHaveText(
      /^Decisions are local to this view\b/,
    );
    await approveWhenLoaded(page);
    await expectShowing(page, AT.firstFormWebkit);
    await control(page, 'Close').click();
    await expect(
      figureOf(page, AT.firstFormChromium).locator('.badge'),
    ).toHaveText('Approved');
  });
});

test.describe('evidence review: downloads', () => {
  test('a screenshot downloads under its item name with its own bytes', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo);
    await openItem(page, AT.firstResultWebkit);
    await control(page, 'Download').click();
    await expect
      .poll(() => capabilityControl(page).saves())
      .toEqual([
        {
          filename: `${SIGNOFF_KEY}-the-first-journey-2-webkit.png`,
          size: Buffer.from(PIXEL.split(',')[1], 'base64').length,
          sha256: sha256Of(Buffer.from(PIXEL.split(',')[1], 'base64')),
          outcome: 'saved',
        },
      ]);
  });

  test('a recording downloads under its item name with its own bytes', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo);
    await openItem(page, AT.secondRecordingChromium);
    await control(page, 'Download').click();
    await expect
      .poll(() => capabilityControl(page).saves())
      .toEqual([
        {
          filename: `${SIGNOFF_KEY}-the-second-journey-rec-chromium.webm`,
          size: RECORDING.length,
          sha256: sha256Of(RECORDING),
          outcome: 'saved',
        },
      ]);
  });

  test('a declined download changes nothing', async ({ page }, testInfo) => {
    await openReviewPage(page, testInfo, {
      capabilities: { downloads: 'decline' },
    });
    await openItem(page, AT.firstFormWebkit);
    await control(page, 'Download').click();
    await expect
      .poll(async () => (await capabilityControl(page).saves()).length)
      .toBe(1);
    await expectShowing(page, AT.firstFormWebkit);
    await expect(viewer(page).locator('#viewer-decision')).toHaveText(
      'Not decided',
    );
    await expect(viewer(page).locator('#viewer-status')).toHaveText('');
    await expect(control(page, 'Download')).toBeVisible();
    expect((await counters(page)).writes).toBe(0);
  });

  test('there is no Download button where downloads are unavailable', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo, { capabilities: { downloads: null } });
    await openItem(page, AT.firstFormWebkit);
    // Control: the viewer is showing the item a Download button would save.
    await expect(control(page, 'Approve')).toBeVisible();
    await expect(control(page, 'Download')).toHaveCount(0);
  });
});

test.describe('evidence review: sending the review to Claude', () => {
  test('sends one comment at the sign-off, carrying the verdict, the counts and every rejected or noted item', async ({
    page,
  }, testInfo) => {
    await openReviewPage(page, testInfo, {
      seed: {
        ...storedAs(AT.firstFormWebkit, 'rejected', 'the label overlaps'),
        ...storedAs(AT.firstRecordingChromium, 'approved', 'smooth'),
        ...storedAs(AT.firstResultChromium, 'approved'),
      },
    });
    const before = (await counters(page)).writes;
    await signoff(page)
      .getByRole('button', { name: 'Send review to Claude' })
      .click();
    await expect
      .poll(async () => (await capabilityControl(page).sends()).length)
      .toBe(1);
    const [sent] = await capabilityControl(page).sends();

    expect(sent.anchoredAt).toBe('signoff');
    expect(sent.outcome).toBe('post');
    expect(Buffer.byteLength(sent.text)).toBeLessThanOrEqual(4096);
    expect(sent.text).toContain(DOC);
    expect(sent.text).toContain('Sign-off: not decided');
    expect(sent.text).toContain(
      '2 approved, 1 rejected, 5 undecided of 8 items',
    );
    for (const index of [AT.firstFormWebkit, AT.firstRecordingChromium])
      expect(sent.text).toContain(itemAt(index).key);
    expect(sent.text).toContain('the label overlaps');
    expect(sent.text).toContain('smooth');
    expect(sent.text).not.toContain(itemAt(AT.firstResultChromium).key);
    await expect(signoff(page).locator('#send-state')).toHaveText(
      /^Sent to Claude\b/,
    );
    expect((await counters(page)).writes).toBe(before);
  });

  // A verdict names the journeys it was given on (#197). One given before the
  // page changed no longer speaks for it, and a session told "approved" would
  // act on an approval of a page nobody has seen.
  for (const { when, covers, says, never } of [
    {
      when: 'before the page changed',
      covers: (onPage: string[]) => [...onPage, 'a-journey-since-removed'],
      says: 'Sign-off: approved (out of date: given before this page changed)\n',
      never: undefined,
    },
    {
      when: 'on the page as it is',
      covers: (onPage: string[]) => onPage,
      says: 'Sign-off: approved\n',
      never: 'out of date',
    },
  ])
    test(`an approval given ${when} is sent as such`, async ({
      page,
    }, testInfo) => {
      const onPage = journeysOfPage(HTML);
      await openReviewPage(page, testInfo, {
        seed: {
          ...everyItemApproved(),
          [DOC]: {
            journeys: {},
            verdict: 'approved',
            verdictCovers: covers(onPage),
            note: '',
          },
        },
      });
      await signoff(page)
        .getByRole('button', { name: 'Send review to Claude' })
        .click();
      await expect
        .poll(async () => (await capabilityControl(page).sends()).length)
        .toBe(1);
      const [sent] = await capabilityControl(page).sends();
      expect(sent.text).toContain(says);
      if (never) expect(sent.text).not.toContain(never);
    });

  test('a long review is cut to 4 KiB and says how many items it left out', async ({
    page,
  }, testInfo) => {
    const seed = Object.assign(
      {},
      ...ITEMS.map((_, index) =>
        storedAs(index, 'rejected', `${index} `.repeat(1000)),
      ),
    );
    await openReviewPage(page, testInfo, { seed });
    await openItem(page, AT.secondRecordingChromium);
    await control(page, 'Skip').click();
    await viewer(page)
      .getByRole('button', { name: 'Send review to Claude' })
      .click();
    await expect
      .poll(async () => (await capabilityControl(page).sends()).length)
      .toBe(1);
    const [sent] = await capabilityControl(page).sends();

    expect(Buffer.byteLength(sent.text)).toBeLessThanOrEqual(4096);
    const included = sent.text.match(/^- Rejected:/gm) ?? [];
    expect(included.length).toBeGreaterThan(0);
    expect(included.length).toBeLessThan(ITEMS.length);
    expect(sent.text).toContain(
      `${ITEMS.length - included.length} more items left out`,
    );
  });

  for (const [canSend, reason] of [
    ['no_session', /no Claude session is watching this page/],
    ['writers_only', /only editors of this page can send/],
    ['off', /unavailable in this view/],
  ] as const)
    test(`says why it cannot send when sending is ${canSend}`, async ({
      page,
    }, testInfo) => {
      await openReviewPage(page, testInfo, {
        capabilities: { comments: { canSend, send: 'post' } },
      });
      const state = signoff(page).locator('#send-state');
      await expect(state).toHaveText(reason);
      await expect(state).toHaveText(/saved here for the next session to read/);
      await expect(
        signoff(page).getByRole('button', { name: 'Send review to Claude' }),
      ).toHaveCount(0);
    });

  for (const refusal of ['consent_required', 'forbidden'] as const)
    test(`says the review was not sent when sending is refused with ${refusal}`, async ({
      page,
    }, testInfo) => {
      await openReviewPage(page, testInfo, {
        capabilities: { comments: { canSend: 'available', send: refusal } },
      });
      const before = (await counters(page)).writes;
      await signoff(page)
        .getByRole('button', { name: 'Send review to Claude' })
        .click();
      await expect(signoff(page).locator('#send-state')).toHaveText(
        /^Not sent\b/,
      );
      expect(await capabilityControl(page).sends()).toHaveLength(1);
      expect((await counters(page)).writes).toBe(before);
    });
});
