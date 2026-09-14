import type { Page, TestInfo } from '@playwright/test';
import { renderEvidencePage } from '../../scripts/build-evidence-page.mjs';
import {
  installDbStandIn,
  type DbStandInOptions,
  type StandInWindow,
  type StoredBody,
  type WriteOrder,
} from './db-stand-in';
import { test as base, expect } from './fixtures';
import { recordErrors } from './recorders';

/**
 * The evidence page's sign-off ticks, driven through the page's OWN rendered
 * script in a real browser (#172).
 *
 * The page kept the runtime's frozen snapshot as its own state, so after the
 * first save every tick was silently dropped and repainted unticked, while
 * the status line said "Saved." #136's sign-off kept 2 of its 5 ticks that
 * way, and #17's page had reported the same symptom three days earlier.
 * Nothing had ever run the script: the unit suite reads the page as text, and
 * text cannot freeze an object.
 *
 * Every behaviour runs against both orders a write can complete in (see
 * `db-stand-in.ts`). Ticks are found through their journey's HEADING, never
 * through the checkbox's own name, so these tests fail on the tick they name
 * and not on the naming defect #172 also fixes.
 */

const TITLES = [
  'the first journey',
  'the second journey',
  'the third journey',
  'the fourth journey',
  'the fifth journey',
] as const;

const SIGNOFF_KEY = 'ticket-172-fixture';
/** Where a published page keeps its sign-off, as `signoff/ticket-136` does. */
const DOC = `signoff/${SIGNOFF_KEY}`;
const ORIGIN = 'https://evidence.test';
/** A real 1x1 PNG, so no capture on the fixture page is a broken image. */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

const manifest = TITLES.map((title, index) => ({
  project: 'chromium',
  title: `evidence page > ${title}`,
  order: 1,
  label: `what ${title} shows`,
  file: `chromium/journey-${index + 1}.png`,
}));

/** The page exactly as the builder renders it for a five-journey ticket. */
const HTML: string = renderEvidencePage({
  manifest,
  report: {
    stats: {
      startTime: '2026-09-14T15:09:00.000Z',
      duration: 1000,
      expected: TITLES.length,
      unexpected: 0,
      flaky: 0,
      skipped: 0,
    },
    suites: [
      {
        specs: TITLES.map((title) => ({
          title,
          tests: [
            {
              projectName: 'chromium',
              results: [{ status: 'passed', duration: 100, attachments: [] }],
            },
          ],
        })),
      },
    ],
  },
  content: {
    title: 'Evidence page fixture',
    eyebrow: 'fixture',
    headline: 'A page with five journeys to sign off',
    lede: 'Rendered by the real builder.',
    signoffKey: SIGNOFF_KEY,
  },
  shots: new Map(manifest.map((entry) => [entry.file, PIXEL])),
});

/** Journey ids as the page rendered them, each paired with its heading. */
const JOURNEYS = Array.from(
  HTML.matchAll(/data-journey="([^"]+)"[\s\S]*?<h3>([^<]*)<\/h3>/g),
  ([, id = '', title = '']) => ({ id, title }),
);

const idOf = (title: string): string => {
  const journey = JOURNEYS.find((candidate) => candidate.title === title);
  if (!journey)
    throw new Error(
      `the rendered page has no journey headed "${title}"; it rendered ${JSON.stringify(JOURNEYS)}`,
    );
  return journey.id;
};

const idsOf = (titles: readonly string[]): string[] => titles.map(idOf).sort();

/** A stored sign-off with these journeys ticked, as an earlier visit left it. */
const signedOff = (titles: readonly string[]): Record<string, StoredBody> => ({
  [DOC]: {
    journeys: Object.fromEntries(titles.map((title) => [idOf(title), true])),
    verdict: null,
    note: '',
    updatedAt: '2026-09-14T15:09:00.000Z',
  },
});

/**
 * Every test also fails if the page script throws. In strict mode a write
 * into a frozen snapshot is a TypeError, so this names that mistake outright.
 */
const test = base.extend<{ pageErrors: void }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors = recordErrors(page);
      await use();
      await errors.expectNoUncaught(
        'the evidence page script threw while it was driven',
      );
    },
    { auto: true },
  ],
});

async function openEvidencePage(
  page: Page,
  testInfo: TestInfo,
  options: Pick<DbStandInOptions, 'order'> & Partial<DbStandInOptions>,
): Promise<void> {
  await page.route(/^https:\/\/evidence\.test\//, (route) =>
    route.request().url() === `${ORIGIN}/`
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: HTML })
      : route.fulfill({ status: 204 }),
  );
  // The builder links Google Fonts. Nothing in this suite reaches a third party.
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  );
  await page.addInitScript(installDbStandIn, {
    storeKey: `evidence-db:${testInfo.testId}:${testInfo.repeatEachIndex}:${testInfo.retry}`,
    seed: {},
    holdUse: false,
    ...options,
  });
  await page.goto(`${ORIGIN}/`);
  if (!options.holdUse)
    await expect
      .poll(
        async () => (await counters(page)).deliveries,
        'the page received its stored state',
      )
      .toBeGreaterThan(0);
}

