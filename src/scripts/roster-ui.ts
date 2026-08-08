/**
 * Student details: the roster table.
 *
 * ONE renderer, two CSS layouts (design spec section 3, "The roster is a
 * table on a laptop and cards on a phone"). `renderRoster` below builds a
 * single `<table>` whose `<tr class="cg-student">` rows are, structurally,
 * the same elements Stage 3, Task 3's own CSS
 * (ClassroomGroupsPage.astro's `<style is:global>` block, anchored on
 * `#cg-roster`) turns into cards below ~600px purely with `display: block`
 * on the table parts under a media query — no second render path. If a
 * future change needs a second DOM shape for the card layout, stop: that is
 * exactly the drift F-03/F-04 (design spec section 13, "same content", "same
 * behaviour") exist to catch, because two renderers can each pass their own
 * tests while quietly disagreeing with each other.
 *
 * Pure DOM building and event wiring: every render is a function of the
 * `roster` array handed to it (the plan's own Architecture note), and every
 * user edit is reported upward through `handlers` rather than mutating
 * anything here. `classroom-groups.ts` is what owns the roster array (across
 * renders) and decides when to call this again — see that file's own
 * "── student roster" section. The one exception is `renderRoster`'s own
 * `liveRoster`, which does not survive past the render call that creates
 * it and exists only to fix a same-render staleness bug — see its own
 * comment, just above the `tbody` it feeds, for what it fixes and why.
 *
 * `textContent`/`.value`/`document.createElement` throughout, never
 * `innerHTML` with anything interpolated — a teacher's typed name is
 * theirs, not markup, the same rule the results grid already follows
 * (`classroom-groups.ts`'s own `render()`, `who.textContent = label(student)`).
 */
import type { Student } from '../lib/grouping';
import { availableLetters, rosterCounts } from '../lib/roster';
import type { Strings } from '../lib/i18n';

export interface RosterHandlers {
  /**
   * A student's name or number was edited. Fired on the input's OWN
   * `input` event — every keystroke, not just on blur, matching this
   * file's own `form.addEventListener('input', updateStaleness)` house
   * convention. The caller must NOT re-render the table in response: the
   * input already shows exactly what was typed, and tearing the DOM down
   * to rebuild it mid-keystroke would steal the focus and the caret
   * position out from under whoever is typing — the one bug a "one
   * renderer" design would otherwise make trivial to introduce by
   * accident.
   */
  onTextChange: (next: Student[]) => void;
  /**
   * A student's sex, absence or either letter was changed. Fired on the
   * control's own `change` event — a discrete choice, never mid-keystroke,
   * so re-rendering in response (which the caller is free to do, unlike
   * `onTextChange` above) costs nothing in focus or caret position. This is
   * also what makes a newly-used together/apart letter's successor appear
   * in every OTHER row's own dropdown, not only the row it was just set on
   * — `availableLetters` (src/lib/roster.ts) is recomputed from the whole
   * roster on every render.
   */
  onSelectChange: (next: Student[]) => void;
  /** "+ Add student" — append one new anonymous row. */
  onAdd: () => void;
  /** "+ Add several…", confirmed — append `count` new anonymous rows. */
  onAddSeveral: (count: number) => void;
}

/** A new, unnamed, unlettered, present student — the shape both `onAdd` and
 *  `onAddSeveral` (classroom-groups.ts) build one of per row; kept here too
 *  since a mobile-card empty-state test (a later task) may need the same
 *  shape client-side. Takes the number rather than computing it, so the
 *  caller (which already needs `nextNumber` for the FIRST row of a batch)
 *  is the one place that decides numbering, not this module. */
export const anonymousStudent = (number: number): Student => ({
  number,
  name: null,
  sex: null,
  absent: false,
  together: null,
  apart: null,
});

const buildOption = (value: string, label: string): HTMLOptionElement => {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
};

/** Replaces the ONE student at `index` — every field handler builds its own
 *  patch and hands it to a caller, rather than mutating `roster` (a
 *  `readonly` parameter — see `renderRoster`'s own signature) in place. */
const patched = (
  roster: readonly Student[],
  index: number,
  fields: Partial<Student>,
): Student[] => roster.map((s, i) => (i === index ? { ...s, ...fields } : s));

