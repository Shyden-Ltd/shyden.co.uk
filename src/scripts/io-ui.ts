/**
 * The Import / export section's body.
 *
 * Same shape as `roster-ui.ts`: this file builds DOM and reports upward
 * through `handlers`; `classroom-groups.ts` owns the roster and decides
 * what to do with what a teacher chose. Nothing here reads or writes the
 * roster directly.
 *
 * `textContent`/`document.createElement` throughout, never `innerHTML` with
 * anything interpolated — a file's contents and a class name are a
 * teacher's text, not markup, and this section renders both.
 *
 * PRIVACY (design spec section 9, and the promise the page makes in both
 * languages): a download is a `Blob` and an object URL that is revoked the
 * moment the click is dispatched. Nothing here writes to `localStorage`,
 * `sessionStorage`, a cookie or the address bar, and
 * classroom-groups-privacy.spec.ts asserts exactly that after each
 * operation.
 */
import type { Student } from '../lib/grouping';
import type { Strings } from '../lib/i18n';
import type { Locale } from '../lib/csv-locale';
import { otherLocale, toolPath } from '../lib/i18n';
import {
  importFile,
  serialiseRoster,
  serialiseGroups,
  emptyTemplate,
  fileName,
  todayISO,
  type CsvProblem,
} from '../lib/csv';

export interface IoHandlers {
  getRoster: () => readonly Student[];
  /** The groups currently on screen, or `null` when there are none. */
  getGroups: () => Student[][] | null;
  getClassName: () => string;
  /** A file the teacher has accepted. Replaces the roster wholesale. */
  onImport: (roster: Student[], className: string) => void;
  /**
   * A file just left the page. The caller marks the roster saved --
   * design spec section 11's "unsaved changes — export to keep them"
   * has export as its other half, and this module owns no setter.
   *
   * Fired for the two EXPORTS only, never for the template: a template
   * downloaded with no roster on screen contains nobody, and one
   * downloaded with a roster is the same bytes as the export, but a
   * teacher pressing "Download template" is asking for a starting point,
   * not saving their work.
   */
  onExported: () => void;
}

const button = (text: string, className: string): HTMLButtonElement => {
  const el = document.createElement('button');
  // `type="button"` matters: this section's controls sit inside #cg-form,
  // and a button with no type is a SUBMIT button — clicking "Download
  // template" would shuffle the class.
  el.type = 'button';
  el.className = className;
  el.textContent = text;
  return el;
};

/**
 * Hand a file to the browser without it ever becoming a URL a teacher could
 * share or a server could log.
 *
 * The object URL is revoked immediately after the synthetic click. It is
 * same-origin, in-memory and short-lived even so, but leaving it alive
 * keeps the file's bytes reachable from `document` for the life of the
 * page, which is exactly the shape this tool promises not to have.
 */
