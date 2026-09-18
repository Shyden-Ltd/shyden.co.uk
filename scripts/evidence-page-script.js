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
  }
  document.querySelectorAll('input[data-journey]').forEach(function (box) {
    box.addEventListener('change', function () {
      change(JOURNEY_KEY + box.dataset.journey, box.checked);
    });
  });
  approve.addEventListener('click', function () {
    change('verdict', view().verdict === 'approved' ? null : 'approved');
  });
  more.addEventListener('click', function () {
    change('verdict', view().verdict === 'more' ? null : 'more');
  });
  noteEl.addEventListener('input', function () {
    change('note', noteEl.value);
  });
  var lb = document.getElementById('lb'),
    lbImg = document.getElementById('lb-img'),
    lbCap = document.getElementById('lb-cap');
  document.addEventListener('click', function (e) {
    var img = e.target.closest ? e.target.closest('.shot img') : null;
    if (img) {
      lbImg.src = img.src;
      lbImg.alt = img.alt;
      lbCap.textContent = img.alt;
      lb.classList.add('on');
      return;
    }
    if (lb.classList.contains('on')) lb.classList.remove('on');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') lb.classList.remove('on');
  });
  paint();
  if (!window.claude || typeof window.claude.use !== 'function') {
    markStorageAbsent();
    return;
  }
  window.claude.use('db').then(function (handle) {
    if (!handle) {
      markStorageAbsent();
      return;
    }
    db = handle;
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
