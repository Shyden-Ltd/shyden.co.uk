import { test, expect } from '@playwright/test';

/**
 * The page makes a promise in both languages: "No class list ever leaves this
 * page." These tests are that promise, written down.
 *
 * The threat is not an attacker — it is the form working exactly as HTML says
 * it should. A <form> with no action submits to its OWN url as a GET, so any
 * control carrying a `name` puts its value in the address bar, the browser's
 * history and the server's access log. That happens whenever the submit
 * listener is not attached, which is a real state: JavaScript blocked by a
 * school filter, a 404'd bundle after a partial deploy, or a top-level throw
 * before the listener registers.
 *
 * So the door is closed at the markup: no control holding anything a teacher
 * typed carries a `name` at all. The radio groups keep theirs because `name`
 * is what makes a radio group a group — but "students per group" is not
 * personal data.
 */

/** `name`s that may legitimately appear in a submitted form. */
const NON_PERSONAL_NAMES = ['mode', 'leftovers', 'naming'];

test.describe('privacy — the class list cannot leave the page', () => {
  for (const path of ['/classroom-groups', '/id/classroom-groups']) {
    test(`${path}: no control holding typed text is submittable`, async ({
      page,
    }) => {
      await page.goto(path);

      // Every named control in the form, by tag and type.
      const named = await page.locator('#cg-form [name]').evaluateAll((els) =>
        els.map((el) => ({
          name: el.getAttribute('name'),
          type: (el as HTMLInputElement).type,
        })),
      );

      expect(named.length).toBeGreaterThan(0); // the radios are still there

      // A `name` on anything but a radio is a leak waiting for a broken
      // script. This fails the moment someone adds one back.
      const leaky = named.filter((c) => c.type !== 'radio');
      expect(leaky).toEqual([]);

      const radioNames = [...new Set(named.map((c) => c.name))].sort();
      expect(radioNames).toEqual([...NON_PERSONAL_NAMES].sort());
    });
  }
});

test.describe('privacy — with JavaScript blocked', () => {
  test.use({ javaScriptEnabled: false });

  for (const [path, notice] of [
    ['/classroom-groups', 'This tool needs JavaScript enabled.'],
    ['/id/classroom-groups', 'Alat ini memerlukan JavaScript yang aktif.'],
  ] as const) {
    test(`${path}: says so, in its own language`, async ({ page }) => {
      await page.goto(path);
      // Not "a noscript tag exists" — the sentence a visitor actually reads.
      await expect(page.locator('#cg-noscript')).toHaveText(notice);
    });
  }

  test('submitting cannot put a class list in the URL', async ({ page }) => {
    await page.goto('/classroom-groups');

    // A teacher fills the form in and presses the button before noticing the
    // notice. With no listener attached, this is a native GET.
    await page.fill('#cg-count', '24');
    await page.fill('#cg-names', 'Ana\nBudi\nCitra');
    await page.click('#cg-go');

    // Whatever the browser did, nothing typed may appear in the address bar.
    const url = new URL(page.url());
    for (const child of ['Ana', 'Budi', 'Citra']) {
      expect(url.href).not.toContain(child);
    }

    // Stronger, and durable: the query may contain ONLY the allow-list. A new
    // `name` on a data field fails here even if today's fixture has no name
    // that happens to look personal.
    for (const key of url.searchParams.keys()) {
      expect(NON_PERSONAL_NAMES).toContain(key);
    }
  });
});

test.describe('privacy — when the script dies half-way', () => {
  /**
   * The barrier that matters is the one that holds in states nobody
   * enumerated. This breaks the module at a line in the MIDDLE — after setup
   * has begun, before the submit handler is reached — which is the shape of
   * every future bug that has not been written yet.
   *
   * The tool is dead here and that is not what is being asserted. What is
   * asserted is that a dead tool is still a silent one.
   */
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        get: () => () => {
          throw new Error('matchMedia unavailable');
        },
      });
    });
  });

  test('a mid-module failure still cannot leak the class list', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await page.fill('#cg-names', 'Ana\nBudi');
    await page.click('#cg-go');

    // No native submit happened, so no query string exists at all — not even
    // the harmless radio values. That is the unconditional guard registered
    // as the module's first statement, and nothing else.
    expect(new URL(page.url()).search).toBe('');
  });
});

test.describe('privacy — when storage is unavailable', () => {
  /**
   * Safari's "Block all cookies", storage-partitioned contexts and some MDM
   * profiles throw SecurityError on localStorage access. The sound preference
   * is decoration; failing to read it must not take the tool down with it,
   * because a dead script is exactly the state that leaks the class list.
   */
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      const boom = () => {
        throw new DOMException('denied', 'SecurityError');
      };
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => ({ getItem: boom, setItem: boom, removeItem: boom }),
      });
    });
  });

  test('the tool still makes groups', async ({ page }) => {
    await page.goto('/classroom-groups');
    await page.fill('#cg-count', '8');
    await page.fill('#cg-size', '4');
    await page.selectOption('#cg-speed', 'skip');
    await page.click('#cg-go');

    await expect(page.locator('#cg-results .student')).toHaveCount(8);
  });

  test('and the sound toggle still works, it just cannot remember', async ({
    page,
  }) => {
    await page.goto('/classroom-groups');
    await expect(page.locator('#cg-sound')).toBeChecked();
    await page.uncheck('#cg-sound');
    // The label still tracks the control — the write failed, silently and
    // correctly, without breaking the widget.
    await expect(page.locator('#cg-sound-text')).toHaveText('Sound off');
  });
});
