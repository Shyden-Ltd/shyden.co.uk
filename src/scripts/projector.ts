import type { Strings } from '../lib/i18n';
import { fitScale } from '../lib/fit';

/**
 * The projector view: the groups on the wall, for the class to read.
 *
 * THE OVERLAY MOVES `#cg-results`; it never re-renders it. On entry the
 * results element is appended to the board and on exit put back exactly
 * where it was. That is why "a shuffle done on the board is what the page
 * shows on exit" needs no code of its own, and why a warning raised by a
 * board shuffle appears on the board: there is one element, one render
 * path, and nothing that can drift. A second rendering is how a projected
 * sheet ends up disagreeing with the screen.
 *
 * TWO ways of going full screen, because one is not reliable. The
 * Fullscreen API is used where it is granted; where it is refused -- iOS
 * Safari does not grant it on arbitrary elements at all, and any browser
 * may refuse outside a user gesture -- the board is a fixed full-viewport
 * layer instead. A refused promise landing in nothing would be a button
 * that silently does nothing, which is the defect this shape exists to
 * avoid.
 */

/** How long the bar waits, with no input, before fading out of the way. */
const FADE_AFTER_MS = 2500;

/**
 * The readable floor, and the size the sheet is drawn at.
 *
 * A projected name below about 24px stops being readable from the back of
 * a room. `fitScale` (src/lib/fit.ts) is where that decision lives and is
 * tested; these are the two numbers it is given.
 */
const BASE_PX = 40;

/** How long between one group appearing and the next. */
const REVEAL_STEP_MS = 220;
const FLOOR_PX = 24;

export interface ProjectorHandlers {
  /** Re-run the shuffle. The board shows whatever the page then shows. */
  onShuffle: () => void;
  /**
   * Why the board may not be opened right now, or `null`.
   *
   * Task 6 wires the out-of-date refusal through this. A predicate, not a
   * boolean read once: the answer changes as the teacher edits.
   */
  refuseReason?: () => string | null;
  /**
   * Whether a shuffle is already running.
   *
   * The board's Shuffle button and the page's deal button are the same
   * action, so they must share the same guard -- see the click handler
   * below for what two overlapping deals actually do.
   */
  busy?: () => boolean;
  /**
   * Whether the groups should be revealed one at a time, or simply be
   * there.
   *
   * Asked at every entry rather than read once: a teacher can change the
   * animation setting between one showing and the next, and design spec
   * section 8 treats `prefers-reduced-motion` and the Skip choice as the
   * same instruction — the caller collapses them.
   */
  animates?: () => boolean;
}

export interface Projector {
  setAvailable: (available: boolean) => void;
  /** Re-measure — after a shuffle changes how much there is to show. */
  refit: () => void;
}