const button = (text: string, className: string): HTMLButtonElement => {
  const b = document.createElement('button');
  b.type = 'button'; // never 'submit' -- these live inside #cg-form
  b.className = className;
  b.textContent = text;
  return b;
};

/**
 * "+ Add student" / "+ Add several…" — design spec section 4, "Changing the
 * class size is then a list operation". Rendered in TWO places by
 * `renderRoster` below: alone, when the roster is empty (so there is
 * something to click to create the first row), and again inside the
 * table's own `<tfoot>` once rows exist ("appear inline in the table
 * footer"). Built fresh each call, like every other element this module
 * creates — cheap, and it is what lets the inline "how many?" reveal below
 * always start closed on a fresh render rather than needing to remember
 * whether it was open before.
 */
function buildToolbar(t: Strings, handlers: RosterHandlers): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cg-roster-toolbar';

  const addButton = button(t.rosterAddStudent, 'cg-add-student');
  addButton.addEventListener('click', () => handlers.onAdd());

  const severalButton = button(t.rosterAddSeveral, 'cg-add-several');

  // "No dialog and no prompt()" (design spec section 4) — an inline field
  // that appears in place, kept HIDDEN until asked for rather than always
  // on screen, so the common case ("+ Add student", one row at a time)
  // is not cluttered by a control most visits to this section never touch.
  const inline = document.createElement('span');
  inline.className = 'cg-add-several-inline';
  inline.hidden = true;

  const howMany = document.createElement('input');
  howMany.type = 'number';
  howMany.min = '1';
  howMany.setAttribute('aria-label', t.rosterHowMany);

  const confirmButton = button(t.rosterAddConfirm, 'cg-add-confirm');

  const confirm = () => {
    const count = Math.trunc(Number(howMany.value));
    // A blank, zero, negative or non-numeric field is simply not confirmed
    // — no rows added, no error shown. The upper bound against a
    // pathologically large number lives in the HANDLER (classroom-groups.ts,
    // MAX_STUDENTS) rather than here, alongside the identical safety
    // reasoning MAX_STUDENTS's own doc comment (grouping.ts) already gives
    // for the Students box; this module has no opinion on how large is too
    // large, only on what counts as "a number at all".
    if (Number.isFinite(count) && count >= 1) {
      handlers.onAddSeveral(count);
    }
  };
  confirmButton.addEventListener('click', confirm);
  // A plain `<input type="number">` inside `#cg-form` implicitly submits
  // the WHOLE form on Enter (the browser picks the first submit button —
  // #cg-go, "Make groups" — regardless of which field has focus), which
  // would fire a shuffle instead of confirming this count. Intercepted here
  // so Enter does what it visibly looks like it should do.
  howMany.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirm();
    }
  });

  severalButton.addEventListener('click', () => {
    inline.hidden = false;
    howMany.focus();
  });

  inline.append(howMany, confirmButton);
  wrap.append(addButton, severalButton, inline);
  return wrap;
}

/**
 * One `<tr class="cg-student">`. Every control is wired directly (no `id`,
 * no `name` — see `#cg-form`'s own privacy comment in
 * ClassroomGroupsPage.astro: a `name` on a control holding anything a
 * teacher typed would put it in a native GET submission the moment the
 * listener that prevents one fails to attach), so nothing here needs a
 * lookup table to find the element a later change came from — the closure
 * over `index` and `getRoster` already knows.
 */
