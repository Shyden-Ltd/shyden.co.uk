import { test, expect } from './fixtures';
import { recordErrors } from './recorders';
import { SHYTALK_MARK, asComputedRgb } from '../../src/lib/shytalk-brand';

// Unset in test builds, so the page falls back to the production host. The
// dev deploy sets PUBLIC_SHYTALK_URL and is covered by the deploy-gate specs.
const SHYTALK_URL = 'https://shytalk.shyden.co.uk';
const SHYTALK_HOST = 'shytalk.shyden.co.uk';

test.describe('homepage content', () => {
  test('the hero leads with ShyTalk and every section is present', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText(/Shyden/i);
    const cta = page.locator('.hero').getByRole('link', {
      name: /explore shytalk/i,
    });
    await expect(cta).toHaveAttribute('href', SHYTALK_URL);
    // Both halves, or neither: noopener denies the opened page a handle back
    // to ours, noreferrer withholds the referrer.
    await expect(cta).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(cta).toHaveAttribute('target', '_blank');
    for (const id of ['shytalk', 'tools', 'contact']) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });

  test('every header nav item lands on a section that exists', async ({
    page,
  }) => {
    await page.goto('/');
    const hrefs = await page
      .locator('header nav a')
      .evaluateAll((links) =>
        links.map((l) => (l as HTMLAnchorElement).getAttribute('href') ?? ''),
      );
    const fragments = hrefs
      .filter((h) => h.includes('#'))
      .map((h) => h.slice(h.indexOf('#') + 1));
    // A liveness control: an empty nav would pass a per-item loop vacuously.
    expect(fragments.length).toBeGreaterThan(0);
    for (const fragment of fragments) {
      await expect(
        page.locator(`#${fragment}`),
        `header nav points at #${fragment}, which the page does not render`,
      ).toHaveCount(1);
    }
  });

  test('the ShyTalk showcase carries the brand wordmark and links out', async ({
    page,
  }) => {
    await page.goto('/');
    const showcase = page.locator('#shytalk');
    const wordmark = showcase.locator('.shytalk-wordmark');
    await expect(wordmark).toHaveText('ShyTalk');
    await expect(wordmark.locator('span')).toHaveText('Talk');
    // The two-tone logo colours, READ FROM the single source they are
    // rendered from. A literal triple here is unsearchable and survives a
    // rebrand as a silently wrong expectation.
    await expect(wordmark).toHaveCSS('color', asComputedRgb(SHYTALK_MARK.shy));
    await expect(wordmark.locator('span')).toHaveCSS(
      'color',
      asComputedRgb(SHYTALK_MARK.talk),
    );
    await expect(showcase.locator('.features li')).toHaveCount(4);
    await expect(
      showcase.locator(`a[href="${SHYTALK_URL}"]`).last(),
    ).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('exactly two tool cards, each badged and linked in-locale', async ({
    page,
  }) => {
    await page.goto('/');
    const cards = page.locator('#tools .work-card');
    await expect(cards).toHaveCount(2);
    await expect(page.locator('#tools .work-card-badge')).toHaveCount(2);
    await expect(page.locator('#tools a[href="/glory-points"]')).toHaveCount(1);
    await expect(
      page.locator('#tools a[href="/classroom-groups"]'),
    ).toHaveCount(1);
  });

  test('contact section CTA links to the support mailbox', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator('#contact').getByRole('link', { name: /email us/i }),
    ).toHaveAttribute('href', 'mailto:support@shyden.co.uk');
  });

  // Asserting the READ sentence, not just that the parts exist: the label and
  // the host are separate expression nodes, and the space between them is
  // dropped whenever a formatter puts them on separate lines — which shipped
  // "building.support@shyden.co.uk" to real phones on the old contact copy.
  // Checking either node alone cannot see that; only the rendered text can.
  for (const { locale, path, sentence } of [
    { locale: 'English', path: '/', sentence: `opens ${SHYTALK_HOST}` },
    { locale: 'Indonesian', path: '/id/', sentence: `membuka ${SHYTALK_HOST}` },
  ]) {
    test(`${locale}: the hero link annotation reads as one line`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.locator('.hero .opens')).toHaveText(sentence);
    });
  }

  test(
    'call-to-action buttons meet the 44×44px touch target',
    { tag: '@emulated-viewport' },
    async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto('/');
      const btns = page.locator('.btn');
      await expect(btns.first()).toBeVisible();
      for (const b of await btns.all()) {
        const box = await b.boundingBox();
        expect(box).not.toBeNull();
        expect(Math.round(box!.width)).toBeGreaterThanOrEqual(44);
        expect(Math.round(box!.height)).toBeGreaterThanOrEqual(44);
      }
    },
  );
});

test.describe('mobile-first layout', () => {
  for (const width of [320, 375, 768, 1280]) {
    test(
      `no horizontal scroll at ${width}px`,
      { tag: '@emulated-viewport' },
      async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      },
    );
  }
  test('no console errors on load', async ({ page }) => {
    const reported = recordErrors(page);
    await page.goto('/');
    await reported.expectNone('the homepage loads without console errors');
  });
});
