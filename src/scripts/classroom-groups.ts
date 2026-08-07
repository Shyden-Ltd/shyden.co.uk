/**
 * Classroom Group Creator — DOM wiring, animation and sound.
 *
 * Per the repo's working agreement, the logic lives in src/lib/grouping.ts and
 * this file only drives the page. It computes the arrangement FIRST, writes it
 * into the DOM as real text, and only then animates. That ordering is what
 * makes "skip the animation", a screen reader, and a finished deal all expose
 * exactly the same result — the animation is a presentation of the answer, never
 * the means of producing it.
 */
import {
  buildGroups,
  type Student,
  type Mode,
  type Leftovers,
  type SexMode,
} from '../lib/grouping';
import {
  getStrings,
  renderError,
  groupName,
  resultsHeadingText,
  type Strings,
} from '../lib/i18n';
import { sectionState } from '../lib/sections';
import { staleReason, type Snapshot } from '../lib/staleness';

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

const form = $<HTMLFormElement>('cg-form');
if (form) {
  // The FIRST statement in the module, before anything that could throw.
  //
  // A <form> with no `action` natively GETs its own url, so a native submit
  // is the one path by which anything typed on this page could reach a URL,
  // a history entry or an access log. Everything below is enhancement; this
  // line is the privacy promise, and it is deliberately not guarded by any
  // condition, wrapped in any try, or placed after any work that might fail.
  // The markup carries no `name` on a data field either — two independent
  // barriers, because one of them is one careless edit from being removed.
  form.addEventListener('submit', (e) => e.preventDefault());

  /**
   * Storage is a convenience, never a dependency. Safari's "Block all
   * cookies", partitioned third-party contexts and some managed device
   * profiles throw SecurityError on the mere act of touching localStorage.
   * Uncaught, that throw would abort this module — and a dead module is
   * precisely the state the guard above exists to survive.
   */
  const remember = {
    read: (key: string): string | null => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write: (key: string, value: string): void => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // The preference cannot follow them to their next lesson. The toggle
        // still works for this one, which is the part that matters now.
      }
    },
  };

  // ── how to use ────────────────────────────────────────────────────────
  // #cg-howto is page chrome, not one of the tool's sections (see
  // ClassroomGroupsPage.astro's own comment on it), so it is wired here,
  // ahead of everything below that reads the roster or the engine, and
  // ahead of `reduceMotion`'s window.matchMedia call further down -- which
  // is a real throw site (see classroom-groups-privacy.spec.ts's "a
  // mid-module failure still cannot leak the class list"). Wiring this
  // first means the one thing a visitor can always still open or close is
  // this section, even if something later in the module dies. The
  // collapsed/expanded state is a UI preference, never class data, so it
  // goes through the same try/catch-wrapped `remember` the sound toggle
  // below also uses -- see H-07 in the stage-2 traceability table.
  const HOWTO_KEY = 'cg-howto-collapsed';
  const howToToggle = $<HTMLButtonElement>('cg-howto-toggle');
  const howToBody = $<HTMLElement>('cg-howto-body');
  if (howToToggle && howToBody) {
    const applyHowTo = (isCollapsed: boolean) => {
      // Only the BODY ever gets `hidden`. The toggle itself is never
      // hidden by either state -- a control that hides itself is a trap,
      // and this is the only way back open once it is closed.
      howToBody.hidden = isCollapsed;
      howToToggle.setAttribute('aria-expanded', String(!isCollapsed));
    };
    applyHowTo(remember.read(HOWTO_KEY) === '1');
    howToToggle.addEventListener('click', () => {
      const next = !howToBody.hidden;
      applyHowTo(next);
      remember.write(HOWTO_KEY, next ? '1' : '0');
    });
  }

  // ── the tool's three built collapsible sections ─────────────────────────
  // Student details, Grouping options, Import / export. Same reason this is
  // wired here, ahead of `reduceMotion`'s throw site below, as #cg-howto's
  // own toggle just above: a mid-module failure further down must not be
  // able to leave any section header un-openable. Unlike #cg-howto, nothing
  // here is read from or written to `remember` -- design doc section 11
  // names exactly two UI preferences allowed to persist (the how-to
  // collapsed state, and a later print panel), and these are not one of
  // them, so every visit starts collapsed with no localStorage involved.
  // Sound & animation is not in this list: see ClassroomGroupsPage.astro's
  // own comment on why that section is not built yet.
  for (const id of ['cg-students', 'cg-grouping', 'cg-io']) {
    const toggle = $<HTMLButtonElement>(`${id}-toggle`);
    const body = $<HTMLElement>(`${id}-body`);
    if (!toggle || !body) continue;
    toggle.addEventListener('click', () => {
      const opening = body.hidden;
      body.hidden = !opening;
      toggle.setAttribute('aria-expanded', String(opening));
    });
  }

  const t: Strings = getStrings(document.documentElement.lang);
  // The engine's errors (and warnings) carry student NUMBERS, never names --
  // identity is the number, and grouping.ts has no roster to resolve one
  // from (see Student.number's doc comment there). `roster` is where a
  // number would resolve to a name; it is empty today because the
  // paste-names box that used to feed one is gone (see the fieldset removed
  // from ClassroomGroupsPage.astro) -- stage 3 is what populates it.
  // `resolveStudent` reads `roster`, falling back to the same numbered label
  // `renderError` itself defaults to when no resolver is passed at all.
  // `label` below calls this exact function instead of reading a name of its
  // own, so there is only ONE place a number becomes display text -- which
  // is what makes it true, not just intended, that the results grid and
  // every rendered error can never drift apart: nothing is left that could
  // resolve the two differently.
  const roster = new Map<number, string>();
  const resolveStudent = (n: number): string =>
    roster.get(n) ?? t.studentNumber(n);
  const errorBox = $<HTMLParagraphElement>('cg-error')!;
  const results = $<HTMLElement>('cg-results')!;
  const resultsHeadingEl = $<HTMLHeadingElement>('cg-results-h')!;
  const classInput = $<HTMLInputElement>('cg-class')!;
  const summary = $<HTMLParagraphElement>('cg-summary')!;
  const tables = $<HTMLDivElement>('cg-tables')!;
  const soundToggle = $<HTMLInputElement>('cg-sound')!;
  const soundText = $<HTMLSpanElement>('cg-sound-text')!;
  const speedSelect = $<HTMLSelectElement>('cg-speed')!;
  const goButton = $<HTMLButtonElement>('cg-go')!;

  const SOUND_KEY = 'cg-sound';
  const reduceMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;

  // ── settings ────────────────────────────────────────────────────────────
  // Sound defaults ON (operator decision). A stored preference wins, so a
  // teacher who muted it once is not surprised again on their next lesson.
  const stored = remember.read(SOUND_KEY);
  if (stored !== null) soundToggle.checked = stored === 'on';
  const syncSoundLabel = () => {
    soundText.textContent = soundToggle.checked ? t.soundOn : t.soundOff;
  };
  syncSoundLabel();
  soundToggle.addEventListener('change', () => {
    remember.write(SOUND_KEY, soundToggle.checked ? 'on' : 'off');
    syncSoundLabel();
  });

  // A device asking for reduced motion gets the result without the show, but
  // the teacher can still opt back in — it is a default, not a lock.
  if (reduceMotion) speedSelect.value = 'skip';

  // ── conditional fields ──────────────────────────────────────────────────
  const showFor = (attr: string, value: string) => {
    document.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((el) => {
      el.hidden = el.dataset[attr] !== value;
    });
  };
  const readRadio = (name: string) =>
    (
      form.querySelector(
        `input[name="${name}"]:checked`,
      ) as HTMLInputElement | null
    )?.value ?? '';

  // `mode`/`leftovers`/`sexMode` -- ONE function each, called from every
  // place that needs the live value (submit, the grouping header, and the
  // staleness snapshot further down) so none of the three can ever read a
  // different answer than the others. Two call sites computing the same
  // fact by hand is how a header ends up disagreeing with reality (see the
  // fix recorded on #cg-grouping's own header, Task 3) -- the same failure
  // mode a staleness snapshot built from its OWN separate reads could
  // reintroduce.
  //
  // `readMode` returns the exact shape buildGroups expects, not just the
  // radio's own value: #cg-size or #cg-groups can change while the radio
  // itself stays put, and staleReason's own doc comment (src/lib/staleness.ts)
  // is why the snapshot needs the WHOLE shape, JSON-stringified, in one
  // comparison rather than the number and the kind compared separately.
  const readMode = (): Mode =>
    readRadio('mode') === 'groupCount'
      ? {
          kind: 'groupCount',
          count: Number(($('cg-groups') as HTMLInputElement).value),
        }
      : {
          kind: 'perGroup',
          size: Number(($('cg-size') as HTMLInputElement).value),
        };
  const readLeftovers = (): Leftovers =>
    readRadio('leftovers') === 'bunch' ? 'bunch' : 'spread';
  // Hard-coded 'off', on purpose: #cg-sex-mix/#cg-sex-separate render
  // (Stage 2, Task 4) but stay permanently `disabled` -- src/lib/sexOptions.ts's
  // `sexWhy` always returns its "no list at all" reason, because there is
  // no roster on this page until stage 3. A native form already excludes a
  // disabled control's value from submission; reading `.checked` here would
  // honour the SAME rule by hand for no behavioural difference (an
  // unchecked, disabled checkbox reads `false` regardless), so this stays
  // hard-coded rather than adding a read that can only ever observe the one
  // value it already has. ONE function, not a literal repeated at every
  // call site, so the day stage 3 makes this live is a change made here
  // once, not a hunt through the file for every place 'off' was written by
  // hand. Pinned by classroom-groups-script.test.ts: the day this stops
  // returning a hard-coded literal is the day the two sex switches -- and
  // staleReason's own `staleSexMode` branch below -- become live.
  const readSexMode = (): SexMode => 'off';

  // `leftovers` is the one `ToolState` field a teacher can actually change
  // today: the radios now live inside `#cg-grouping-body` (Stage 2, Task 4
  // rehomed them there, unchanged), and the header must not go on reporting
  // "none" once one is chosen. This listener needed NO change for that
  // move: it delegates on `#cg-form`'s own `change` event and
  // `readRadio` queries `input[name="leftovers"]:checked` scoped to the
  // whole form, neither of which cares how deep the radio sits inside it.
  // Calls the SAME `sectionState` that produced the header's build-time
  // text (see ClassroomGroupsPage.astro's own `initialToolState`) with
  // every other field left at that same default -- no roster exists yet,
  // and nothing can mark the roster dirty until a later stage gives it
  // something to lose -- so the two can never disagree by computing the
  // sentence two different ways. `sexMode` stays `'off'` here for the same
  // reason `readSexMode` always returns `'off'` -- see that function's own
  // comment, above, for the rest of the reasoning.
  const groupingStateEl = document.querySelector<HTMLElement>(
    '#cg-grouping .state',
  );
  const updateGroupingHeader = () => {
    if (!groupingStateEl) return;
    groupingStateEl.textContent = sectionState(
      {
        named: 0,
        absent: 0,
        together: 0,
        apart: 0,
        rosterSize: 0,
        sexMode: readSexMode(),
        leftovers: readLeftovers(),
        dirty: false,
      },
      t,
    ).groupingOptions;
  };

  // ── staleness ────────────────────────────────────────────────────────────
  // Design spec section 8. `lastSnapshot` is what the groups ON SCREEN were
  // actually made from -- set once, at the end of a successful shuffle
  // (below), and never touched anywhere else. Every input/change event on
  // the form compares it against a FRESH read of the form (`snapshot()`),
  // so undoing a change needs no code of its own: the comparison simply
  // comes back equal again. `null` until the first shuffle, so nothing is
  // ever reported stale before there is anything on screen to be stale
  // about. See staleReason's own doc comment (src/lib/staleness.ts) for why
  // a comparison, not a flag, is the whole point.
  let lastSnapshot: Snapshot | null = null;
  const staleNotice = $<HTMLElement>('cg-stale')!;
  const staleText = $<HTMLParagraphElement>('cg-stale-text')!;

  const snapshot = (): Snapshot => ({
    mode: JSON.stringify(readMode()),
    leftovers: readLeftovers(),
    sexMode: readSexMode(),
    // Stage 3 fills this once a roster exists to summarise -- '' on both
    // sides of every comparison is honest until then, and can never read
    // as falsely stale (see Snapshot's own doc comment).
    roster: '',
  });

  const updateStaleness = () => {
    // No notice before there are groups to be stale (`lastSnapshot` is
    // still null), and none while the results section itself is hidden --
    // an error refusal already hides #cg-results (see the submit handler's
    // failure branch below), which takes this notice out of view with it;
    // there is nothing useful to compare against a shuffle that did not
    // happen.
    const reason =
      lastSnapshot && !results.hidden
        ? staleReason(lastSnapshot, snapshot(), t)
        : null;
    results.classList.toggle('stale', reason !== null);
    if (reason === null) {
      staleNotice.hidden = true;
      // Not just hidden -- CLEARED. `hidden` takes it out of the a11y tree,
      // but the text node itself would otherwise still sit in the DOM, and
      // a query that finds text regardless of visibility (Playwright's own
      // `getByText`, same as a browser extension or any other DOM-reading
      // tool) would still report "These groups are out of date" as present
      // on the page. Caught this exact way: "shuffling clears it" failed
      // with `getByText('out of date')` still resolving to 1 element,
      // hidden but not gone, before this line existed.
      staleText.textContent = '';
      return;
    }
    // Joins the tree before the sentence is written -- same reason
    // #cg-error/#cg-summary do, see the submit handler's own comment on
    // announcement ordering. Guarded so an unchanged reason (most
    // keystrokes, once already stale) does not re-write the same text into
    // a live region and risk a spurious re-announcement.
    staleNotice.hidden = false;
    if (staleText.textContent !== reason) staleText.textContent = reason;
  };

  form.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.name === 'mode') showFor('mode', target.value);
    if (target.name === 'naming') showFor('naming', target.value);
    if (target.name === 'leftovers') updateGroupingHeader();
    updateStaleness();
  });
  // The brief's own instruction: recompute on every `change` AND `input`
  // event, so a teacher typing a new group size sees the notice the moment
  // they type it, not only once the field loses focus.
  form.addEventListener('input', updateStaleness);

  // ── sound (synthesised; the site ships no audio assets by policy) ────────
  let audio: AudioContext | null = null;
  const tone = (
    freq: number,
    durationMs: number,
    type: OscillatorType = 'sine',
    gain = 0.05,
  ) => {
    if (!soundToggle.checked) return;
    try {
      audio ??= new (
        window.AudioContext ?? (window as any).webkitAudioContext
      )();
      const osc = audio.createOscillator();
      const vol = audio.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      vol.gain.value = gain;
      // Short fade so each blip ends cleanly instead of clicking.
      vol.gain.exponentialRampToValueAtTime(
        0.0001,
        audio.currentTime + durationMs / 1000,
      );
      osc.connect(vol).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + durationMs / 1000);
    } catch {
      // Audio is decoration. If the browser refuses, the tool still works.
    }
  };
  const sfx = {
    shuffle: () => tone(180, 220, 'triangle', 0.04),
    land: (i: number) => tone(420 + (i % 6) * 40, 90, 'square', 0.03),
    done: () => {
      tone(660, 160);
      setTimeout(() => tone(880, 260), 120);
    },
  };

  // ── rendering ───────────────────────────────────────────────────────────
  const AVATAR_HUES = [8, 34, 64, 122, 168, 200, 250, 288, 320, 344];

  /**
   * A CONSTANT with no interpolation, so this template can never carry
   * teacher-supplied text however the calling code is later edited. The
   * per-student colour arrives as a CSS custom property instead of being
   * spliced into the markup, and the name is set with textContent.
   * Decorative: hidden from assistive tech, which reads the name instead.
   */
  const AVATAR_SVG =
    '<svg class="avatar" viewBox="0 0 40 40" focusable="false" aria-hidden="true">' +
    '<circle class="a-bg" cx="20" cy="20" r="20"></circle>' +
    '<circle class="a-head" cx="20" cy="16" r="7"></circle>' +
    '<path class="a-body" d="M6 40a14 14 0 0 1 28 0Z"></path>' +
    '</svg>';

  /** Deterministic per student, so the same child keeps the same face. */
  const hueFor = (student: Student) =>
    AVATAR_HUES[student.number % AVATAR_HUES.length];

  const label = (student: Student) => resolveStudent(student.number);

  const render = (groups: Student[][], naming: string, theme: string) => {
    tables.textContent = '';
    groups.forEach((group, i) => {
      const card = document.createElement('section');
      card.className = 'group';
      const h = document.createElement('h3');
      h.textContent = groupName(
        i,
        naming === 'themed' ? 'themed' : 'numbered',
        theme,
        t,
      );
      const ul = document.createElement('ul');
      group.forEach((student, j) => {
        const li = document.createElement('li');
        li.className = 'student';
        li.style.setProperty('--hue', String(hueFor(student)));
        li.innerHTML = AVATAR_SVG; // constant markup, no interpolation
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = label(student); // the untrusted value, set as TEXT
        li.appendChild(who);
        ul.appendChild(li);
      });
      card.append(h, ul);
      tables.appendChild(card);
    });
  };

  const animate = async (groups: Student[][], speed: string) => {
    const cards = Array.from(tables.querySelectorAll<HTMLElement>('.student'));
    if (speed === 'skip') {
      cards.forEach((c) => c.classList.add('dealt'));
      return;
    }
    const step = speed === 'fast' ? 45 : 110;
    sfx.shuffle();
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.add('dealt');
      sfx.land(i);
      await new Promise((r) => setTimeout(r, step));
    }
    sfx.done();
  };

  // ── submit ──────────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;

    const mode = readMode();

    const count = Number(($('cg-count') as HTMLInputElement).value);
    const outcome = buildGroups({
      students: count, // a number until a future stage gives us a roster
      mode,
      leftovers: readLeftovers(),
      sexMode: readSexMode(), // hard-coded 'off' this stage -- see that function's own comment
      pinned: [], // a later stage wires the pins
      random: Math.random,
    });

    if (!outcome.ok) {
      results.hidden = true;
      // Unhidden BEFORE the text lands. A live region only reports mutations
      // to something already in the accessibility tree, so writing first and
      // revealing second announced nothing at all — the visitor pressed the
      // button and heard silence.
      errorBox.hidden = false;
      errorBox.textContent = renderError(outcome.error, t, resolveStudent);
      // No focus move: role="alert" is what announces this. The old
      // errorBox.focus?.() was neither a guard (focus always exists on an
      // HTMLElement, so the ?. never short-circuits) nor a focus move (a <p>
      // with no tabindex is not focusable) — it only looked like both.

      // The results are gone, so the button must stop offering to reshuffle
      // them. Left alone it still read "Shuffle again" from the last success.
      goButton.textContent = t.makeGroups;
      return;
    }

    // A success can still carry `warnings` -- e.g. "two girls ended up in a
    // group of boys" -- see grouping.ts's own module doc. Read here, not
    // dropped silently, but not yet rendered anywhere on the page: `sexMode`
    // stays `'off'` above (see that comment), so this array is always empty
    // today regardless. G-11 (test traceability matrix) is owed to stage 3,
    // which is what would give `sexMode` a way to ever be anything else.
    const { groups, warnings } = outcome.result;
    void warnings;
    const naming = readRadio('naming');
    const theme = ($('cg-theme') as HTMLSelectElement).value;

    // Read fresh at every submit -- never cached -- so a class name typed
    // or changed between two shuffles is picked up on the next one. Set
    // through `.textContent`, never `.innerHTML`: a teacher's typed text is
    // theirs, not markup, the same rule the results grid already follows
    // for a student's own name below (`who.textContent = label(student)`).
    // See resultsHeadingText's own doc comment (src/lib/i18n/index.ts) for
    // why the value is threaded through untrimmed. Written here, alongside
    // render() and before `results.hidden = false`, because -- like the
    // group cards `render()` builds -- this is structural content inside a
    // non-live section, not the `role="status"` region itself; only
    // `summary` below needs the write-after-reveal ordering that makes a
    // live-region announcement actually fire.
    resultsHeadingEl.textContent = resultsHeadingText(classInput.value, t);
    // Text first, animation second — see the note at the top of this file.
    render(groups, naming, theme);
    // Same ordering rule as the error path: the region joins the tree, and
    // only then is the sentence written into it.
    results.hidden = false;
    summary.textContent = t.resultsSummary(groups.length, groups.flat().length);
    goButton.textContent = t.again;
    // A fresh shuffle is, by definition, made from exactly what the form
    // says right now -- comparing that against itself returns null, which
    // is what clears any notice left over from before this shuffle. Set
    // AFTER results.hidden = false so updateStaleness's own guard sees a
    // visible section, though staleReason would return null either way.
    lastSnapshot = snapshot();
    updateStaleness();

    goButton.disabled = true;
    try {
      await animate(groups, speedSelect.value);
    } finally {
      // In a finally because a rejection here would otherwise leave the
      // button disabled for good — and a disabled default button also
      // suppresses Enter, so there would be no keyboard way out either.
      goButton.disabled = false;
    }
  });
}