const counters = (page: Page) =>
  page.evaluate(() => {
    const standIn = (window as StandInWindow).__dbStandIn;
    return {
      writes: standIn.writes(),
      inflight: standIn.inflight(),
      deliveries: standIn.deliveries(),
    };
  });

/** The journeys the store holds as ticked, as sorted ids. */
const storedTicks = (page: Page) =>
  page.evaluate((doc) => {
    const body = (window as StandInWindow).__dbStandIn.read(doc);
    const journeys = (body?.journeys ?? {}) as Record<string, unknown>;
    return Object.keys(journeys)
      .filter((id) => journeys[id] === true)
      .sort();
  }, DOC);

const journeySection = (page: Page, title: string) =>
  page
    .locator('section.journey')
    .filter({
      has: page.getByRole('heading', { level: 3, name: title, exact: true }),
    });

const tickBox = (page: Page, title: string) =>
  journeySection(page, title).getByRole('checkbox');

/** What a person clicks: the label around the tick, not the transparent input inside it. */
const toggle = (page: Page, title: string) =>
  journeySection(page, title)
    .locator('label')
    .filter({ has: page.getByRole('checkbox') })
    .click();

/** One tick, then wait for the page to write it and the store to confirm it, as a person would. */
async function toggleAndWait(page: Page, title: string): Promise<void> {
  const before = (await counters(page)).writes;
  await toggle(page, title);
  await expect
    .poll(async () => {
      const now = await counters(page);
      return now.writes > before && now.inflight === 0;
    }, `the page wrote the change to "${title}" and the store confirmed it`)
    .toBe(true);
}

/** Several ticks in ONE task, so they are certain to fall inside one save window. */
const toggleTogether = (page: Page, titles: readonly string[]) =>
  page.evaluate((wanted) => {
    for (const title of wanted) {
      const section = Array.from(
        document.querySelectorAll('section.journey'),
      ).find(
        (candidate) => candidate.querySelector('h3')?.textContent === title,
      );
      const label = section?.querySelector('label');
      if (!label) throw new Error(`no tick found for "${title}"`);
      label.click();
    }
  }, titles);

const ORDERS: ReadonlyArray<{ order: WriteOrder; when: string }> = [
  {
    order: 'resolve-then-confirm',
    when: 'a write resolves before its confirmed snapshot arrives',
  },
  {
    order: 'confirm-then-resolve',
    when: 'a confirmed snapshot arrives before its write resolves',
  },
];

