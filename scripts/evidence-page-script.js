/**
 * @typedef {import('./evidence-signoff.mjs').SignOff} SignOff
 * @typedef {import('./evidence-signoff.mjs').Standing} Standing
 * @typedef {import('./evidence-signoff.mjs').Verdict} Verdict
 */

/**
 * One capture the viewer steps through, as the builder hands it over.
 *
 * @typedef {object} Item
 * @property {string} key
 * @property {'screenshot' | 'recording'} kind
 * @property {string} journey
 * @property {string} journeyTitle
 * @property {number | null} assertion
 * @property {string} label
 * @property {string} engine
 * @property {string} filename
 * @property {string} [src] where a recording is served; a screenshot is read
 *   from the page itself
 */

/**
 * @typedef {'approved' | 'rejected' | null} Decision
 * @typedef {{ decision: Decision, note: string }} ItemState
 */

/**
 * Edits no completed write has carried yet, keyed 'journey:<id>', 'verdict',
 * 'verdictCovers' and 'note'.
 *
 * @typedef {Record<string, boolean | string | string[] | null>} Edits
 */

/**
 * The parts of the artifact runtime this page uses (runtime 0.2.52: db.d.ts,
 * downloads.d.ts, comments.d.ts).
 *
 * @typedef {{ data(): unknown }} DocSnapshot
 * @typedef {{ docs: { id: string, data(): unknown }[] }} CollectionSnapshot
 * @typedef {{
 *   get(): Promise<DocSnapshot>,
 *   set(body: object): Promise<unknown>,
 *   onSnapshot(next: (snap: DocSnapshot) => void, error: (e: unknown) => void): unknown,
 * }} DocRef
 * @typedef {{
 *   doc(id: string): DocRef,
 *   get(): Promise<CollectionSnapshot>,
 *   onSnapshot(next: (snap: CollectionSnapshot) => void, error: (e: unknown) => void): unknown,
 * }} CollectionRef
 * @typedef {{ doc(path: string): DocRef, collection(path: string): CollectionRef }} Db
 * @typedef {{ save(file: { filename: string, data: Blob }): Promise<unknown> }} Downloads
 * @typedef {{
 *   anchorFor(element: Element): Promise<unknown>,
 *   sendToClaude(comment: { anchor: unknown, text: string }): Promise<unknown>,
 *   canSendToClaude(): Promise<string>,
 * }} Comments
 * @typedef {((name: 'db') => Promise<Db | null>)
 *   & ((name: 'downloads') => Promise<Downloads | null>)
 *   & ((name: 'comments') => Promise<Comments | null>)} Use
 */

/**
 * The evidence page's own script. The builder embeds this function by its
 * source text and calls it with the sign-off helpers the unit tests and the
 * pre-merge check run (`evidence-signoff.mjs`, #197), so the page and those
 * checks cannot hold two versions of what a sign-off is.
 *
 * @param {{
 *   journeys: string[],
 *   doc: string,
 *   signOffOf: typeof import('./evidence-signoff.mjs').signOffOf,
 *   standingOf: typeof import('./evidence-signoff.mjs').standingOf,
 * }} env
 */
