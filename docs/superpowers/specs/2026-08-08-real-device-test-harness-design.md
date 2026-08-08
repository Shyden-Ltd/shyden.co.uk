# Real-Device Test Harness — Design

**Date:** 2026-08-08
**Status:** Approved for implementation
**Goal:** Run the site's user journeys on **real phones**, in every browser those phones can
actually be driven in, concurrently — and be honest about the parts that are physically
impossible.

---

## 1. Why this exists

The suite already has five Playwright projects, two of which are named after phones. They are
not phones. Playwright's `devices['Pixel 5']` and `devices['iPhone 13']` set a viewport, a
user-agent string and a touch flag, then run a **desktop engine**. A green `mobile-safari` run
has never once executed iOS Safari.

That is not a theoretical gap. Every one of these was measured on real hardware on 2026-08-08,
and **not one is reproducible under emulation**:

| Finding | Consequence |
|---|---|
| A backgrounded Android Chrome stops producing frames | Playwright's actionability check waits for a *stable* bounding box, so **every click times out at 30s**. Cause is invisible: the element resolves fine. |
| `browser.newContext()` is unsupported on real Android Chrome | `Target.createBrowserContext` fails outright. The default Playwright `context` fixture cannot work. |
| The *Make Groups* button sits **1334px (en) / 1394px (id)** down a **759px** viewport | The real no-scroll gap is **575px / 635px** — far worse than the 419px the emulated 320px profile estimated, and the Indonesian page is 60px worse than the English one. |
| Real Chrome reports `411x759 @ dpr 3.5` | No emulated profile in the config matches this device. |

The last row is the summary of the whole argument: **we have been measuring a phone nobody owns.**

## 2. What is physically possible

This section is the honest boundary. It is not a to-do list; it is a statement of what the
hardware permits.

**Android — full parity.** Chrome for Android exposes CDP on the abstract unix socket
`@chrome_devtools_remote` whenever USB debugging is on. `adb forward` plus
`chromium.connectOverCDP()` yields a real Playwright `Browser`, so **the existing spec files run
unchanged on real hardware.** Verified: happy path (12 students → 4 groups) and unhappy path
(0 students → correct localised error) both pass, in both locales.

**iOS — journeys, not parity.** iOS Safari speaks only the WebKit Remote Inspector protocol.
Playwright cannot attach to it: there is no CDP on iOS, and although `safaridriver --bidi` exists,
`playwright-core` 1.61 exports only `chromium/firefox/webkit/_android/_electron` — the `_bidi*`
modules are server-internal, so no BiDi endpoint can be attached to. Verified by inspecting the
package exports, not assumed.

What *does* work is Apple's own `safaridriver`, which drives **real Safari on a real iPhone** over
W3C WebDriver — verified: a live session on iOS 27.0 / Safari 27.0. It needs no Appium and no
WebDriverAgent, therefore **no provisioning profile and no signing changes**.

**"All browsers on all devices" has a hard floor, and it is Apple's and Brave's, not ours:**

- **iOS has exactly one engine.** Every iOS browser is WKWebView. Chrome-for-iOS is Safari's
  engine in different chrome. Testing it adds a UI shell, not a rendering engine. (Alternative
  engines exist only under the EU DMA; this device is not in the EU.)
- **Brave for Android ships no DevTools socket** — verified absent while Brave was foregrounded.
  It cannot be driven.
- **Firefox for Android has no CDP at all.** Gecko never exposed one.

So the achievable matrix is: **Android Chrome (real) + iOS Safari (real)**, plus the emulated
projects. Anything claiming more would be claiming something untrue.

## 3. Layering — real devices are ADDED, never a replacement

The emulated projects stay, for two reasons that are not preferences:

1. **CI has no phones.** GitHub Actions cannot see a USB device. Deleting the emulated projects
   would leave every pull request with **zero** mobile coverage, with the real run happening only
   locally, only before a release.
2. **Only an emulated viewport can be resized.** The no-scroll rules are *defined* at 320×568,
   375×667, 768×1024 and 1280×800. A real phone has one screen. Those rules become unmeasurable
   the moment the emulated profiles are gone.