function buildRow(
  student: Student,
  index: number,
  getRoster: () => readonly Student[],
  t: Strings,
  handlers: RosterHandlers,
  togetherLetters: readonly string[],
  apartLetters: readonly string[],
): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'cg-student';
  // Design spec section 4: "the row is tinted instead" -- a tint, a stripe
  // and the pill built into `absentLabel` below, ALL keyed off this one
  // class rather than three independent checks, so the three signals can
  // never disagree with each other about whether a given row is absent.
  // `.is-absent`'s own CSS (ClassroomGroupsPage.astro) is what turns this
  // into the tint and (at the table breakpoint) the stripe; see that
  // block's own comment for why the stripe needs a SECOND rule at that
  // breakpoint rather than this class alone.
  if (student.absent) tr.classList.add('is-absent');

  // # — the number. Editable (design spec section 4: "The teacher may
  // override them"); identity is the number everywhere else in this
  // engine, so this is the one field a later task's duplicate check
  // (rosterProblems, a later task) watches.
  const numberTd = document.createElement('td');
  const numberInput = document.createElement('input');
  numberInput.type = 'number';
  numberInput.min = '1';
  numberInput.className = 'cg-roster-number';
  numberInput.setAttribute('aria-label', t.rosterColNumber);
  numberInput.value = String(student.number);
  numberInput.addEventListener('input', () => {
    const n = Math.trunc(Number(numberInput.value));
    if (Number.isFinite(n) && n >= 1) {
      handlers.onTextChange(patched(getRoster(), index, { number: n }));
    }
  });
  numberTd.appendChild(numberInput);

  // Name — optional. `placeholder` previews the SAME fallback label the
  // results grid and every error message already use for this student
  // (`t.studentNumber`, via `resolveStudent` in classroom-groups.ts) so a
  // teacher who never types a name can see, right here, what this row will
  // be called.
  const nameTd = document.createElement('td');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'cg-roster-name';
  nameInput.setAttribute('aria-label', t.rosterColName);
  nameInput.placeholder = t.studentNumber(student.number);
  nameInput.value = student.name ?? '';
  nameInput.addEventListener('input', () => {
    // An emptied field is `null` (no name), never `''` — matches
    // rosterCounts's own "an emptied name reads as unnamed" contract
    // (src/lib/roster.ts).
    const value = nameInput.value === '' ? null : nameInput.value;
    handlers.onTextChange(patched(getRoster(), index, { name: value }));
  });
  nameTd.appendChild(nameInput);

  // Sex — blank (neutral) / M / F. The <option> VALUE is always the raw
  // 'M'/'F' the engine's Student.sex type uses, in both languages; only the
  // displayed text is localised (rosterSexMale/Female — see their own
  // comment in en.ts).
  const sexTd = document.createElement('td');
  const sexSelect = document.createElement('select');
  sexSelect.setAttribute('aria-label', t.rosterColSex);
  sexSelect.append(
    buildOption('', t.rosterUnset),
    buildOption('M', t.rosterSexMale),
    buildOption('F', t.rosterSexFemale),
  );
  sexSelect.value = student.sex ?? '';
  sexSelect.addEventListener('change', () => {
    const value =
      sexSelect.value === '' ? null : (sexSelect.value as 'M' | 'F');
    handlers.onSelectChange(patched(getRoster(), index, { sex: value }));
  });
  sexTd.appendChild(sexSelect);

  // Absent — ticking it marks the student out of the shuffle (design spec
  // section 4). Nothing else in this row is ever disabled by it — a later
  // task's own job is the tint/stripe/pill that make an absent row visibly
  // distinct; this task wires the fact the checkbox reports, not yet its
  // presentation. The checkbox itself is drawn small (matching this page's
  // existing `.switch input` convention); the `<label>` wrapping it is the
  // real 44px tap target, the same whole-row-is-the-target pattern that
  // convention already uses.
  const absentTd = document.createElement('td');
  const absentLabel = document.createElement('label');
  absentLabel.className = 'cg-roster-absent-label';
  const absentInput = document.createElement('input');
  absentInput.type = 'checkbox';
  absentInput.setAttribute('aria-label', t.rosterColAbsent);
  absentInput.checked = student.absent;
  absentInput.addEventListener('change', () => {
    handlers.onSelectChange(
      patched(getRoster(), index, { absent: absentInput.checked }),
    );
  });
  absentLabel.appendChild(absentInput);
  // The pill: "beside the tick" (design spec section 4), so it is a
  // sibling of `absentInput` inside the SAME flex label -- not a separate
  // element elsewhere in the row, and not merely `hidden` when the student
  // is present. Built only when actually absent, matching every other
  // per-row element this module builds fresh each render: `onSelectChange`
  // (the only handler this checkbox fires) always re-renders (see
  // `RosterHandlers`' own doc comment), so there is never a stale pill to
  // clean up on the way back to present. Text stays fixed ('absent'/
  // 'tidak hadir', never "away" -- design spec section 4's own "wording is
  // uniform" rule), independent of the checkbox's own accessible name
  // (`t.rosterColAbsent`, set via `aria-label` above, which wins the
  // accessible-name computation regardless of what other text sits inside
  // the same wrapping <label>), so this adds no second, competing name for
  // the checkbox itself.
  if (student.absent) {
    const pill = document.createElement('span');
    pill.className = 'cg-absent-pill';
    pill.textContent = t.rosterAbsentPill;
    absentLabel.appendChild(pill);
  }
  absentTd.appendChild(absentLabel);

  // Together / Apart — a letter each, from a dropdown that grows as needed
  // (design spec section 4; `availableLetters`, src/lib/roster.ts).
  // `togetherLetters`/`apartLetters` are computed ONCE per render, from the
  // WHOLE roster, and handed to every row — not recomputed per row, so a
  // letter that became available because ANOTHER student just used it
  // shows up here identically regardless of which row is being built.
  const togetherTd = document.createElement('td');
  const togetherSelect = document.createElement('select');
  togetherSelect.setAttribute('aria-label', t.rosterColTogether);
  togetherSelect.appendChild(buildOption('', t.rosterUnset));
  for (const letter of togetherLetters) {
    togetherSelect.appendChild(buildOption(letter, letter));
  }
  togetherSelect.value = student.together ?? '';
  togetherSelect.addEventListener('change', () => {
    const value = togetherSelect.value === '' ? null : togetherSelect.value;
    handlers.onSelectChange(patched(getRoster(), index, { together: value }));
  });
  togetherTd.appendChild(togetherSelect);

  const apartTd = document.createElement('td');
  const apartSelect = document.createElement('select');
  apartSelect.setAttribute('aria-label', t.rosterColApart);
  apartSelect.appendChild(buildOption('', t.rosterUnset));
  for (const letter of apartLetters) {
    apartSelect.appendChild(buildOption(letter, letter));
  }
  apartSelect.value = student.apart ?? '';
  apartSelect.addEventListener('change', () => {
    const value = apartSelect.value === '' ? null : apartSelect.value;
    handlers.onSelectChange(patched(getRoster(), index, { apart: value }));
  });
  apartTd.appendChild(apartSelect);

  tr.append(numberTd, nameTd, sexTd, absentTd, togetherTd, apartTd);
  return tr;
}

