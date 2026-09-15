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

/** Serves the page as the builder rendered it, and nothing from any other host. */
async function serveEvidencePage(page: Page): Promise<void> {
  await page.route(/^https:\/\/evidence\.test\//, (route) =>
    route.request().url() === `${ORIGIN}/`
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: HTML })
      : route.fulfill({ status: 204 }),
  );
  // The builder links Google Fonts. Nothing in this suite reaches a third party.
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  );
}

async function openEvidencePage(
  page: Page,
  testInfo: TestInfo,
  options: Pick<DbStandInOptions, 'order'> & Partial<DbStandInOptions>,
): Promise<void> {
  await serveEvidencePage(page);
  await page.addInitScript(installDbStandIn, {
    storeKey: `evidence-db:${testInfo.testId}:${testInfo.repeatEachIndex}:${testInfo.retry}`,
    seed: {},
    holdUse: false,
    subscriptionDies: false,
    getFails: false,
    ...options,
  });
  await page.goto(`${ORIGIN}/`);
  // Nothing is delivered while use() is held, or when every read fails and no
  // subscription lives to deliver the stored state instead.
  if (!options.holdUse && !(options.getFails && options.subscriptionDies))
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
  page.locator('section.journey').filter({
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
      // Answer storage and read the status the moment the stored sign-off
      // lands, long before the 400 ms save: a status calling the page ready
      // over a tick that is not yet stored is caught in the act.
      const statusOnLoad = await page.evaluate(async () => {
        const standIn = (window as StandInWindow).__dbStandIn;
        standIn.answer();
        await new Promise<void>((resolve) => {
          const waiting = setInterval(() => {
            if (standIn.deliveries() === 0) return;
            clearInterval(waiting);
            resolve();
          }, 5);
        });
        return document.getElementById('state')?.textContent ?? '';
      });
      expect(statusOnLoad, 'the early tick is reported as saving').toMatch(
        /^Saving\b/,
      );
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

    test('ticks stay shown and stored after live updates stop', async ({
      page,
    }, testInfo) => {
      // Once a subscription has ended, nothing echoes the page's own writes.
      // A page that forgets a tick the moment its write is confirmed repaints
      // that tick off, and its next save writes the store without it. The
      // stored tick means every confirmed write folds into a delivered body.
      const stored = TITLES[4];
      const ticked = [TITLES[0], TITLES[1], stored];
      await openEvidencePage(page, testInfo, {
        order,
        seed: signedOff([stored]),
        subscriptionDies: true,
      });
      await expect(
        tickBox(page, stored),
        'the stored tick is shown first',
      ).toBeChecked();
      await toggleAndWait(page, TITLES[0]);
      await expect(
        tickBox(page, TITLES[0]),
        'the confirmed tick is still shown with no live updates',
      ).toBeChecked();
      await toggleAndWait(page, TITLES[1]);
      await expect
        .poll(
          () => storedTicks(page),
          'the store keeps every tick with no live updates',
        )
        .toEqual(idsOf(ticked));
      for (const title of ticked)
        await expect(
          tickBox(page, title),
          `"${title}" is shown ticked`,
        ).toBeChecked();
    });
  });
}