const download = (text: string, name: string) => {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

export interface IoSection {
  /** Re-read what exists and show the controls that now apply. */
  refresh: () => void;
}

/**
 * The name of the in-memory channel the two tabs meet on, and the three
 * messages they exchange.
 *
 * A `BroadcastChannel` reaches every same-origin tab, which is exactly what
 * is needed and also exactly why the handshake carries an `id`: a teacher
 * with the tool open in three tabs must not have a fourth answer a request
 * meant for the tab that made it.
 *
 * Design spec section 9 rejected the alternatives explicitly, and they are
 * recorded here rather than only in the spec because this is where someone
 * would be tempted to reach for them: `sessionStorage` writes children's
 * names into browser-managed storage for the length of a page load, which
 * can survive a crash on a shared classroom machine; a URL is worse, and is
 * the exact defect closed as C1 in PR #8.
 */
const HANDOVER_CHANNEL = 'cg-handover';

/**
 * How long the sending tab waits to be asked before giving up and saying
 * so. Long enough for a cold tab to load and run its script on a slow
 * classroom machine; short enough that a teacher is not left guessing.
 *
 * The roster is KEPT either way -- design spec section 9: "The handover
 * must never lose data by failing silently."
 */
const HANDOVER_TIMEOUT_MS = 5000;

type HandoverMessage =
  | { kind: 'ask'; id: string }
  | { kind: 'roster'; id: string; roster: Student[]; className: string }
  | { kind: 'ack'; id: string };

export function renderIo(
  container: HTMLElement,
  t: Strings,
  locale: Locale,
  handlers: IoHandlers,
): IoSection {
  container.textContent = '';

  // ── import ──────────────────────────────────────────────────────────────
  const importField = document.createElement('div');
  importField.className = 'field cg-io-import';
  const importLabel = document.createElement('label');
  importLabel.htmlFor = 'cg-import';
  importLabel.textContent = t.ioImportLabel;
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.id = 'cg-import';
  // `accept` is a hint to the file picker, never a guarantee — the parser
  // is what actually decides, and it refuses anything it cannot read with
  // a message naming the row. A teacher whose file is called .txt is not
  // locked out.
  importInput.accept = '.csv,text/csv,text/plain';
  // NO `name` attribute. Every control on this page that could carry a
  // teacher's data deliberately has none, so that a native form GET (which
  // happens whenever the submit listener never attached) cannot put
  // anything in the address bar — see classroom-groups-privacy.spec.ts.
  importField.append(importLabel, importInput);

  // ── the two panels a file can produce ───────────────────────────────────
  const problems = document.createElement('div');
  problems.className = 'cg-io-problems';
  problems.id = 'cg-io-problems';
  problems.setAttribute('role', 'alert');
  problems.hidden = true;
  const problemsHeading = document.createElement('p');
  problemsHeading.textContent = t.ioProblemsHeading;
  const problemsList = document.createElement('ul');
  problems.append(problemsHeading, problemsList);

  // A successful import must SAY so. Everything else about it is
  // inference -- the roster appears in a section that is still collapsed,
  // and `#cg-io`'s own header quietly changes to "nothing to save yet" --
  // and a teacher who picked the wrong file needs to be told a file landed
  // at all. `role="status"`, not `alert`: this is good news and must not
  // interrupt.
  const imported = document.createElement('p');
  imported.className = 'cg-io-imported';
  imported.id = 'cg-io-imported';
  imported.setAttribute('role', 'status');
  imported.hidden = true;

  const confirm = document.createElement('div');
  confirm.className = 'cg-io-confirm';
  confirm.id = 'cg-io-confirm';
  confirm.setAttribute('role', 'alert');
  confirm.hidden = true;
  const confirmText = document.createElement('p');
  const confirmYes = button(t.ioReplaceConfirm, 'cg-io-replace');
  const confirmNo = button(t.ioReplaceCancel, 'cg-io-keep');
  const confirmButtons = document.createElement('div');
  confirmButtons.className = 'cg-io-confirm-buttons';
  confirmButtons.append(confirmYes, confirmNo);
  confirm.append(confirmText, confirmButtons);

  // ── exports ─────────────────────────────────────────────────────────────
  const buttons = document.createElement('div');
  buttons.className = 'cg-io-buttons';
  const exportRoster = button(t.ioExportClassList, 'cg-io-export');
  const exportGroups = button(t.ioExportGroups, 'cg-io-export-groups');
  const template = button(t.ioDownloadTemplate, 'cg-io-template');
  const bothLanguages = button(t.ioBothLanguages, 'cg-io-both');
  buttons.append(exportRoster, exportGroups, template, bothLanguages);

  // Design spec section 9, step 1: the teacher "is told what will happen"
  // BEFORE choosing, not after. Rendered beside the button rather than as
  // a confirmation dialog: a sentence a teacher can read at their own pace
  // beats one that blocks the page and gets dismissed unread.
  const bothHint = document.createElement('p');
  bothHint.className = 'cg-io-both-hint';
  bothHint.id = 'cg-io-both-hint';
  bothHint.textContent = t.ioBothLanguagesHint;
  bothLanguages.setAttribute('aria-describedby', 'cg-io-both-hint');

  const handover = document.createElement('p');
  handover.className = 'cg-io-handover';
  handover.id = 'cg-io-handover';
  handover.setAttribute('role', 'status');
  handover.hidden = true;

  container.append(
    importField,
    problems,
    confirm,
    imported,
    buttons,
    bothHint,
    handover,
  );

  // ── behaviour ───────────────────────────────────────────────────────────

  const showProblems = (found: CsvProblem[]) => {
    problemsList.textContent = '';
    for (const p of found) {
      const li = document.createElement('li');
      li.textContent = p.message;
      problemsList.appendChild(li);
    }
    problems.hidden = found.length === 0;
  };

  /**
   * Both panels describe ONE file; a new file supersedes whatever they said.
   *
   * The text is EMPTIED, not merely hidden. A `hidden` element keeps its
   * text in the DOM, where `getByText` still finds it and a future change
   * that reveals the panel for another reason would show last file's
   * sentence -- the same stale-message shape this codebase has already had
   * to fix on the results heading and the "Shuffle again" label.
   */
  const clearPanels = () => {
    showProblems([]);
    confirm.hidden = true;
    confirmText.textContent = '';
    imported.hidden = true;
    imported.textContent = '';
  };

  const applyImport = (roster: Student[], className: string) => {
    clearPanels();
    handlers.onImport(roster, className);
    // Unhidden BEFORE the text lands -- a live region only reports
    // mutations to something already in the accessibility tree, the same
    // ordering #cg-summary and #cg-error on this page already follow.
    imported.hidden = false;
    imported.textContent = t.ioImported(roster.length);
  };

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    // Clearing the value is what lets the SAME file be chosen twice --
    // without it a teacher who fixes their spreadsheet, saves over the
    // original and picks it again gets no `change` event at all, and the
    // page appears to ignore them.
    if (!file) return;
    const text = await file.text();
    importInput.value = '';
    clearPanels();

    const outcome = importFile(text, locale, t);
    if (!outcome.ok) {
      showProblems(outcome.problems);
      return;
    }

    // Design spec section 9: "Always warn first, naming what will be lost
    // -- including how much of it was filled in by hand. Never silent, even
    // when the counts match, because the same count can be a completely
    // different class." An EMPTY roster has nothing to lose, so it is the
    // one case with no warning: the warning exists to protect work, not to
    // add a step.
    const current = handlers.getRoster();
    if (current.length === 0) {
      applyImport(outcome.roster, outcome.className);
      return;
    }
    confirmText.textContent = t.ioReplaceWarning(
      current.length,
      current.filter((s) => s.name).length,
    );
    confirm.hidden = false;
    confirmYes.onclick = () => applyImport(outcome.roster, outcome.className);
    confirmNo.onclick = () => clearPanels();
  });

  exportRoster.addEventListener('click', () => {
    const className = handlers.getClassName();
    download(
      serialiseRoster([...handlers.getRoster()], className, locale),
      fileName('class-list', className, todayISO(), locale),
    );
    handlers.onExported();
  });

  exportGroups.addEventListener('click', () => {
    const groups = handlers.getGroups();
    if (!groups) return;
    const className = handlers.getClassName();
    const on = todayISO();
    download(
      serialiseGroups(groups, className, on, locale),
      fileName('groups', className, on, locale),
    );
    handlers.onExported();
  });

  // Design spec section 9, "Templates": context-sensitive. With no class
  // list on screen the template carries the headers plus example COMMENT
  // rows; with one present, the template IS your roster — which is the more
  // useful thing to open in Excel, and the reason this is one button rather
  // than two.
  template.addEventListener('click', () => {
    const roster = handlers.getRoster();
    download(
      roster.length > 0
        ? serialiseRoster([...roster], handlers.getClassName(), locale)
        : emptyTemplate(locale),
      fileName('class-list', handlers.getClassName(), todayISO(), locale),
    );
  });

  // ── the two-language handover (design spec section 9) ───────────────────
  //
  // Both roles live here, in every tab, because either page can be the
  // sender: the tool is bidirectional and "bidirectional" is precisely the
  // kind of claim that gets made about code that only works one way. A tab
  // is a RECEIVER if it was opened by this flow (marked by a hash on the
  // URL, which carries no data -- only the fact that someone is expected to
  // be listening) and a SENDER when the button is pressed.
  const channel =
    typeof BroadcastChannel === 'function'
      ? new BroadcastChannel(HANDOVER_CHANNEL)
      : null;

  const say = (message: string) => {
    // Unhidden BEFORE the text lands -- the same live-region ordering every
    // other status on this page follows.
    handover.hidden = false;
    handover.textContent = message;
  };

  /** The sender: export here, open the other page, answer its one question. */
  bothLanguages.addEventListener('click', () => {
    handover.hidden = true;
    handover.textContent = '';

    // Step 2 of the spec's own sequence: "The current page's file saves."
    // FIRST, unconditionally, before anything that can fail. A teacher who
    // hits a blocked pop-up must still end up with the file they asked for.
    const className = handlers.getClassName();
    const roster = [...handlers.getRoster()];
    download(
      serialiseRoster(roster, className, locale),
      fileName('class-list', className, todayISO(), locale),
    );
    handlers.onExported();

    if (!channel) {
      say(t.ioHandoverBlocked);
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const target = `${toolPath(otherLocale(locale))}#${HANDOVER_CHANNEL}`;
    const opened = window.open(target, '_blank');
    if (!opened) {
      // Design spec section 9: "If the tab is blocked ... say so plainly and
      // keep the roster where it is." The roster is untouched above; only
      // the handover failed.
      say(t.ioHandoverBlocked);
      return;
    }

    let settled = false;
    const finish = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      channel.removeEventListener('message', onMessage);
      say(message);
    };

    // "The source tab forgets the roster only once the new tab acknowledges
    // receipt" -- what is forgotten is the PENDING HANDOVER, not the
    // teacher's class list, which stays on screen either way. After `ack`
    // this tab stops answering, so a later `ask` from an unrelated tab
    // cannot be served a roster nobody asked it to hold.
    const onMessage = (event: MessageEvent<HandoverMessage>) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.kind === 'ask' && data.id === id) {
        channel.postMessage({ kind: 'roster', id, roster, className });
        return;
      }
      if (data.kind === 'ack' && data.id === id) finish(t.ioHandoverSent);
    };
    channel.addEventListener('message', onMessage);

    // The receiving tab does not know the id until it announces itself, so
    // the sender answers a bare ask too -- but only while this exchange is
    // live, which is what the timeout below bounds.
    const onAnyAsk = (event: MessageEvent<HandoverMessage>) => {
      if (event.data?.kind === 'ask' && event.data.id === 'any' && !settled) {
        channel.postMessage({ kind: 'roster', id, roster, className });
      }
    };
    channel.addEventListener('message', onAnyAsk);

    const timer = window.setTimeout(() => {
      channel.removeEventListener('message', onAnyAsk);
      finish(t.ioHandoverTimedOut);
    }, HANDOVER_TIMEOUT_MS);
  });

  // The receiver. Runs on EVERY page load, but asks only when the hash says
  // a handover is expected -- a page opened normally must not shout into a
  // channel other tabs are listening on.
  if (channel && window.location.hash === `#${HANDOVER_CHANNEL}`) {
    const onOffer = (event: MessageEvent<HandoverMessage>) => {
      const data = event.data;
      if (!data || data.kind !== 'roster') return;
      channel.removeEventListener('message', onOffer);
      handlers.onImport(data.roster, data.className);
      say(t.ioImported(data.roster.length));
      // The acknowledgement the sender waits for. Sent AFTER the roster is
      // applied, never before: an ack that arrives first would let the
      // sender report success for a handover that then failed to render.
      channel.postMessage({ kind: 'ack', id: data.id });
    };
    channel.addEventListener('message', onOffer);
    channel.postMessage({ kind: 'ask', id: 'any' });
  }

  const refresh = () => {
    // Design spec section 9: "Two buttons, and the groups one appears only
    // once groups exist." Removed from the accessibility tree, not merely
    // greyed: there is nothing to explain to a teacher who has not pressed
    // Make Groups yet, and a disabled control with no reason beside it is
    // the defect this design keeps catching elsewhere.
    exportGroups.hidden = handlers.getGroups() === null;
  };
  refresh();

  return { refresh };
}