| Layer | Runs | Where | Scope |
|---|---|---|---|
| Emulated | every push | CI + local | 5 projects, full suite, viewport rules |
| **Real device** | **release gate** | **local only** | **Android: full suite. iOS: journeys.** |

## 4. Android project — design

**Transport.** `adb forward tcp:9222 localabstract:chrome_devtools_remote`, then
`chromium.connectOverCDP('http://127.0.0.1:9222')`.

**Reachability.** `adb reverse tcp:4321 tcp:4321` maps the device's `localhost:4321` to the Mac,
so `baseURL` needs no change and no URL is hardcoded.

**Fixtures.** Specs import `test`/`expect` from `tests/e2e/fixtures.ts` instead of
`@playwright/test`. That file overrides two fixtures and nothing else:

- `browser` (worker scope) — for a real-device project, connect over CDP; otherwise launch
  normally, honouring the project's own `launchOptions`.
- `context` (test scope) — for a real-device project, reuse `browser.contexts()[0]` (the device's
  one real context) and clear per-test state through a CDP session:
  `Storage.clearDataForOrigin { storageTypes: 'all' }`, verified to genuinely clear
  `localStorage`. **Do not close that context** — it belongs to the device, not the test.

**Preconditions are asserted, never assumed.** Before any test runs, a setup step fails loudly
with a named cause if: the device is absent, locked or asleep; the DevTools socket is missing; the
`adb reverse` mapping is absent; or **Chrome is not the foreground app**. That last one is the
single most expensive failure discovered — it presents as a generic 30-second click timeout with
nothing in the log to suggest the cause.

**Concurrency: 1 worker.** One device, one shared context, one shared `localStorage` origin.

## 5. iOS runner — design

A small W3C WebDriver client over `fetch` — **zero new dependencies**. `safaridriver` speaks plain
HTTP/JSON; a client covering session lifecycle, navigation, element location, text, click, typing,
`executeScript` and screenshots is small and is a *real driver for a real protocol*, not a mock of
Playwright.

**Concurrency: 1 session.** A second `POST /session` is refused with "already paired with another
WebDriver session", so iOS parallelism is exactly one, by Apple's design.

**Reachability.** There is no USB reverse tunnel. The server binds `0.0.0.0` and the iPhone uses
the Mac's **LAN IP, derived at runtime** (`ipconfig getifaddr en0`) — never hardcoded, never
crossed with another environment's URL.

**Scope.** The journeys: happy paths, unhappy paths and edge cases, in both locales — plus the
things only real Safari can prove (100vh behaviour, input zoom on focus, momentum scroll,
touch target size at real pixel density).

## 6. Exclusions, made visible

Tests that call `setViewportSize` are meaningless on hardware with one fixed screen — CDP would
happily emulate 1280×800 on a 411px phone and report a number describing nothing. They are tagged
`@emulated-viewport` and excluded from real-device projects.

**The exclusion is itself tested.** A guard test fails if a viewport-manipulating test is missing
its tag, so the exclusion list cannot silently rot as tests are added. A skipped row is never
reported as a passed row — `test.fixme` is confirmed not to auto-fail, so counts are stated as
passed / failed / **skipped-by-design**, separately.

## 7. Parallelism

One build, one server, three concurrent groups:

```
build once  →  serve dist on 0.0.0.0:4321  →  ┌─ desktop  (chromium, firefox, webkit)  N workers
                                              ├─ android  (real Chrome)                1 worker
                                              └─ ios      (real Safari)                1 worker
```

The runner aggregates exit codes explicitly. Piping a runner into another command discards its
status, so each group's status is captured directly and the run fails if **any** group fails.

## 8. What this does not do

- It does not test Brave or Firefox on Android — neither can be driven (§2).
- It does not run the full 1036 assertions on iOS — Playwright cannot reach iOS Safari (§2).
- It does not run in CI — CI has no phones (§3).
- It does not close the no-scroll gap. It **measures** it honestly for the first time: 575px (en)
  and 635px (id) on real hardware.