test.describe('evidence page sign-off, whatever the write order', () => {
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

  test('the status says so when live updates stop', async ({
    page,
  }, testInfo) => {
    await openEvidencePage(page, testInfo, {
      order: 'resolve-then-confirm',
      subscriptionDies: true,
    });
    await expect(
      page.locator('#state'),
      'the status names the subscription that ended',
    ).toHaveText(/^Live updates stopped\b.*\bunavailable\b/);
  });

  test('a view without storage says its ticks are local and never reports one saved', async ({
    page,
  }) => {
    // Opened outside claude.ai, the page finds no `window.claude` at all.
    await serveEvidencePage(page);
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator('#state')).toHaveText(
      /^Ticks are local to this view\b/,
    );
    await toggle(page, TITLES[0]);
    await expect(
      tickBox(page, TITLES[0]),
      'the tick is shown although it cannot be stored',
    ).toBeChecked();
    await expect(
      page.locator('#state'),
      'the tick is reported unsaved',
    ).toHaveText(/^Not saved\b.*\bcannot reach storage\b/);
  });

  test('a tick made while the stored sign-off cannot load is never written over it', async ({
    page,
  }, testInfo) => {
    // set() replaces the whole document, so a write made before the stored
    // sign-off has loaded would erase every tick already in it. The page's
    // clock lets the save window pass without a real wait.
    await page.clock.install();
    const seed = signedOff(TITLES.slice(0, 2));
    await openEvidencePage(page, testInfo, {
      order: 'resolve-then-confirm',
      seed,
      getFails: true,
      subscriptionDies: true,
    });
    // Both failures land before the status is read.
    await page.clock.runFor(1_000);
    await expect(
      page.locator('#state'),
      'the failed load is reported',
    ).toHaveText(/^Could not load the saved sign-off\b.*\bunavailable\b/);
    await toggle(page, TITLES[2]);
    await expect(
      tickBox(page, TITLES[2]),
      'the tick is shown although nothing has loaded',
    ).toBeChecked();
    await expect(
      page.locator('#state'),
      'the tick is reported not yet saved',
    ).toHaveText(/^Not saved yet\b/);
    await page.clock.runFor(2_000);
    const after = await page.evaluate((doc) => {
      const standIn = (window as StandInWindow).__dbStandIn;
      return { writes: standIn.writes(), stored: standIn.read(doc) };
    }, DOC);
    expect(after, 'nothing was written over the stored sign-off').toEqual({
      writes: 0,
      stored: seed[DOC],
    });
  });

  test('a malformed stored sign-off is shown, and written back, only in the shape the page writes', async ({
    page,
  }, testInfo) => {
    // The store is shared by every viewer, so whatever it delivers is untrusted.
    const [first, second, third, fourth] = TITLES;
    await openEvidencePage(page, testInfo, {
      order: 'resolve-then-confirm',
      seed: {
        [DOC]: {
          journeys: {
            [idOf(first)]: 'yes',
            [idOf(second)]: true,
            [idOf(third)]: 1,
          },
          verdict: 'hacked',
          note: 42,
          updatedAt: '2026-09-14T15:09:00.000Z',
        },
      },
    });
    await expect(
      tickBox(page, second),
      'a stored true is shown ticked',
    ).toBeChecked();
    for (const title of [first, third])
      await expect(
        tickBox(page, title),
        `"${title}" holds no boolean and is shown unticked`,
      ).not.toBeChecked();
    await expect(
      page.locator('#note'),
      'a note that is not text is not shown',
    ).toHaveValue('');
    await toggleAndWait(page, fourth);
    const stored = await page.evaluate(
      (doc) => (window as StandInWindow).__dbStandIn.read(doc),
      DOC,
    );
    expect(
      {
        journeys: stored?.journeys,
        verdict: stored?.verdict,
        note: stored?.note,
      },
      'only the shape the page writes is stored',
    ).toEqual({
      journeys: { [idOf(second)]: true, [idOf(fourth)]: true },
      verdict: null,
      note: '',
    });
  });

  test('a read that fails after live updates have loaded the sign-off changes nothing', async ({
    page,
  }, testInfo) => {
    // A transient `unavailable` rejects a read while the subscription carries
    // on (db.d.ts), so the sign-off can load first and the read fail after.
    await page.clock.install();
    await openEvidencePage(page, testInfo, {
      order: 'resolve-then-confirm',
      seed: signedOff(TITLES.slice(0, 1)),
      getFails: true,
    });
    // The late failure lands before anything is read.
    await page.clock.runFor(1_000);
    await expect(
      tickBox(page, TITLES[0]),
      'the stored tick arrived through live updates',
    ).toBeChecked();
    await expect(
      page.locator('#state'),
      'the late failure does not undo a load that succeeded',
    ).toHaveText(/^Ready\b/);
  });
});