/**
 * Builds the roster's entire DOM into `container` — clears it first, then
 * rebuilds from scratch, every call. `container` is expected to be
 * `#cg-students-body`; this function does not read or write `hidden` on it
 * (that toggle is the section-open/close mechanism classroom-groups.ts
 * already wires for all four collapsible sections) and does not care
 * whether it is currently visible — pre-rendering into a hidden body is
 * exactly how the toolbar is already on screen the instant a teacher opens
 * the section.
 *
 * With an EMPTY roster, only the toolbar renders (`+ Add student` /
 * `+ Add several…`) — there is no `<table id="cg-roster">` at all until
 * there is at least one row for it to hold. `#cg-roster` existing, or not,
 * is itself meaningful to at least one later task's own test (Student
 * details refusing to open above MAX_ROSTER leaves no table behind either)
 * so an empty-but-present table was deliberately avoided here.
 */
export function renderRoster(
  container: HTMLElement,
  roster: readonly Student[],
  t: Strings,
  handlers: RosterHandlers,
): void {
  container.textContent = '';

  if (roster.length === 0) {
    container.appendChild(buildToolbar(t, handlers));
    return;
  }

  const togetherLetters = availableLetters(roster, 'together');
  const apartLetters = availableLetters(roster, 'apart');

  const table = document.createElement('table');
  table.id = 'cg-roster';
  table.className = 'cg-roster';

  // Fixed widths live in CSS (ClassroomGroupsPage.astro's own global style
  // block, anchored on #cg-roster — see that block's own comment on why
  // GLOBAL, not scoped), targeting these six <col>s by position — never on
  // the inputs themselves. An input sized by its own content is what makes
  // an empty name box shrink next to a full one (R-10); `table-layout:
  // fixed` (also in that CSS) is what makes a <col>'s width apply
  // uniformly down its whole column regardless of any one row's content.
  const colgroup = document.createElement('colgroup');
  for (let i = 0; i < 6; i++)
    colgroup.appendChild(document.createElement('col'));
  table.appendChild(colgroup);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const heading of [
    t.rosterColNumber,
    t.rosterColName,
    t.rosterColSex,
    t.rosterColAbsent,
    t.rosterColTogether,
    t.rosterColApart,
  ]) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = heading;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Bug found while adding Stage 3, Task 3's own "editing every field
  // works" test (task-3-brief.md's own Step 1, verbatim): every row below
  // is built ONCE, here, and every field's own `patched()` call (buildRow)
  // used to close directly over THIS render's `roster` array. `onTextChange`
  // (number/name) deliberately never re-renders -- see `RosterHandlers`'
  // own doc comment, "avoiding focus/caret theft" -- so that closure went
  // stale the instant a text edit landed, and the NEXT `change` event on
  // ANY row (even a different one -- every row built in this same call
  // shared the identical stale reference) computed ITS OWN patch from that
  // same stale array, silently reverting every pending text edit back to
  // what it was when this render began. Reproduced plainly: fill a name,
  // then pick a sex -- the name reverted to empty, in BOTH the card and the
  // table layout, proving it was never a layout bug at all.
  //
  // `liveRoster` is the one place both wrapped handlers below keep current,
  // and `getRoster` -- handed to every row via `buildRow`'s own parameter
  // of the same name -- is what lets a field built in an EARLIER row still
  // read the LATEST edit, made in a later one or in itself moments before,
  // rather than the snapshot this render started with. `RosterHandlers`
  // itself is untouched: `classroom-groups.ts` still receives exactly the
  // `next: Student[]` it always did, from exactly the same two callbacks --
  // this is internal bookkeeping, not a change to the public contract.
  let liveRoster: readonly Student[] = roster;
  const getRoster = (): readonly Student[] => liveRoster;
  const liveHandlers: RosterHandlers = {
    ...handlers,
    onTextChange: (next) => {
      liveRoster = next;
      handlers.onTextChange(next);
    },
    onSelectChange: (next) => {
      liveRoster = next;
      handlers.onSelectChange(next);
    },
  };

  const tbody = document.createElement('tbody');
  roster.forEach((student, index) => {
    tbody.appendChild(
      buildRow(
        student,
        index,
        getRoster,
        t,
        liveHandlers,
        togetherLetters,
        apartLetters,
      ),
    );
  });
  table.appendChild(tbody);

  // The toolbar again, "inline in the table footer" (design spec section
  // 4) — a real <tfoot>, not a sibling element after the table, so it
  // reflows exactly like every other row once a later task's CSS turns
  // this table into a stack of cards below the breakpoint.
  const tfoot = document.createElement('tfoot');
  const footRow = document.createElement('tr');
  const footCell = document.createElement('td');
  footCell.colSpan = 6;
  footCell.appendChild(buildToolbar(t, handlers));
  footRow.appendChild(footCell);
  tfoot.appendChild(footRow);
  table.appendChild(tfoot);

  container.appendChild(table);

  // Design spec section 4: "A permanent line under the table states the
  // consequence, whether or not anyone is marked... The count line then
  // reports it." Both are real <p> siblings AFTER </table> -- neither is
  // table content, so neither can live inside it -- which is also why
  // their own CSS (ClassroomGroupsPage.astro) is anchored on #cg-roster-count
  // and .cg-roster-consequence directly rather than on any #cg-roster
  // descendant selector.
  //
  // "Under the table" only ever means "once the table exists": this
  // whole branch is already gated on `roster.length > 0` (the empty-roster
  // early return, above), matching classroom-groups-roster.spec.ts's own
  // "the consequence line is there before anyone is marked" test, which
  // opens the roster (one student, present) rather than starting from a
  // wholly empty list.
  const consequence = document.createElement('p');
  consequence.className = 'cg-roster-consequence';
  consequence.textContent = t.rosterAbsentConsequence;
  container.appendChild(consequence);

  // `rosterCounts` (src/lib/roster.ts, unit-tested there) is the ONE place
  // "how many are absent" is computed -- the same function
  // updateStudentsHeader (classroom-groups.ts) already calls for the
  // collapsed header's own "· N absent" fragment, so the header and this
  // line can never disagree about the count. `here` is the one piece
  // neither that function nor this module had a name for yet: always
  // `roster.length - absent`, computed inline rather than promoted into
  // roster.ts's own pinned export list (tests/unit/roster.test.ts's "the
  // module surface" test) for a single subtraction with no branch of its
  // own to unit-test independently of `rosterCounts.absent`, which already
  // is.
  const countLine = document.createElement('p');
  countLine.id = 'cg-roster-count';
  countLine.className = 'cg-roster-count';
  const { absent } = rosterCounts(roster);
  countLine.textContent = t.rosterCountLine(
    roster.length,
    roster.length - absent,
    absent,
  );
  container.appendChild(countLine);
}