export function renderProjector(
  doc: Document,
  t: Strings,
  handlers: ProjectorHandlers,
): Projector | null {
  const board = doc.getElementById('cg-board');
  const bar = doc.getElementById('cg-board-bar');
  const openButton = doc.getElementById('cg-board-open');
  const results = doc.getElementById('cg-results');
  if (!board || !bar || !openButton || !results) return null;

  // Focusable, but not in the tab order: the board is a destination for
  // focus, never a stop on the way through the page.
  board.tabIndex = -1;

  const stage = doc.createElement('div');
  stage.className = 'cg-board-stage';
  stage.id = 'cg-board-stage';
  board.appendChild(stage);

  const shuffle = doc.createElement('button');
  shuffle.type = 'button';
  shuffle.className = 'cg-board-shuffle';
  shuffle.textContent = t.boardShuffle;
  const exit = doc.createElement('button');
  exit.type = 'button';
  exit.className = 'cg-board-exit';
  exit.textContent = t.boardExit;
  bar.append(shuffle, exit);

  /**
   * Where the results element goes back to.
   *
   * A PLACEHOLDER this module owns, not a captured `nextSibling`: that
   * would be a live reference to a node anything else on the page may
   * remove or move, and restoring relative to a detached node throws --
   * silently leaving the board open with the page underneath unclickable.
   * A comment node costs nothing, renders nothing, and cannot be
   * invalidated by anyone but us.
   */
  const placeholder = doc.createComment('cg-results');
  results.parentElement?.insertBefore(placeholder, results);

  let fadeTimer = 0;
  /**
   * The reveal's own timers, one per group, so they can be CANCELLED.
   *
   * Left running they outlive the showing that started them: a teacher who
   * leaves mid-reveal has the remaining timers fire against groups that are
   * back on the page, and a second showing has last showing's pending
   * timers re-adding `revealed` out of order behind the new one. Neither is
   * visible in a test that lets the reveal finish, which is why they are
   * tracked rather than fired and forgotten.
   */
  let revealTimers: number[] = [];
  let open = false;

  /**
   * Never fade while the bar holds focus.
   *
   * A bar that vanishes under a focused button strands a keyboard user with
   * no visible way out -- the defect the fade would otherwise introduce,
   * and the reason this is a predicate rather than a plain timer.
   */
  const canFade = () => !bar.contains(doc.activeElement);

  const armFade = () => {
    bar.classList.remove('faded');
    window.clearTimeout(fadeTimer);
    if (!open) return;
    fadeTimer = window.setTimeout(() => {
      if (canFade()) bar.classList.add('faded');
    }, FADE_AFTER_MS);
  };

  /**
   * Size the stage so the groups fill the board without dropping below the
   * readable floor.
   *
   * Measured, then scaled, then told whether it still overflows -- the
   * decision itself is `fitScale`'s, which is pure and tested; this only
   * supplies the two boxes and applies the answer.
   */
  const refit = () => {
    if (!open) return;
    stage.style.removeProperty('transform');
    stage.style.removeProperty('font-size');
    const available = board.clientHeight - bar.offsetHeight;
    const needed = stage.scrollHeight;
    const { scale, scrolls } = fitScale(available, needed, FLOOR_PX, BASE_PX);
    stage.style.fontSize = `${BASE_PX * scale}px`;
    board.classList.toggle('scrolls', scrolls);
  };

  // Declared before `enter` because the fullscreen grant handler inside it
  // has to be able to call this -- see that handler's own comment.
  let leave: () => Promise<void>;

  /**
   * The reveal: each group arriving in turn, so a class watches rather than
   * reads a wall of names that was simply there.
   *
   * `revealing` goes on immediately and `revealed` follows one group at a
   * time; CSS carries the transition. Both classes are cleared first, so a
   * second showing reveals again rather than finding everything already
   * revealed.
   *
   * With animation off, the groups go straight to `revealed` and never
   * carry `revealing` at all -- not a faster animation, none.
   */
  /**
   * Cancel a reveal in progress AND undo its half-finished state.
   *
   * Clearing the timers is not enough on its own: a card left carrying
   * `revealing` without `revealed` is a card mid-transition, and it goes
   * back to the page in that state. It happens to render normally today
   * only because the rule is scoped to `.cg-board .group.revealing` -- a
   * scope that is one stylesheet edit away from not saving it. Undone here
   * so the cards are clean wherever they end up, rather than relying on a
   * selector to hide the mess.
   */
  const stopReveal = () => {
    for (const timer of revealTimers) window.clearTimeout(timer);
    revealTimers = [];
    for (const group of stage.querySelectorAll<HTMLElement>('.group')) {
      group.classList.remove('revealing', 'revealed');
    }
  };

  const reveal = () => {
    stopReveal();
    const groups = Array.from(stage.querySelectorAll<HTMLElement>('.group'));
    if (handlers.animates?.() === false) {
      for (const group of groups) group.classList.add('revealed');
      return;
    }
    for (const group of groups) group.classList.add('revealing');
    groups.forEach((group, i) => {
      revealTimers.push(
        window.setTimeout(
          () => group.classList.add('revealed'),
          i * REVEAL_STEP_MS,
        ),
      );
    });
  };

  const enter = () => {
    if (open) return;
    if (handlers.refuseReason?.()) return;
    open = true;
    stage.appendChild(results);
    board.hidden = false;
    doc.documentElement.classList.add('cg-board-open-page');
    // The API where it is granted. `.catch` is not a formality: iOS Safari
    // rejects on an arbitrary element, and the overlay below is already
    // showing either way, so a rejection costs nothing and is not an error
    // to report.
    // The request is asynchronous, and a teacher can press Escape before it
    // resolves -- a real race, not a theoretical one: the board is already
    // usable the instant it is shown, so the gap between asking for
    // fullscreen and getting it is a gap they can act in. Without the
    // `open` check below, a grant arriving after the exit puts the document
    // into fullscreen on a board that is already `display: none`, leaving
    // the whole page unreachable behind a blank fullscreen surface with no
    // way back but the browser's own.
    void board
      .requestFullscreen?.()
      .then(() => {
        if (!open) void leave();
      })
      .catch(() => {});
    // Focus MOVES to the board, which is what an overlay owes a keyboard
    // user: without it focus is left on a control now hidden behind the
    // board, Escape and every other key still go to the page, and the bar
    // never learns anyone is there. The BOARD, not the bar -- focusing the
    // bar would hold `canFade` false forever and the bar would never fade
    // at all.
    board.focus();
    reveal();
    armFade();
    refit();
  };

  leave = async () => {
    if (!open && !doc.fullscreenElement) return;
    if (!open && doc.fullscreenElement) {
      // The late-grant case: already left, but a fullscreen request landed
      // afterwards. Undo just that, and leave the rest alone -- it is
      // already in its closed state.
      await doc.exitFullscreen?.().catch(() => {});
      return;
    }
    open = false;
    window.clearTimeout(fadeTimer);
    // BEFORE the results element is moved back: `stopReveal` reaches the
    // cards through the stage, and once they have left it they are out of
    // its reach and would go back to the page still mid-transition.
    stopReveal();
    bar.classList.remove('faded');

    // FULLSCREEN FIRST, and AWAITED. `exitFullscreen` is asynchronous, and
    // until it resolves the document is still in fullscreen mode -- with
    // the board hidden, that leaves a viewport where nothing at all is
    // painted and nothing on the page can be clicked. Found by probing the
    // hit-test after a first exit: `elementsFromPoint` at the Full screen
    // button returned `[HTML]` and the page still reported
    // `overflow: hidden` with the scroll position frozen, which is exactly
    // that state and nothing else.
    //
    // Chromium GRANTS fullscreen here, so this path is the normal one, not
    // the exception -- the overlay fallback is what the refusal case uses.
    if (doc.fullscreenElement) {
      await doc.exitFullscreen?.().catch(() => {});
    }

    // Back exactly where it came from, before the board is hidden, so the
    // page is never briefly missing its results.
    placeholder.parentElement?.insertBefore(results, placeholder);
    board.hidden = true;
    doc.documentElement.classList.remove('cg-board-open-page');
    stage.style.removeProperty('font-size');
  };

  openButton.addEventListener('click', enter);
  exit.addEventListener('click', () => void leave());
  shuffle.addEventListener('click', () => {
    // The page's own deal button disables itself for the whole animation
    // (2.6s at 24 students). This one shares that fact rather than keeping
    // its own: without it, two presses during a deal start two overlapping
    // animate() loops -- doubled land sounds, the first loop re-enabling
    // the button while the second still runs, and `.dealt` being set on
    // cards the second render has already detached.
    if (handlers.busy?.()) return;
    handlers.onShuffle();
    // The cards were rebuilt by that shuffle, so they carry neither class
    // -- reveal them again rather than leaving a board of invisible groups.
    reveal();
    // …and there may be more or less of them than before. Without this a
    // board shuffle never re-measured at all, so a taller arrangement was
    // sized to the previous one and lost its bottom group off the board.
    refit();
    armFade();
  });

  // Any sign of a person brings the bar back: a mouse, a finger, a key.
  // Pointer events on the BOARD, because they can only happen over it --
  // but KEYS on the document, because a key goes to whatever holds focus
  // and that is not always inside the board (a browser control, the page
  // behind an overlay that did not take focus). Scoped by `open` instead.
  for (const event of [
    'pointermove',
    'mousemove',
    'pointerdown',
    'touchstart',
  ] as const) {
    board.addEventListener(event, armFade);
  }
  doc.addEventListener('keydown', () => {
    if (open) armFade();
  });
  // …and the bar's own focus changes, so tabbing INTO it cancels a pending
  // fade rather than racing it.
  bar.addEventListener('focusin', armFade);

  doc.addEventListener('keydown', (event) => {
    // Escape exits, faded or not. The one key that always means "get me
    // out", and the only way back for a keyboard user whose bar has faded.
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      void leave();
    }
  });

  // Leaving fullscreen by the browser's own means (F11, the Esc the API
  // itself consumes) must close the board too, or the overlay is left
  // covering a page nobody asked it to cover.
  doc.addEventListener('fullscreenchange', () => {
    if (open && !doc.fullscreenElement) void leave();
  });

  window.addEventListener('resize', refit);

  return {
    setAvailable: (available: boolean) => {
      openButton.hidden = !available;
      if (!available) void leave();
    },
    refit,
  };
}