for (const { order, when } of ORDERS) {
  test.describe(`evidence page sign-off ticks, when ${when}`, () => {
    test('the stand-in freezes every delivery and shows a write pending before confirming it', async ({
      page,
    }, testInfo) => {
      await openEvidencePage(page, testInfo, { order });
      const trace = await page.evaluate(async () => {
        const db = await (window as StandInWindow).claude.use('db');
        if (!db) return ['use resolved null'];
        const ref = db.doc('stand-in/self-test');
        const seen: string[] = [];
        let last: unknown;
        ref.onSnapshot((snap) => {
          const body = snap.data();
          const frozen = [snap, snap.metadata, body, body?.journeys].every(
            (part) => part === undefined || Object.isFrozen(part),
          );
          seen.push(
            `${snap.exists ? 'exists' : 'absent'}, pending ${snap.metadata.hasPendingWrites}, ` +
              `frozen ${frozen}, same body ${body !== undefined && body === last}`,
          );
          last = body;
        });
        const pause = (ms: number) =>
          new Promise((resolve) => setTimeout(resolve, ms));
        await pause(50);
        await ref.set({ journeys: { a: true } }).then(() => {
          seen.push('set resolved');
        });
        await pause(200);
        return seen;
      });
      const absent = 'absent, pending false, frozen true, same body false';
      const pending = 'exists, pending true, frozen true, same body false';
      const confirmed = 'exists, pending false, frozen true, same body true';
      expect(trace).toEqual(
        order === 'resolve-then-confirm'
          ? [absent, pending, 'set resolved', confirmed]
          : [absent, pending, confirmed, 'set resolved'],
      );
    });

    test('five ticks made one at a time all persist, and all five are still ticked after a reload', async ({
      page,
    }, testInfo) => {
      await openEvidencePage(page, testInfo, { order });
      for (const title of TITLES) await toggleAndWait(page, title);
      await expect
        .poll(() => storedTicks(page), 'the store keeps every journey ticked')
        .toEqual(idsOf(TITLES));
      await page.reload();
      for (const title of TITLES)
        await expect(
          tickBox(page, title),
          `"${title}" is still ticked after the reload`,
        ).toBeChecked();
    });

    test('a tick made when the stored sign-off already exists persists beside what was stored', async ({
      page,
    }, testInfo) => {
      await openEvidencePage(page, testInfo, {
        order,
        seed: signedOff(TITLES.slice(0, 2)),
      });
      await expect(
        tickBox(page, TITLES[1]),
        'the stored ticks are shown first',
      ).toBeChecked();
      for (const title of TITLES.slice(2)) await toggleAndWait(page, title);
      await expect
        .poll(
          () => storedTicks(page),
          'the store keeps the stored ticks and the new ones',
        )
        .toEqual(idsOf(TITLES));
      await page.reload();
      for (const title of TITLES)
        await expect(
          tickBox(page, title),
          `"${title}" is still ticked after the reload`,
        ).toBeChecked();
    });

    test('several ticks inside one save window all persist', async ({
      page,
    }, testInfo) => {
      await openEvidencePage(page, testInfo, { order });
      await toggleAndWait(page, TITLES[0]);
      await toggleTogether(page, TITLES.slice(1, 4));
      await expect
        .poll(
          () => storedTicks(page),
          'the store keeps every tick made inside the window',
        )
        .toEqual(idsOf(TITLES.slice(0, 4)));
    });

    test('a tick made before storage answers persists, and nothing already stored is lost', async ({
      page,
    }, testInfo) => {
      await openEvidencePage(page, testInfo, {
        order,
        seed: signedOff(TITLES.slice(0, 2)),
        holdUse: true,
      });
      await toggle(page, TITLES[2]);
      await expect(tickBox(page, TITLES[2])).toBeChecked();
      await page.evaluate(() => (window as StandInWindow).__dbStandIn.answer());
      await expect
        .poll(
          () => storedTicks(page),
          'the store keeps the stored ticks and the early one',
        )
        .toEqual(idsOf(TITLES.slice(0, 3)));
      for (const title of TITLES.slice(0, 3))
        await expect(
          tickBox(page, title),
          `"${title}" is shown ticked`,
        ).toBeChecked();
    });

    test('unticking persists too, so a review can be corrected', async ({
      page,
    }, testInfo) => {
      await openEvidencePage(page, testInfo, {
        order,
        seed: signedOff(TITLES.slice(0, 3)),
      });
      await expect(
        tickBox(page, TITLES[1]),
        'the stored ticks are shown first',
      ).toBeChecked();
      await toggleAndWait(page, TITLES[1]);
      await expect
        .poll(() => storedTicks(page), 'the store no longer holds the untick')
        .toEqual(idsOf([TITLES[0], TITLES[2]]));
      await page.reload();
      // The stored state has loaded before the untick is read, or an
      // unticked box would prove nothing.
      await expect(tickBox(page, TITLES[0])).toBeChecked();
      await expect(
        tickBox(page, TITLES[1]),
        'the untick survived the reload',
      ).not.toBeChecked();
      await expect(tickBox(page, TITLES[2])).toBeChecked();
    });

    test("another viewer's tick appears once this view has nothing unsaved", async ({
      page,
    }, testInfo) => {
      await openEvidencePage(page, testInfo, { order });
      await toggleAndWait(page, TITLES[0]);
      await page.evaluate(
        ({ doc, body }) =>
          (window as StandInWindow).__dbStandIn.remoteWrite(doc, body),
        { doc: DOC, body: signedOff(TITLES.slice(0, 2))[DOC] ?? {} },
      );
      await expect(
        tickBox(page, TITLES[1]),
        "the other viewer's tick is shown",
      ).toBeChecked();
      await expect(tickBox(page, TITLES[0])).toBeChecked();
    });

    test('the status never says Saved while the store lacks the tick just made', async ({
      page,
    }, testInfo) => {
      await openEvidencePage(page, testInfo, { order });
      await toggleAndWait(page, TITLES[0]);
      await expect(
        page.locator('#state'),
        'the first tick is reported saved',
      ).toHaveText(/^Saved\b/);
      await toggle(page, TITLES[1]);
      const claim = await page.evaluate(
        ({ doc, id }) => {
          const body = (window as StandInWindow).__dbStandIn.read(doc);
          const journeys = (body?.journeys ?? {}) as Record<string, unknown>;
          return {
            status: document.getElementById('state')?.textContent ?? '',
            stored: journeys[id] === true,
          };
        },
        { doc: DOC, id: idOf(TITLES[1]) },
      );
      expect(
        claim.stored || !/^Saved\b/.test(claim.status),
        `the status read "${claim.status}" while the store did not hold the tick on "${TITLES[1]}"`,
      ).toBe(true);
    });
  });
}

test.describe('evidence page sign-off markup', () => {
  test('each tick is named for the journey it marks', async ({
    page,
  }, testInfo) => {
    await openEvidencePage(page, testInfo, { order: 'resolve-then-confirm' });
    for (const title of TITLES)
      await expect(tickBox(page, title)).toHaveAccessibleName(
        `Reviewed: ${title}`,
      );
  });

  test('the save status is exposed to assistive technology as a status message', async ({
    page,
  }, testInfo) => {
    await openEvidencePage(page, testInfo, { order: 'resolve-then-confirm' });
    await expect(page.getByRole('status')).toHaveText(/^Ready\b/);
  });
});
