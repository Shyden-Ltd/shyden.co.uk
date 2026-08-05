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
import { buildGroups, parseKeepApart, type Student } from '../lib/grouping';
import { getStrings, renderError, groupName, type Strings } from '../lib/i18n';

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

  const t: Strings = getStrings(document.documentElement.lang);
  const errorBox = $<HTMLParagraphElement>('cg-error')!;
  const results = $<HTMLElement>('cg-results')!;
  const summary = $<HTMLParagraphElement>('cg-summary')!;
  const tables = $<HTMLDivElement>('cg-tables')!;
  const soundToggle = $<HTMLInputElement>('cg-sound')!;
  const soundText = $<HTMLSpanElement>('cg-sound-text')!;
  const speedSelect = $<HTMLSelectElement>('cg-speed')!;
  const namesBox = $<HTMLTextAreaElement>('cg-names')!;
  const apartBox = $<HTMLTextAreaElement>('cg-apart')!;
  const apartHint = $<HTMLParagraphElement>('cg-apart-hint')!;
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

  form.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.name === 'mode') showFor('mode', target.value);
    if (target.name === 'naming') showFor('naming', target.value);
  });

  // Keep-apart needs names to refer to. Disabling it with a visible reason is
  // kinder than letting the teacher type pairs that will be rejected.
  const syncApartAvailability = () => {
    const hasNames = namesBox.value.trim().length > 0;
    apartBox.disabled = !hasNames;
    apartHint.hidden = hasNames;
  };
  namesBox.addEventListener('input', syncApartAvailability);
  syncApartAvailability();

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
    AVATAR_HUES[student.id % AVATAR_HUES.length];

  const label = (student: Student) =>
    student.name ?? t.studentNumber(student.id);

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
        li.style.setProperty('--i', String(i + j));
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
    tables.classList.add('dealing');
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.add('dealt');
      sfx.land(i);
      await new Promise((r) => setTimeout(r, step));
    }
    tables.classList.remove('dealing');
    sfx.done();
  };

  // ── submit ──────────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;

    const names = namesBox.value.trim();
    const mode =
      readRadio('mode') === 'groupCount'
        ? {
            kind: 'groupCount' as const,
            count: Number(($('cg-groups') as HTMLInputElement).value),
          }
        : {
            kind: 'perGroup' as const,
            size: Number(($('cg-size') as HTMLInputElement).value),
          };

    const keepApart = apartBox.disabled ? [] : parseKeepApart(apartBox.value);

    const outcome = buildGroups({
      students: names
        ? names.split('\n')
        : Number(($('cg-count') as HTMLInputElement).value),
      mode,
      leftovers: readRadio('leftovers') === 'bunch' ? 'bunch' : 'spread',
      keepApart,
      random: Math.random,
    });

    if (!outcome.ok) {
      results.hidden = true;
      // Unhidden BEFORE the text lands. A live region only reports mutations
      // to something already in the accessibility tree, so writing first and
      // revealing second announced nothing at all — the visitor pressed the
      // button and heard silence.
      errorBox.hidden = false;
      errorBox.textContent = renderError(outcome.error, t);
      // No focus move: role="alert" is what announces this. The old
      // errorBox.focus?.() was neither a guard (focus always exists on an
      // HTMLElement, so the ?. never short-circuits) nor a focus move (a <p>
      // with no tabindex is not focusable) — it only looked like both.

      // The results are gone, so the button must stop offering to reshuffle
      // them. Left alone it still read "Shuffle again" from the last success.
      goButton.textContent = t.makeGroups;
      return;
    }

    const { groups } = outcome.result;
    const naming = readRadio('naming');
    const theme = ($('cg-theme') as HTMLSelectElement).value;

    // Text first, animation second — see the note at the top of this file.
    render(groups, naming, theme);
    // Same ordering rule as the error path: the region joins the tree, and
    // only then is the sentence written into it.
    results.hidden = false;
    summary.textContent = t.resultsSummary(groups.length, groups.flat().length);
    goButton.textContent = t.again;

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
