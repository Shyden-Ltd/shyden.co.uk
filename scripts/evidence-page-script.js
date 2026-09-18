(function () {
  'use strict';
  // Read from the block the page carries rather than interpolated into
  // this text: one source for the journeys, the sign-off key and the
  // review items, so a figure and the item keyed to it cannot disagree.
  var DATA = JSON.parse(document.getElementById('evidence-review').textContent);
  var JOURNEYS = DATA.journeys;
  var DOC = 'signoff/' + DATA.signoffKey;
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
  var server = copyOf(undefined);
  // Edits no completed write has carried yet, keyed 'journey:<id>', 'verdict'
  // and 'note'. The page shows the server copy with these laid over it, so no
  // snapshot, early or late, can repaint an edit away.
  var pending = Object.create(null);
  var db = null,
    storageAbsent = false,
    loaded = false,
    saveTimer = null;
  var stateEl = document.getElementById('state');
  var progressEl = document.getElementById('progress');
  var noteEl = document.getElementById('note');
  var approve = document.getElementById('btn-approve');
  var more = document.getElementById('btn-more');
  function say(m, ok) {
    stateEl.textContent = m;
    stateEl.className = 'state' + (ok ? ' saved' : '');
  }
  function codeOf(e) {
    return e && typeof e.code === 'string' ? e.code : 'unknown';
  }
  function hasPending() {
    return Object.keys(pending).length > 0;
  }
  // Keeps only the shape this page writes. The store is shared by every
  // viewer, so what it delivers is untrusted input.
  function copyOf(body) {
    var source = body && typeof body === 'object' ? body : {};
    var stored =
      source.journeys && typeof source.journeys === 'object'
        ? source.journeys
        : {};
    var journeys = {};
    Object.keys(stored).forEach(function (id) {
      if (typeof stored[id] === 'boolean') journeys[id] = stored[id];
    });
    return {
      journeys: journeys,
      verdict:
        source.verdict === 'approved' || source.verdict === 'more'
          ? source.verdict
          : null,
      note: typeof source.note === 'string' ? source.note : '',
    };
  }
  function overlay(target, edits) {
    Object.keys(edits).forEach(function (key) {
      if (key.indexOf(JOURNEY_KEY) === 0)
        target.journeys[key.slice(JOURNEY_KEY.length)] = edits[key];
      else target[key] = edits[key];
    });
    return target;
  }
  function view() {
    return overlay(copyOf(server), pending);
  }
  function paint() {
    var shown = view(),
      done = 0;
    JOURNEYS.forEach(function (id) {
      var box = document.getElementById('chk-' + id);
      if (!box) return;
      var on = shown.journeys[id] === true;
      box.checked = on;
      var sec = document.getElementById('j-' + id);
      if (sec) sec.classList.toggle('done', on);
      if (on) done++;
    });
    progressEl.textContent =
      done + ' of ' + JOURNEYS.length + ' journeys reviewed';
    approve.setAttribute('aria-pressed', String(shown.verdict === 'approved'));
    more.setAttribute('aria-pressed', String(shown.verdict === 'more'));
    if (document.activeElement !== noteEl) noteEl.value = shown.note;
  }
  function schedule() {
    say('Saving\u2026', false);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }
  function change(key, value) {
    pending[key] = value;
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
    var body = view();
    body.updatedAt = new Date().toISOString();
    db.doc(DOC)
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
  function receive(snap) {
    server = copyOf(snap.data());
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
  document.querySelectorAll('input[data-journey]').forEach(function (box) {
    box.addEventListener('change', function () {
      change(JOURNEY_KEY + box.dataset.journey, box.checked);
    });
  });
  approve.addEventListener('click', function () {
    var next = view().verdict === 'approved' ? null : 'approved';
    // Signing off speaks for every capture on the page, so a page with
    // captures still outstanding asks once before it records one. Nothing is
    // changed and nothing is written until "Sign off anyway".
    if (next === 'approved' && !signOffAnyway && outstandingIndexes().length) {
      outstandingTextEl.textContent = outstandingSentence();
      outstandingEl.hidden = false;
      return;
    }
    outstandingEl.hidden = true;
    change('verdict', next);
  });
  more.addEventListener('click', function () {
    change('verdict', view().verdict === 'more' ? null : 'more');
  });
  noteEl.addEventListener('input', function () {
    change('note', noteEl.value);
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
  var CANNOT_SEND = {
    no_session: 'no Claude session is watching this page',
    writers_only: 'only editors of this page can send to Claude',
    off: 'sending to Claude is unavailable in this view',
  };
  // One `d` per state, set on the badge's single <path>: three states share
  // one element, so the badge's own word stays the only text in it and a
  // test reading it back cannot pick up an icon's title by accident.
  var BADGE_ICON = {
    Approved: 'M6.2 11.3 3.5 8.6l-1 1.1 3.7 3.7 7.3-7.4-1-1z',
    Rejected:
      'M12.7 4.4 11.6 3.3 8 6.9 4.4 3.3 3.3 4.4 6.9 8l-3.6 3.6 1.1 1.1L8 9.1l3.6 3.6 1.1-1.1L9.1 8z',
    Note: 'M2 12.1V14h1.9l7-7-1.9-1.9zM13.8 5.5a.6.6 0 0 0 0-.8l-1.5-1.5a.6.6 0 0 0-.8 0l-1 1 2.3 2.3z',
  };

  var dialog = document.getElementById('viewer');
  var viewerItem = document.getElementById('viewer-item');
  var viewerSummary = document.getElementById('viewer-summary');
  var stage = document.getElementById('viewer-stage');
  var shotEl = document.getElementById('viewer-image');
  // Deliberately id-less: a screen reader and a Tab walk both report the
  // element that HOSTS a focused shadow control, and the browser's own media
  // controls are several tab stops inside this one element. Left nameless it
  // reads as what it is -- the recording -- rather than as a control of ours.
  var videoEl = document.querySelector('#viewer-stage video');
  var waitEl = document.getElementById('viewer-wait');
  var positionEl = document.getElementById('viewer-position');
  var journeyEl = document.getElementById('viewer-journey');
  var engineEl = document.getElementById('viewer-engine');
  var titleEl = document.getElementById('viewer-title');
  var decisionEl = document.getElementById('viewer-decision');
  var viewerStateEl = document.getElementById('viewer-status');
  var announceEl = document.getElementById('viewer-announce');
  var noteBox = document.getElementById('viewer-note');
  var noteCountEl = document.getElementById('viewer-note-count');
  var summaryCountsEl = document.getElementById('viewer-summary-counts');
  var summaryListEl = document.getElementById('viewer-summary-list');
  var approveBtn = document.getElementById('viewer-approve');
  var rejectBtn = document.getElementById('viewer-reject');
  var skipBtn = document.getElementById('viewer-skip');
  var previousBtn = document.getElementById('viewer-previous');
  var downloadBtn = document.getElementById('viewer-download');
  var undecidedBtn = document.getElementById('viewer-undecided');
  var goSignoffBtn = document.getElementById('viewer-go-signoff');
  var closeBtn = document.getElementById('viewer-close');
  var sendButtons = [
    document.getElementById('btn-send'),
    document.getElementById('viewer-send'),
  ];
  var sendStateEl = document.getElementById('send-state');
  var itemsProgressEl = document.getElementById('items-progress');
  var reviewProgressEl = document.getElementById('review-progress');
  var outstandingEl = document.getElementById('outstanding');
  var outstandingTextEl = document.getElementById('outstanding-text');
  var signoffEl = document.getElementById('signoff');

  // Every stored item as this view last received it, always as this page's
  // OWN object: the runtime delivers snapshots frozen (#172).
  var itemsServer = Object.create(null);
  // Decisions and notes no completed write has carried yet, keyed by item.
  var itemsPending = Object.create(null);
  var itemsCol = null,
    itemsLoaded = false,
    noteTimer = null,
    noteKey = null,
    downloads = null,
    comments = null,
    signOffAnyway = false,
    swipeFrom = null,
    returnTo = null;
  // Writes are serialised per item: one in flight, and at most one waiting.
  var inFlight = Object.create(null);
  var dirty = Object.create(null);
  // The items this walk steps through, as positions in ITEMS, and where in
  // that walk we are. `walk.length` is the summary after the last one.
  var walk = [];
  var at = 0;

  var byKey = Object.create(null);
  ITEMS.forEach(function (item, index) {
    byKey[item.key] = index;
  });

  function everyIndex() {
    return ITEMS.map(function (_item, index) {
      return index;
    });
  }
  function grouped(n) {
    return String(n).replace(/\B(?=(\d{3})+$)/g, ',');
  }
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
  function decisionWord(decision) {
    return decision === 'approved'
      ? 'Approved'
      : decision === 'rejected'
        ? 'Rejected'
        : 'Not decided';
  }
  function figureOf(key) {
    return document.querySelector('[data-item="' + key + '"]');
  }
  function sayViewer(message) {
    viewerStateEl.textContent = message;
  }
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
   */
  function itemCopyOf(body) {
    if (!body || typeof body !== 'object') return null;
    var decision = body.decision;
    if (decision !== 'approved' && decision !== 'rejected' && decision !== null)
      return null;
    if (typeof body.note !== 'string' || body.note.length > NOTE_MAX)
      return null;
    if (typeof body.at !== 'string') return null;
    return { decision: decision, note: body.note };
  }

  /** What the page shows for an item: the store with this view's edits over it. */
  function itemView(key) {
    var stored = itemsServer[key];
    var edits = itemsPending[key] || {};
    return {
      decision:
        'decision' in edits ? edits.decision : stored ? stored.decision : null,
      note: 'note' in edits ? edits.note : stored ? stored.note : '',
    };
  }
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
    var list = [];
    ITEMS.forEach(function (item, index) {
      if (itemView(item.key).decision === null) list.push(index);
    });
    return list;
  }
  /** Everything not approved: a rejection is outstanding as much as a gap is. */
  function outstandingIndexes() {
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
    var body = itemView(key);
    body.at = new Date().toISOString();
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
            Object.keys(carried).forEach(function (field) {
              if (left[field] === carried[field]) delete left[field];
            });
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
    change(JOURNEY_KEY + journeyId, allApproved);
  }

  function paintBadges() {
    ITEMS.forEach(function (item) {
      var figure = figureOf(item.key);
      var badge = figure ? figure.querySelector('.badge') : null;
      if (!badge) return;
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
      badge.querySelector('.badge-text').textContent = state;
      badge.querySelector('path').setAttribute('d', BADGE_ICON[state]);
    });
  }
  function paintReview() {
    paintBadges();
    var sentence = countsOf().sentence;
    itemsProgressEl.textContent = sentence;
    reviewProgressEl.textContent = sentence;
    if (dialog.open && currentItem()) paintDecision();
  }
  function paintDecision() {
    var shown = itemView(currentItem().key);
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
      if (videoEl.getAttribute('src') !== item.src) {
        videoEl.setAttribute('src', item.src);
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
    paintDecision();
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

  function openViewer(indexes, start, openedBy) {
    if (indexes.length === 0) return;
    walk = indexes;
    at = indexes.indexOf(start);
    if (at < 0) at = 0;
    returnTo = openedBy || null;
    if (!dialog.open) dialog.showModal();
    show();
  }
  function move(step) {
    if (!dialog.open) return;
    var next = at + step;
    if (next < 0) return;
    if (next > walk.length) next = walk.length;
    flushNotes(null);
    at = next;
    show();
  }
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

  /** `decision` is null for Skip, which stores nothing and withdraws nothing. */
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
    if (!downloads || !item) return;
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
        return downloads.save({ filename: item.filename, data: blob });
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
    var shown = view();
    var head = [
      'Evidence review for ' + DOC,
      'Sign-off: ' +
        (shown.verdict === 'approved'
          ? 'approved'
          : shown.verdict === 'more'
            ? 'more tests needed'
            : 'not decided'),
      'Items: ' + countsOf().sentence,
    ].join('\n');
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
    if (!comments) return;
    var text = reviewText();
    comments
      .anchorFor(signoffEl)
      .then(function (anchor) {
        return comments.sendToClaude({ anchor: anchor, text: text });
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
  function markCannotSend(state) {
    comments = null;
    sendButtons.forEach(function (button) {
      if (button) button.remove();
    });
    saySend(
      'Cannot send: ' +
        (CANNOT_SEND[state] || CANNOT_SEND.off) +
        '. Your review is saved here for the next session to read.',
    );
  }

  function receiveItems(snap) {
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
    var opener = e.target.closest ? e.target.closest('button.open') : null;
    if (!opener) return;
    var figure = opener.closest('[data-item]');
    var key = figure ? figure.getAttribute('data-item') : '';
    if (!(key in byKey)) return;
    openViewer(everyIndex(), byKey[key], opener);
  });
  document
    .getElementById('btn-review-start')
    .addEventListener('click', function (e) {
      var undecided = undecidedIndexes();
      openViewer(
        everyIndex(),
        undecided.length ? undecided[0] : 0,
        e.currentTarget,
      );
    });
  document
    .getElementById('btn-review-signoff')
    .addEventListener('click', function (e) {
      var undecided = undecidedIndexes();
      openViewer(
        everyIndex(),
        undecided.length ? undecided[0] : 0,
        e.currentTarget,
      );
    });
  document
    .getElementById('btn-review-outstanding')
    .addEventListener('click', function (e) {
      var list = outstandingIndexes();
      openViewer(list, list[0], e.currentTarget);
    });
  document
    .getElementById('btn-signoff-anyway')
    .addEventListener('click', function () {
      signOffAnyway = true;
      outstandingEl.hidden = true;
      change('verdict', 'approved');
    });
  sendButtons.forEach(function (button) {
    if (button) button.addEventListener('click', sendReview);
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
    if (e.target.closest && e.target.closest('video')) return;
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
  if (!window.claude || typeof window.claude.use !== 'function') {
    markStorageAbsent();
    markCannotSend('off');
    downloadBtn.remove();
    return;
  }
  // Handing the operator the capture it is showing. Without the grant the
  // button is REMOVED rather than left to fail: a control that cannot work
  // is worse than no control at all.
  window.claude.use('downloads').then(
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
  window.claude.use('comments').then(function (handle) {
    if (!handle) {
      markCannotSend('off');
      return;
    }
    handle.canSendToClaude().then(function (state) {
      if (state === 'available') comments = handle;
      else markCannotSend(state);
    }, cannotSend);
  }, cannotSend);
  window.claude.use('db').then(function (handle) {
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
})();