export function reviewPage(env) {
  'use strict';
  var signOffOf = env.signOffOf;
  var standingOf = env.standingOf;
  /**
   * An element the builder always renders, as the type the page uses it as.
   * One that is missing or of another kind fails here, naming its id, rather
   * than as a TypeError at the first click that reaches it.
   *
   * @template {Element} T
   * @param {string} id
   * @param {{ new (): T, prototype: T }} type
   * @returns {T}
   */
  function byId(id, type) {
    var found = document.getElementById(id);
    if (!(found instanceof type))
      throw new Error(
        'evidence page: #' + id + ' is missing or not a ' + type.name,
      );
    return found;
  }
  // The review items, read from the block the page carries rather than
  // interpolated into this text, so a figure and the item keyed to it cannot
  // disagree.
  /** @type {{ signoffKey: string, items: Item[] }} */
  var DATA = JSON.parse(
    byId('evidence-review', HTMLScriptElement).textContent || '',
  );
  var JOURNEYS = env.journeys;
  var DOC = env.doc;
  var JOURNEY_KEY = 'journey:';
  var READY = 'Ready. Your ticks and decision are saved as you make them.';
  var SAVED = 'Saved. Your decision persists on this page.';
  var LOCAL =
    'Ticks are local to this view \u2014 storage is not available here.';
  var NOT_SAVED =
    'Not saved \u2014 this view cannot reach storage. Your ticks are visible but will not persist.';
  var NOT_LOADED = 'Not saved yet \u2014 the saved sign-off has not loaded.';
  // The stored sign-off as this view last received it, always as the page's
  // OWN copy: the runtime delivers snapshots frozen, and a page that keeps one
  // as its state drops every later edit without an error (#172).
  var server = signOffOf(undefined);
  // Edits no completed write has carried yet, keyed 'journey:<id>', 'verdict',
  // 'verdictCovers' and 'note'. The page shows the server copy with these laid
  // over it, so no snapshot, early or late, can repaint an edit away.
  /** @type {Edits} */
  var pending = Object.create(null);
  /** @type {Db | null} */
  var db = null;
  var storageAbsent = false,
    loaded = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  var saveTimer = null;
  var stateEl = byId('state', HTMLElement);
  var progressEl = byId('progress', HTMLElement);
  var noteEl = byId('note', HTMLTextAreaElement);
  var approve = byId('btn-approve', HTMLButtonElement);
  var more = byId('btn-more', HTMLButtonElement);
  var standingEl = byId('standing', HTMLElement);
  // What the out-of-date notice last said. It is a live region, so it is
  // rebuilt only when that changes: a rebuild on every tick would be
  // announced again on every tick.
  var shownStanding = '';
  /**
   * @param {string} m
   * @param {boolean} ok
   */
  function say(m, ok) {
    stateEl.textContent = m;
    stateEl.className = 'state' + (ok ? ' saved' : '');
  }
  /** @param {unknown} e */
  function codeOf(e) {
    var code = e && typeof e === 'object' && 'code' in e ? e.code : undefined;
    return typeof code === 'string' ? code : 'unknown';
  }
  function hasPending() {
    return Object.keys(pending).length > 0;
  }
  /**
   * @param {SignOff} target
   * @param {Edits} edits
   * @returns {SignOff}
   */
  function overlay(target, edits) {
    Object.keys(edits).forEach(function (key) {
      var value = edits[key];
      if (key.indexOf(JOURNEY_KEY) === 0)
        target.journeys[key.slice(JOURNEY_KEY.length)] = value === true;
      else if (key === 'verdict')
        target.verdict =
          value === 'approved' || value === 'more' ? value : null;
      else if (key === 'verdictCovers')
        target.verdictCovers = Array.isArray(value) ? value : null;
      else if (key === 'note')
        target.note = typeof value === 'string' ? value : '';
    });
    return target;
  }
  function view() {
    return overlay(signOffOf(server), pending);
  }
  /** @param {(string | Node)[]} parts */
  function paragraph(parts) {
    var p = document.createElement('p');
    parts.forEach(function (part) {
      p.appendChild(
        typeof part === 'string' ? document.createTextNode(part) : part,
      );
    });
    standingEl.appendChild(p);
  }
  /**
   * A sentence naming `nodes` between `before` and `after`, comma-separated.
   *
   * @param {string} before
   * @param {Node[]} nodes
   * @param {string} after
   * @returns {(string | Node)[]}
   */
  function listed(before, nodes, after) {
    /** @type {(string | Node)[]} */
    var parts = [before];
    nodes.forEach(function (node, at) {
      if (at > 0) parts.push(', ');
      parts.push(node);
    });
    parts.push(after);
    return parts;
  }
  /** @param {string} id */
  function linkTo(id) {
    var link = document.createElement('a');
    var section = document.getElementById('j-' + id);
    var heading = section ? section.querySelector('h3') : null;
    link.href = '#j-' + id;
    link.textContent = heading ? heading.textContent : id;
    return link;
  }
  // A removed journey is named by the id the shared store holds, so it is
  // written as text and never parsed as markup.
  /** @param {string} id */
  function idOf(id) {
    var code = document.createElement('code');
    code.textContent = id;
    return code;
  }
  /** @param {Standing} standing */
  function showStanding(standing) {
    var said = JSON.stringify(standing);
    if (said === shownStanding) return;
    shownStanding = said;
    while (standingEl.firstChild) standingEl.removeChild(standingEl.firstChild);
    if (!standing.stale) return;
    var signedOff = standing.verdict === 'approved';
    var lead = document.createElement('strong');
    lead.textContent = signedOff
      ? 'Your sign-off is out of date.'
      : 'Your decision is out of date.';
    var onPage =
      JOURNEYS.length === 1
        ? 'the 1 journey'
        : 'the ' + JOURNEYS.length + ' journeys';
    if (standing.unrecorded) {
      paragraph([
        lead,
        ' It was saved before ' +
          (signedOff ? 'sign-offs' : 'decisions') +
          ' recorded the journeys they cover, so it cannot be matched to ' +
          onPage +
          ' on this page.',
      ]);
    } else {
      paragraph([
        lead,
        signedOff
          ? ' You signed off before this page changed.'
          : ' You asked for more tests before this page changed.',
      ]);
      if (standing.added.length > 0)
        paragraph(listed('Added since: ', standing.added.map(linkTo), '.'));
      if (standing.removed.length > 0)
        paragraph(
          listed('No longer on the page: ', standing.removed.map(idOf), '.'),
        );
    }
    paragraph([
      (standing.unrecorded
        ? 'Review them, then '
        : 'Review what changed, then ') +
        (signedOff
          ? 'press “' + approve.textContent + '” again.'
          : 'decide again.'),
    ]);
  }
  function paint() {
    var shown = view(),
      done = 0;
    var standing = standingOf(shown, JOURNEYS);
    JOURNEYS.forEach(function (id) {
      var box = document.getElementById('chk-' + id);
      if (!(box instanceof HTMLInputElement)) return;
      var on = shown.journeys[id] === true;
      box.checked = on;
      var sec = document.getElementById('j-' + id);
      if (sec) sec.classList.toggle('done', on);
      if (on) done++;
    });
    progressEl.textContent =
      done + ' of ' + JOURNEYS.length + ' journeys reviewed';
    // A verdict shows as given only while it covers exactly these journeys.
    approve.setAttribute(
      'aria-pressed',
      String(standing.verdict === 'approved' && !standing.stale),
    );
    more.setAttribute(
      'aria-pressed',
      String(standing.verdict === 'more' && !standing.stale),
    );
    showStanding(standing);
    if (document.activeElement !== noteEl) noteEl.value = shown.note;
  }
  function schedule() {
    say('Saving\u2026', false);
    clearTimeout(saveTimer ?? undefined);
    saveTimer = setTimeout(save, 400);
  }
  /** @param {Edits} edits */
  function change(edits) {
    Object.keys(edits).forEach(function (key) {
      pending[key] = edits[key];
    });
    paint();
    if (storageAbsent) {
      say(NOT_SAVED, false);
      return;
    }
    // set() replaces the whole document, so nothing is written before the
    // stored sign-off has loaded: an early write would erase it.
    if (!loaded) {
      say(NOT_LOADED, false);
      return;
    }
    schedule();
  }
  function save() {
    saveTimer = null;
    var carried = Object.assign(Object.create(null), pending);
    var body = Object.assign(view(), { updatedAt: new Date().toISOString() });
    // A save is scheduled only once the stored sign-off has loaded, and it
    // loads only through a store this page was handed.
    /** @type {Db} */ (db)
      .doc(DOC)
      .set(body)
      .then(
        function () {
          // The store now holds what this write carried. Once a subscription has
          // ended nothing echoes it back, so the server copy takes it from here.
          overlay(server, carried);
          Object.keys(carried).forEach(function (key) {
            if (pending[key] === carried[key]) delete pending[key];
          });
          paint();
          if (!hasPending() && saveTimer === null) say(SAVED, true);
        },
        function (e) {
          say('Could not save: ' + codeOf(e), false);
        },
      );
  }
  /** @param {DocSnapshot} snap */
  function receive(snap) {
    server = signOffOf(snap.data());
    if (!loaded) {
      loaded = true;
      if (hasPending()) schedule();
      else say(READY, true);
    }
    paint();
  }
  function markStorageAbsent() {
    storageAbsent = true;
    say(LOCAL, false);
    sayViewer(LOCAL_DECISIONS);
  }
  /** @type {NodeListOf<HTMLInputElement>} */ (
    document.querySelectorAll('input[data-journey]')
  ).forEach(function (box) {
    box.addEventListener('change', function () {
      /** @type {Edits} */
      var edit = {};
      edit[JOURNEY_KEY + box.dataset.journey] = box.checked;
      change(edit);
    });
  });
  // Giving a verdict records the journeys it is given on (#197), and pressing
  // the one already given, while it still covers this page, withdraws it.
  // Nothing else writes that list, so a tick or a note on an out-of-date page
  // cannot renew an approval.
  /** @param {Verdict} verdict */
  function withdraws(verdict) {
    var standing = standingOf(view(), JOURNEYS);
    return standing.verdict === verdict && !standing.stale;
  }
  /** @param {Verdict} verdict */
  function giveVerdict(verdict) {
    var withdraw = withdraws(verdict);
    change({
      verdict: withdraw ? null : verdict,
      verdictCovers: withdraw ? null : JOURNEYS.slice(),
    });
  }
  approve.addEventListener('click', function () {
    // Signing off speaks for every capture on the page, so a page with
    // captures still outstanding asks once before it records one. Nothing is
    // changed and nothing is written until "Sign off anyway".
    if (
      !withdraws('approved') &&
      !signOffAnyway &&
      outstandingIndexes().length
    ) {
      outstandingTextEl.textContent = outstandingSentence();
      outstandingEl.hidden = false;
      return;
    }
    outstandingEl.hidden = true;
    giveVerdict('approved');
  });
  more.addEventListener('click', function () {
    giveVerdict('more');
  });
  noteEl.addEventListener('input', function () {
    change({ note: noteEl.value });
  });
  // ------------------------------------------------------------------
  // The review viewer (#205). The page used to open a screenshot in a
  // lightbox that could only enlarge it; an operator looked at 120 pictures
  // and then ticked five journeys, with nothing recording what they thought
  // of any single one. This walks the captures one at a time, and each
  // decision is its own document, so a session can read back exactly which
  // capture was rejected and why.
  // ------------------------------------------------------------------
  var ITEMS = DATA.items;
  var ITEMS_PATH = DOC + '/items';
  var NOTE_MAX = 2000;
  var NOTE_DEBOUNCE_MS = 400;
  /** Far enough that a tap on the picture cannot be read as a swipe. */
  var SWIPE_MIN_PX = 48;
  /** What one comment to Claude may carry, as UTF-8 (comments.d.ts). */
  var SEND_MAX_BYTES = 4096;
  var LOCAL_DECISIONS =
    'Decisions are local to this view: storage is not available here.';
  /** @type {Record<string, string>} */
  var CANNOT_SEND = {
    no_session: 'no Claude session is watching this page',
    writers_only: 'only editors of this page can send to Claude',
    off: 'sending to Claude is unavailable in this view',
  };
  // One `d` per state, set on the badge's single <path>: three states share
  // one element, so the badge's own word stays the only text in it and a
  // test reading it back cannot pick up an icon's title by accident.
  /** @type {Record<string, string>} */
  var BADGE_ICON = {
    Approved: 'M6.2 11.3 3.5 8.6l-1 1.1 3.7 3.7 7.3-7.4-1-1z',
    Rejected:
      'M12.7 4.4 11.6 3.3 8 6.9 4.4 3.3 3.3 4.4 6.9 8l-3.6 3.6 1.1 1.1L8 9.1l3.6 3.6 1.1-1.1L9.1 8z',
    Note: 'M2 12.1V14h1.9l7-7-1.9-1.9zM13.8 5.5a.6.6 0 0 0 0-.8l-1.5-1.5a.6.6 0 0 0-.8 0l-1 1 2.3 2.3z',
  };

  var dialog = byId('viewer', HTMLDialogElement);
  var viewerItem = byId('viewer-item', HTMLElement);
  var viewerSummary = byId('viewer-summary', HTMLElement);
  var stage = byId('viewer-stage', HTMLElement);
  var shotEl = byId('viewer-image', HTMLImageElement);
  // Deliberately id-less: a screen reader and a Tab walk both report the
  // element that HOSTS a focused shadow control, and the browser's own media
  // controls are several tab stops inside this one element. Left nameless it
  // reads as what it is -- the recording -- rather than as a control of ours.
  var videoEl = /** @type {HTMLVideoElement} */ (stage.querySelector('video'));
  var waitEl = byId('viewer-wait', HTMLElement);
  var positionEl = byId('viewer-position', HTMLElement);
  var journeyEl = byId('viewer-journey', HTMLElement);
  var engineEl = byId('viewer-engine', HTMLElement);
  var titleEl = byId('viewer-title', HTMLElement);
  var decisionEl = byId('viewer-decision', HTMLElement);
  var viewerStateEl = byId('viewer-status', HTMLElement);
  var announceEl = byId('viewer-announce', HTMLElement);
  var noteBox = byId('viewer-note', HTMLTextAreaElement);
  var noteCountEl = byId('viewer-note-count', HTMLElement);
  var summaryCountsEl = byId('viewer-summary-counts', HTMLElement);
  var summaryListEl = byId('viewer-summary-list', HTMLElement);
  var approveBtn = byId('viewer-approve', HTMLButtonElement);
  var rejectBtn = byId('viewer-reject', HTMLButtonElement);
  var skipBtn = byId('viewer-skip', HTMLButtonElement);
  var previousBtn = byId('viewer-previous', HTMLButtonElement);
  var downloadBtn = byId('viewer-download', HTMLButtonElement);
  var undecidedBtn = byId('viewer-undecided', HTMLButtonElement);
  var goSignoffBtn = byId('viewer-go-signoff', HTMLButtonElement);
  var closeBtn = byId('viewer-close', HTMLButtonElement);
  var sendButtons = [
    byId('btn-send', HTMLButtonElement),
    byId('viewer-send', HTMLButtonElement),
  ];
  var sendStateEl = byId('send-state', HTMLElement);
  var itemsProgressEl = byId('items-progress', HTMLElement);
  var reviewProgressEl = byId('review-progress', HTMLElement);
  var outstandingEl = byId('outstanding', HTMLElement);
  var outstandingTextEl = byId('outstanding-text', HTMLElement);
  var signoffEl = byId('signoff', HTMLElement);

  // Every stored item as this view last received it, always as this page's
  // OWN object: the runtime delivers snapshots frozen (#172).
  /** @type {Record<string, ItemState>} */
  var itemsServer = Object.create(null);
  // Decisions and notes no completed write has carried yet, keyed by item.
  /** @type {Record<string, Partial<ItemState>>} */
  var itemsPending = Object.create(null);
  /** @type {CollectionRef | null} */
  var itemsCol = null;
  var itemsLoaded = false,
    signOffAnyway = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  var noteTimer = null;
  /** @type {string | null} */
  var noteKey = null;
  /** @type {Downloads | null} */
  var downloads = null;
  /** @type {Comments | null} */
  var comments = null;
  /** @type {{ x: number, y: number } | null} */
  var swipeFrom = null;
  /** @type {HTMLElement | null} */
  var returnTo = null;
  // Writes are serialised per item: one in flight, and at most one waiting.
  /** @type {Record<string, boolean>} */
  var inFlight = Object.create(null);
  /** @type {Record<string, boolean>} */
  var dirty = Object.create(null);
  // The items this walk steps through, as positions in ITEMS, and where in
  // that walk we are. `walk.length` is the summary after the last one.
  /** @type {number[]} */
  var walk = [];
  var at = 0;

  /** @type {Record<string, number>} */
  var byKey = Object.create(null);
  ITEMS.forEach(function (item, index) {
    byKey[item.key] = index;
  });

  function everyIndex() {
    return ITEMS.map(function (_item, index) {
      return index;
    });
  }
  /** @param {number} n */
  function grouped(n) {
    return String(n).replace(/\B(?=(\d{3})+$)/g, ',');
  }
  /** @param {Item} item */
  function describe(item) {
    return (
      item.journeyTitle +
      ', ' +
      (item.kind === 'recording'
        ? 'recording'
        : 'assertion ' + item.assertion) +
      ', ' +
      item.engine
    );
  }
  /** @param {Decision} decision */
  function decisionWord(decision) {
    return decision === 'approved'
      ? 'Approved'
      : decision === 'rejected'
        ? 'Rejected'
        : 'Not decided';
  }
  /** @param {string} key */
  function figureOf(key) {
    return document.querySelector('[data-item="' + key + '"]');
  }
  /** @param {string} message */
  function sayViewer(message) {
    viewerStateEl.textContent = message;
  }
  /** @param {string} message */
  function saySend(message) {
    sendStateEl.textContent = message;
  }
  function currentItem() {
    return at < walk.length ? ITEMS[walk[at]] : null;
  }

  /**
   * Keeps only the shape this page writes, and only whole. The store is
   * shared by every viewer, so a stored item is untrusted input: a body that
   * is not this shape is ignored ENTIRELY and never written back, rather than
   * repaired into a decision nobody made.
   *
   * @param {unknown} body
   * @returns {ItemState | null}
   */
  function itemCopyOf(body) {
    if (!body || typeof body !== 'object') return null;
    var source = /** @type {Record<string, unknown>} */ (body);
    var decision = source.decision;
    if (decision !== 'approved' && decision !== 'rejected' && decision !== null)
      return null;
    var note = source.note;
    if (typeof note !== 'string' || note.length > NOTE_MAX) return null;
    if (typeof source.at !== 'string') return null;
    return { decision: decision, note: note };
  }

  /**
   * What the page shows for an item: the store with this view's edits over it.
   *
   * @param {string} key
   * @returns {ItemState}
   */
  function itemView(key) {
    var stored = itemsServer[key];
    var edits = itemsPending[key] || {};
    return {
      decision:
        edits.decision !== undefined
          ? edits.decision
          : stored
            ? stored.decision
            : null,
      note: edits.note !== undefined ? edits.note : stored ? stored.note : '',
    };
  }
  /**
   * @template {keyof ItemState} F
   * @param {string} key
   * @param {F} field
   * @param {ItemState[F]} value
   */
  function setPending(key, field, value) {
    var edits = itemsPending[key] || (itemsPending[key] = {});
    edits[field] = value;
  }
  function countsOf() {
    var approved = 0,
      rejected = 0;
    ITEMS.forEach(function (item) {
      var decision = itemView(item.key).decision;
      if (decision === 'approved') approved++;
      else if (decision === 'rejected') rejected++;
    });
    var undecided = ITEMS.length - approved - rejected;
    return {
      approved: approved,
      rejected: rejected,
      undecided: undecided,
      sentence:
        approved +
        ' approved, ' +
        rejected +
        ' rejected, ' +
        undecided +
        ' undecided of ' +
        ITEMS.length +
        ' items',
    };
  }
  function undecidedIndexes() {
    /** @type {number[]} */
    var list = [];
    ITEMS.forEach(function (item, index) {
      if (itemView(item.key).decision === null) list.push(index);
    });
    return list;
  }
  /** Everything not approved: a rejection is outstanding as much as a gap is. */
  function outstandingIndexes() {
    /** @type {number[]} */
    var list = [];
    ITEMS.forEach(function (item, index) {
      if (itemView(item.key).decision !== 'approved') list.push(index);
    });
    return list;
  }
  function outstandingSentence() {
    var counts = countsOf();
    return (
      counts.rejected +
      ' rejected and ' +
      counts.undecided +
      ' undecided of ' +
      ITEMS.length +
      ' items are still outstanding. Sign off anyway only if you meant to.'
    );
  }

  /** @param {string} key */
  function writeItem(key) {
    var edits = itemsPending[key];
    if (!edits || Object.keys(edits).length === 0) return;
    // Nothing is written before the stored items have loaded: set() replaces
    // the whole document, and an early write would erase the note or the
    // decision an earlier visit left there.
    if (storageAbsent || !itemsLoaded || !itemsCol) return;
    if (inFlight[key]) {
      dirty[key] = true;
      return;
    }
    var carried = Object.assign({}, edits);
    var body = Object.assign(itemView(key), { at: new Date().toISOString() });
    inFlight[key] = true;
    itemsCol
      .doc(key)
      .set(body)
      .then(
        function () {
          // The store now holds what this write carried. Once a subscription
          // has ended nothing echoes it back, so this page's own copy takes it
          // from here -- mutated, because a delivered snapshot is frozen.
          var mine =
            itemsServer[key] ||
            (itemsServer[key] = { decision: null, note: '' });
          mine.decision = body.decision;
          mine.note = body.note;
          var left = itemsPending[key];
          if (left) {
            /** @type {(keyof ItemState)[]} */ (Object.keys(carried)).forEach(
              function (field) {
                if (left[field] === carried[field]) delete left[field];
              },
            );
            if (Object.keys(left).length === 0) delete itemsPending[key];
          }
          inFlight[key] = false;
          if (dirty[key]) {
            dirty[key] = false;
            writeItem(key);
          }
          paintReview();
        },
        function (e) {
          inFlight[key] = false;
          sayViewer('Could not save this decision: ' + codeOf(e));
        },
      );
  }

  /** @param {string} key */
  function scheduleNote(key) {
    flushNotes(key);
    noteKey = key;
    noteTimer = setTimeout(function () {
      noteTimer = null;
      noteKey = null;
      writeItem(key);
    }, NOTE_DEBOUNCE_MS);
  }
  /**
   * Sends a note still waiting on its debounce, unless it belongs to
   * `except` -- whose caller is about to write it beside a decision, so that
   * the two reach the store as one document rather than as two writes.
   *
   * @param {string | null} except
   */
  function flushNotes(except) {
    if (noteTimer === null) return;
    clearTimeout(noteTimer);
    noteTimer = null;
    var key = noteKey;
    noteKey = null;
    if (key && key !== except) writeItem(key);
  }

  /**
   * A journey's tick follows its own captures: every one approved ticks it,
   * any one rejected unticks it, and anything else leaves whatever the
   * operator set by hand. Written only when it differs from the tick already
   * on the page, so stepping through a journey does not write the sign-off
   * once per capture.
   *
   * @param {string} journeyId
   */
  function rollUp(journeyId) {
    var decisions = ITEMS.filter(function (item) {
      return item.journey === journeyId;
    }).map(function (item) {
      return itemView(item.key).decision;
    });
    if (decisions.length === 0) return;
    var allApproved = decisions.every(function (d) {
      return d === 'approved';
    });
    var anyRejected = decisions.some(function (d) {
      return d === 'rejected';
    });
    if (!allApproved && !anyRejected) return;
    if ((view().journeys[journeyId] === true) === allApproved) return;
    /** @type {Edits} */
    var edit = {};
    edit[JOURNEY_KEY + journeyId] = allApproved;
    change(edit);
  }

  function paintBadges() {
    ITEMS.forEach(function (item) {
      var figure = figureOf(item.key);
      var badge = figure ? figure.querySelector('.badge') : null;
      var text = badge ? badge.querySelector('.badge-text') : null;
      var icon = badge ? badge.querySelector('path') : null;
      if (!(badge instanceof HTMLElement) || !text || !icon) return;
      var shown = itemView(item.key);
      var state =
        shown.decision === 'approved'
          ? 'Approved'
          : shown.decision === 'rejected'
            ? 'Rejected'
            : shown.note !== ''
              ? 'Note'
              : '';
      badge.hidden = state === '';
      if (state === '') return;
      badge.className = 'badge ' + state.toLowerCase();
      text.textContent = state;
      icon.setAttribute('d', BADGE_ICON[state] || '');
    });
  }
  function paintReview() {
    paintBadges();
    var sentence = countsOf().sentence;
    itemsProgressEl.textContent = sentence;
    reviewProgressEl.textContent = sentence;
    var item = currentItem();
    if (dialog.open && item) paintDecision(item);
  }
  /** @param {Item} item */
  function paintDecision(item) {
    var shown = itemView(item.key);
    decisionEl.textContent = decisionWord(shown.decision);
    if (document.activeElement !== noteBox) noteBox.value = shown.note;
    paintNoteCount();
  }
  function paintNoteCount() {
    noteCountEl.textContent =
      grouped(noteBox.value.length) +
      ' of ' +
      grouped(NOTE_MAX) +
      ' characters';
  }

  /**
   * Approve is the one control that claims the capture was SEEN, so it waits
   * until this browser has painted it. Reject and Skip never wait: a capture
   * that will not load is exactly what an operator needs to be able to
   * reject, and a disabled Reject would leave them nothing to say.
   */
  function refreshReady() {
    var item = currentItem();
    if (!dialog.open || !item) return;
    var ready =
      item.kind === 'recording'
        ? videoEl.readyState >= 1
        : shotEl.complete && shotEl.naturalWidth > 0;
    approveBtn.disabled = !ready;
    waitEl.hidden = ready;
    waitEl.textContent = ready
      ? ''
      : 'Approve is available once the ' +
        (item.kind === 'recording' ? 'recording' : 'screenshot') +
        ' has loaded.';
  }

  /**
   * Hiding the pane that held focus drops focus on <body>, and from there
   * every key goes to the document instead of the dialog: the walk stops
   * dead at the next Arrow, with the viewer still open and looking fine.
   * Focus goes back to the dialog itself rather than to a control, so
   * arriving at an item cannot arm a decision nobody has made yet.
   */
  function keepFocusInside() {
    var active = document.activeElement;
    if (!active || !dialog.contains(active)) dialog.focus();
  }

  function show() {
    var item = currentItem();
    // Move focus out BEFORE the pane holding it is hidden. Reading
    // `activeElement` afterwards is too late to be reliable: the browser may
    // reset it at the next rendering step, so the check would still find
    // focus "inside" a pane that is already gone.
    var leaving = item ? viewerSummary : viewerItem;
    if (leaving.contains(document.activeElement)) dialog.focus();
    viewerItem.hidden = !item;
    viewerSummary.hidden = !!item;
    if (!item) {
      paintSummary();
      keepFocusInside();
      return;
    }
    var index = walk[at];
    positionEl.textContent = index + 1 + ' of ' + ITEMS.length;
    journeyEl.textContent = item.journeyTitle;
    engineEl.textContent = item.engine;
    titleEl.textContent =
      item.kind === 'recording'
        ? 'Recording'
        : 'Assertion ' + item.assertion + ': ' + item.label;
    previousBtn.disabled = at === 0;
    if (item.kind === 'recording') {
      shotEl.hidden = true;
      shotEl.removeAttribute('src');
      videoEl.hidden = false;
      var src = item.src || '';
      if (videoEl.getAttribute('src') !== src) {
        videoEl.setAttribute('src', src);
        videoEl.load();
      }
    } else {
      videoEl.pause();
      videoEl.hidden = true;
      if (videoEl.hasAttribute('src')) {
        videoEl.removeAttribute('src');
        videoEl.load();
      }
      // The capture is already on the page as bytes; the viewer shows those
      // same bytes rather than a second copy of them.
      var figure = figureOf(item.key);
      var onPage = figure ? figure.querySelector('img') : null;
      shotEl.hidden = false;
      shotEl.src = onPage ? onPage.src : '';
      shotEl.alt = onPage ? onPage.alt : '';
    }
    paintDecision(item);
    refreshReady();
    keepFocusInside();
  }

  function paintSummary() {
    var counts = countsOf();
    summaryCountsEl.textContent = counts.sentence;
    summaryListEl.textContent = '';
    ITEMS.forEach(function (item, index) {
      var shown = itemView(item.key);
      // What a session has to act on: everything rejected, and everything
      // somebody wrote a note against. An approval with nothing said about
      // it needs no line of its own.
      if (shown.decision !== 'rejected' && shown.note === '') return;
      var entry = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = decisionWord(shown.decision) + ': ' + describe(item);
      button.addEventListener('click', function () {
        openViewer(everyIndex(), index, returnTo);
      });
      entry.appendChild(button);
      if (shown.note !== '') {
        var note = document.createElement('p');
        note.textContent = shown.note;
        entry.appendChild(note);
      }
      summaryListEl.appendChild(entry);
    });
    undecidedBtn.hidden = counts.undecided === 0;
    undecidedBtn.textContent = 'Review the ' + counts.undecided + ' undecided';
  }

  /**
   * @param {number[]} indexes
   * @param {number} start
   * @param {HTMLElement | null} openedBy
   */
  function openViewer(indexes, start, openedBy) {
    if (indexes.length === 0) return;
    walk = indexes;
    at = indexes.indexOf(start);
    if (at < 0) at = 0;
    returnTo = openedBy || null;
    if (!dialog.open) dialog.showModal();
    show();
  }
  /** @param {number} step */
  function move(step) {
    if (!dialog.open) return;
    var next = at + step;
    if (next < 0) return;
    if (next > walk.length) next = walk.length;
    flushNotes(null);
    at = next;
    show();
  }
  /** @param {string} word */
  function announce(word) {
    var item = currentItem();
    announceEl.textContent = item
      ? word +
        '. ' +
        (walk[at] + 1) +
        ' of ' +
        ITEMS.length +
        ': ' +
        item.label +
        ', ' +
        item.engine
      : word + '. Review summary.';
  }

  /**
   * `decision` is null for Skip, which stores nothing and withdraws nothing.
   *
   * @param {Decision} decision
   */
  function decide(decision) {
    var item = currentItem();
    if (!item) return;
    if (decision === 'approved' && approveBtn.disabled) return;
    flushNotes(item.key);
    // Pressing the decision an item already carries keeps it, and writes
    // nothing: it is the operator confirming, not changing their mind.
    if (decision !== null && itemView(item.key).decision !== decision)
      setPending(item.key, 'decision', decision);
    writeItem(item.key);
    paintReview();
    if (decision !== null) rollUp(item.journey);
    move(1);
    announce(
      decision === 'approved'
        ? 'Approved'
        : decision === 'rejected'
          ? 'Rejected'
          : 'Skipped',
    );
  }

  function download() {
    var item = currentItem();
    const saver = downloads;
    if (!saver || !item) return;
    var filename = item.filename;
    var figure = item.kind === 'recording' ? null : figureOf(item.key);
    var onPage = figure ? figure.querySelector('img') : null;
    var source =
      item.kind === 'recording' ? item.src : onPage ? onPage.src : '';
    if (!source) return;
    fetch(source)
      .then(function (response) {
        return response.blob();
      })
      .then(function (blob) {
        return saver.save({ filename: filename, data: blob });
      })
      .then(null, function (e) {
        // Someone who declined their own download already knows they did;
        // anything else is a fault, and silence about it would read as a save.
        if (codeOf(e) !== 'declined')
          sayViewer('Could not download this capture: ' + codeOf(e));
      });
  }

  /**
   * The review as one comment: what was signed off, the counts, and a line
   * per item a session has to act on. Cut to what one comment may carry,
   * saying how many lines were left out and where to read them all -- a
   * silent cut would report a clean review of a page full of rejections.
   */
  function reviewText() {
    // A verdict given before the page changed no longer speaks for it (#197),
    // so the session is told which kind it is reading.
    var standing = standingOf(view(), JOURNEYS);
    var head = [
      'Evidence review for ' + DOC,
      'Sign-off: ' +
        (standing.verdict === 'approved'
          ? 'approved'
          : standing.verdict === 'more'
            ? 'more tests needed'
            : 'not decided') +
        (standing.stale
          ? ' (out of date: given before this page changed)'
          : ''),
      'Items: ' + countsOf().sentence,
    ].join('\n');
    /** @type {string[]} */
    var entries = [];
    ITEMS.forEach(function (item) {
      var state = itemView(item.key);
      if (state.decision !== 'rejected' && state.note === '') return;
      // Collapsed: the runtime refuses a comment carrying a control
      // character, and a note is whatever was typed into a textarea.
      var note = state.note.replace(/\s+/g, ' ').trim();
      entries.push(
        '- ' +
          decisionWord(state.decision) +
          ': ' +
          item.key +
          ' (' +
          describe(item) +
          ')' +
          (note === '' ? '' : ': ' + note),
      );
    });
    /**
     * @param {string[]} taken
     * @param {number} leftOut
     */
    var assemble = function (taken, leftOut) {
      return (
        head +
        (taken.length ? '\n' + taken.join('\n') : '') +
        (leftOut > 0
          ? '\n' +
            leftOut +
            ' more items left out to fit; read them all with ArtifactData ' +
            'list ' +
            ITEMS_PATH
          : '')
      );
    };
    /** @type {string[]} */
    var taken = [];
    for (var i = 0; i < entries.length; i++) {
      var attempt = taken.concat([entries[i]]);
      var text = assemble(attempt, entries.length - attempt.length);
      if (new TextEncoder().encode(text).length > SEND_MAX_BYTES) break;
      taken = attempt;
    }
    return assemble(taken, entries.length - taken.length);
  }

  function sendReview() {
    const sender = comments;
    if (!sender) return;
    var text = reviewText();
    sender
      .anchorFor(signoffEl)
      .then(function (anchor) {
        return sender.sendToClaude({ anchor: anchor, text: text });
      })
      .then(
        function () {
          saySend('Sent to Claude. The review is a comment on this sign-off.');
        },
        function (e) {
          saySend(
            'Not sent: ' +
              codeOf(e) +
              '. Your review is saved here for the next session to read.',
          );
        },
      );
  }
  /**
   * A rejection carries a failure, not one of the states above, so it is
   * named separately: passing the error straight to `markCannotSend` would
   * land on the fallback by accident rather than by decision.
   */
  function cannotSend() {
    markCannotSend('off');
  }
  /** @param {string} state */
  function markCannotSend(state) {
    comments = null;
    sendButtons.forEach(function (button) {
      button.remove();
    });
    saySend(
      'Cannot send: ' +
        (CANNOT_SEND[state] || CANNOT_SEND.off) +
        '. Your review is saved here for the next session to read.',
    );
  }

  /** @param {CollectionSnapshot} snap */
  function receiveItems(snap) {
    /** @type {Record<string, ItemState>} */
    var next = Object.create(null);
    snap.docs.forEach(function (doc) {
      var body = itemCopyOf(doc.data());
      if (body) next[doc.id] = body;
    });
    itemsServer = next;
    if (!itemsLoaded) {
      itemsLoaded = true;
      Object.keys(itemsPending).forEach(function (key) {
        writeItem(key);
      });
    }
    paintReview();
  }

  document.addEventListener('click', function (e) {
    var target = e.target;
    var opener =
      target instanceof Element ? target.closest('button.open') : null;
    if (!(opener instanceof HTMLElement)) return;
    var figure = opener.closest('[data-item]');
    var key = (figure && figure.getAttribute('data-item')) || '';
    if (!(key in byKey)) return;
    openViewer(everyIndex(), byKey[key], opener);
  });
  byId('btn-review-start', HTMLButtonElement).addEventListener(
    'click',
    function () {
      var undecided = undecidedIndexes();
      openViewer(everyIndex(), undecided.length ? undecided[0] : 0, this);
    },
  );
  byId('btn-review-signoff', HTMLButtonElement).addEventListener(
    'click',
    function () {
      var undecided = undecidedIndexes();
      openViewer(everyIndex(), undecided.length ? undecided[0] : 0, this);
    },
  );
  byId('btn-review-outstanding', HTMLButtonElement).addEventListener(
    'click',
    function () {
      var list = outstandingIndexes();
      openViewer(list, list[0], this);
    },
  );
  byId('btn-signoff-anyway', HTMLButtonElement).addEventListener(
    'click',
    function () {
      signOffAnyway = true;
      outstandingEl.hidden = true;
      change({ verdict: 'approved', verdictCovers: JOURNEYS.slice() });
    },
  );
  sendButtons.forEach(function (button) {
    button.addEventListener('click', sendReview);
  });

  approveBtn.addEventListener('click', function () {
    decide('approved');
  });
  rejectBtn.addEventListener('click', function () {
    decide('rejected');
  });
  skipBtn.addEventListener('click', function () {
    decide(null);
  });
  previousBtn.addEventListener('click', function () {
    move(-1);
  });
  downloadBtn.addEventListener('click', download);
  closeBtn.addEventListener('click', function () {
    dialog.close();
  });
  undecidedBtn.addEventListener('click', function () {
    var list = undecidedIndexes();
    openViewer(list, list.length ? list[0] : 0, returnTo);
  });
  goSignoffBtn.addEventListener('click', function () {
    returnTo = signoffEl;
    dialog.close();
  });
  shotEl.addEventListener('load', refreshReady);
  shotEl.addEventListener('error', refreshReady);
  videoEl.addEventListener('loadedmetadata', refreshReady);
  videoEl.addEventListener('error', refreshReady);

  noteBox.addEventListener('input', function () {
    var item = currentItem();
    if (!item) return;
    // The cap is the storage contract, so it is enforced here and not only
    // by `maxlength`: a paste sets the value straight past the attribute.
    if (noteBox.value.length > NOTE_MAX)
      noteBox.value = noteBox.value.slice(0, NOTE_MAX);
    setPending(item.key, 'note', noteBox.value);
    paintNoteCount();
    paintBadges();
    scheduleNote(item.key);
  });

  dialog.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.activeElement === noteBox) {
      // The note is text: every shortcut belongs to it, Escape included, or
      // a typed 'a' would approve the capture being written about and an
      // Escape would throw the sentence away with the dialog.
      if (e.key === 'Escape') e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      // The recording owns its own arrows: they seek it.
      if (document.activeElement === videoEl) return;
      e.preventDefault();
      move(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    var typed = e.key.length === 1 ? e.key.toLowerCase() : '';
    if (typed !== 'a' && typed !== 'r' && typed !== 's') return;
    e.preventDefault();
    decide(typed === 'a' ? 'approved' : typed === 'r' ? 'rejected' : null);
  });
  dialog.addEventListener('cancel', function (e) {
    if (document.activeElement === noteBox) e.preventDefault();
  });
  dialog.addEventListener('close', function () {
    flushNotes(null);
    videoEl.pause();
    if (returnTo && returnTo.isConnected) returnTo.focus();
  });

  stage.addEventListener('pointerdown', function (e) {
    // A swipe is a touch gesture; a mouse drag across the picture is not
    // one, and a drag that starts on the recording belongs to its controls.
    if (e.pointerType !== 'touch') return;
    var target = e.target;
    if (target instanceof Element && target.closest('video')) return;
    swipeFrom = { x: e.clientX, y: e.clientY };
  });
  stage.addEventListener('pointerup', function (e) {
    var from = swipeFrom;
    swipeFrom = null;
    if (!from || e.pointerType !== 'touch') return;
    var dx = e.clientX - from.x;
    var dy = e.clientY - from.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy) * 1.5)
      return;
    move(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', function () {
    swipeFrom = null;
  });

  paint();
  paintReview();
  // The runtime a published artifact injects; absent anywhere else.
  var claude = /** @type {{ claude?: { use?: Use } }} */ (
    /** @type {unknown} */ (window)
  ).claude;
  // Bound, because the runtime's `use` is a method of the object it hangs on.
  var use = claude && claude.use ? claude.use.bind(claude) : null;
  if (typeof use !== 'function') {
    markStorageAbsent();
    markCannotSend('off');
    downloadBtn.remove();
    return;
  }
  // Handing the operator the capture it is showing. Without the grant the
  // button is REMOVED rather than left to fail: a control that cannot work
  // is worse than no control at all.
  use('downloads').then(
    function (handle) {
      downloads = handle || null;
      if (!downloads) downloadBtn.remove();
    },
    function () {
      downloadBtn.remove();
    },
  );
  // Sending the review back to a session. `canSendToClaude` is asked before
  // the button is offered, so the page says why it cannot send rather than
  // failing at the press.
  use('comments').then(function (handle) {
    if (!handle) {
      markCannotSend('off');
      return;
    }
    handle.canSendToClaude().then(function (state) {
      if (state === 'available') comments = handle;
      else markCannotSend(state);
    }, cannotSend);
  }, cannotSend);
  use('db').then(function (handle) {
    if (!handle) {
      markStorageAbsent();
      return;
    }
    db = handle;
    itemsCol = db.collection(ITEMS_PATH);
    itemsCol.get().then(receiveItems, function (e) {
      if (!itemsLoaded)
        sayViewer(
          'Could not load the saved decisions (' +
            codeOf(e) +
            '). Nothing is saved until they load.',
        );
    });
    itemsCol.onSnapshot(receiveItems, function (e) {
      if (itemsLoaded)
        sayViewer(
          'Live updates stopped (' +
            codeOf(e) +
            '). Reload to see decisions made elsewhere.',
        );
    });
    var ref = db.doc(DOC);
    ref.get().then(receive, function (e) {
      // A read can fail after live updates have already loaded the sign-off.
      if (!loaded)
        say(
          'Could not load the saved sign-off (' +
            codeOf(e) +
            '). Ticks are not saved until it loads.',
          false,
        );
    });
    // Pass the error callback: without one, a subscription that ends is an
    // uncaught error. It speaks once the sign-off has loaded; before that, the
    // read's own failure is the one to report.
    ref.onSnapshot(receive, function (e) {
      if (loaded)
        say(
          'Live updates stopped (' +
            codeOf(e) +
            '). Reload to see changes made elsewhere.',
          false,
        );
    });
  }, markStorageAbsent);
}
