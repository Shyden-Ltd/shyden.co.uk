/**
 * A stand-in for the artifact runtime's `db` capability, so an evidence page's
 * own script can be driven in a real browser (#172).
 *
 * This is the one mock the evidence page needs: the real runtime lives inside
 * claude.ai and cannot run in CI. It honours the parts of the published
 * contract (`db.d.ts`, runtime contract 0.2.52) that the page reaches for,
 * including the ones a page gets wrong without any error:
 *
 * - every delivered snapshot is FROZEN, down through `data()` and everything
 *   under it, and a body that did not change is the same object across
 *   deliveries;
 * - a page's own write is delivered at once with `hasPendingWrites: true`, and
 *   again with `false` once the store has confirmed it;
 * - a path that breaks the path grammar THROWS a `TypeError` where it is
 *   built, before anything reaches the store. The review items (#205) put a
 *   key the builder derives into every path, and a key over 200 bytes would
 *   fail there on the real runtime with every decision on the page.
 *
 * The contract does not say whether `set()` resolves before or after the
 * confirmed snapshot arrives. The probe on the real runtime (2026-09-14) saw
 * the promise resolve first. `order` runs both, so a page cannot pass by
 * leaning on one of them.
 *
 * #172's last acceptance criterion ties this back to the real thing: a
 * throwaway page on the real runtime, measured the same way.
 */

/** Which of a write's two completions reaches the page first. */
export type WriteOrder = 'resolve-then-confirm' | 'confirm-then-resolve';

export type StoredBody = Record<string, unknown>;

export interface DbStandInOptions {
  /**
   * The localStorage key the store lives under. It must be unique per test: a
   * real phone shares one browser context across every test, so a fixed key
   * would carry one test's store into the next.
   */
  storeKey: string;
  order: WriteOrder;
  /** Documents that already exist, written only while the store is empty. */
  seed: Record<string, StoredBody>;
  /** Leave `claude.use('db')` unanswered until the test calls `answer()`. */
  holdUse: boolean;
  /**
   * Every subscription ends without delivering anything, with the terminal
   * `unavailable` error of a bridge that stops answering: late, once any read
   * has settled. From then on nothing is delivered, not even the echo of the
   * page's own writes.
   */
  subscriptionDies: boolean;
  /**
   * Every `get()` rejects with `unavailable`, late: a live subscription has
   * delivered by then, as when a transient failure hits a read while the
   * subscription carries on (db.d.ts).
   */
  getFails: boolean;
  /** `claude.use('db')` resolves null, as in a view that cannot run storage. */
  absent?: boolean;
}

/** What a test reads and drives. The page under test never touches it. */
export interface DbStandInControl {
  /** The confirmed body at `path`, or null when no such document exists. */
  read(path: string): StoredBody | null;
  /** The confirmed documents directly inside `collection`, keyed by id. */
  list(collection: string): Record<string, StoredBody>;
  /** How many times the page has called `set()`. */
  writes(): number;
  /** How many times the page has called `set()` on the document at `path`. */
  writesTo(path: string): number;
  /** Writes whose promise has not yet resolved or whose confirmation has not yet arrived. */
  inflight(): number;
  /** How many snapshots the page has received, from `get()` and `onSnapshot` alike. */
  deliveries(): number;
  /** Answer a held `claude.use('db')`. */
  answer(): void;
  /** Another viewer writes the whole document. */
  remoteWrite(path: string, body: StoredBody): void;
}

export interface StandInSnapshot {
  id: string;
  exists: boolean;
  data(): StoredBody | undefined;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}

export interface StandInDocumentChange {
  type: 'added' | 'modified' | 'removed';
  doc: StandInSnapshot;
  oldIndex: number;
  newIndex: number;
}

export interface StandInQuerySnapshot {
  docs: readonly StandInSnapshot[];
  size: number;
  empty: boolean;
  docChanges(): readonly StandInDocumentChange[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}

type Failure = { code: string; message: string };

export interface StandInDocument {
  id: string;
  path: string;
  get(): Promise<StandInSnapshot>;
  set(data: StoredBody): Promise<void>;
  onSnapshot(
    next: (snap: StandInSnapshot) => void,
    error?: (failure: Failure) => void,
  ): () => void;
}

export interface StandInCollection {
  path: string;
  doc(id: string): StandInDocument;
  get(): Promise<StandInQuerySnapshot>;
  onSnapshot(
    next: (snap: StandInQuerySnapshot) => void,
    error?: (failure: Failure) => void,
  ): () => void;
}

/** What `claude.use('db')` resolves: the store's two builders. */
export interface StandInDb {
  doc(path: string): StandInDocument;
  collection(path: string): StandInCollection;
}

/** The page's `window` once the stand-in is installed: the real global, plus what it adds. */
export type StandInWindow = Window &
  typeof globalThis & {
    claude: {
      use(name: 'db'): Promise<StandInDb | null>;
      use(name: string): Promise<unknown>;
    };
    __dbStandIn: DbStandInControl;
  };

/**
 * Installs the stand-in. Pass it to `page.addInitScript` together with its
 * options: Playwright serialises the function's source, so it must not
 * reference anything outside its own body.
 *
 * Every capability other than `db` resolves from
 * `window.__capabilityStandIns` when `capability-stand-ins.ts` has installed
 * one, and null otherwise, as the runtime answers for a capability this view
 * cannot run.
 */
export function installDbStandIn(options: DbStandInOptions): void {
  const { storeKey, order, seed, holdUse, subscriptionDies, getFails } =
    options;
  const CONFIRM_AFTER_MS = 60;

  if (localStorage.getItem(storeKey) === null)
    localStorage.setItem(storeKey, JSON.stringify(seed));
  const confirmed = (): Record<string, StoredBody> =>
    JSON.parse(localStorage.getItem(storeKey) ?? '{}') as Record<
      string,
      StoredBody
    >;
  const persist = (path: string, body: StoredBody): void => {
    const all = confirmed();
    all[path] = body;
    localStorage.setItem(storeKey, JSON.stringify(all));
  };
  // What crosses the bridge between page and store: a copy, never a reference.
  const copyOf = (body: StoredBody): StoredBody =>
    JSON.parse(JSON.stringify(body)) as StoredBody;

  // db.d.ts PATH GRAMMAR: documents have an even number of segments and
  // collections an odd one; letters, digits and `_ - . ~ : @ +` only; at most
  // 200 bytes a segment, 16 segments and 1000 bytes a path. The builders throw
  // synchronously, so a page that builds a bad path finds out where it did.
  const SEGMENT = /^[A-Za-z0-9_.~:@+-]+$/;
  const bytesOf = (text: string): number => new TextEncoder().encode(text).length;
  const assertPath = (path: string, kind: 'document' | 'collection'): void => {
    const segments = path.split('/');
    const broken =
      segments.length > 16 || bytesOf(path) > 1000
        ? 'the path is too long'
        : segments.find(
            (segment) =>
              !SEGMENT.test(segment) ||
              segment === '.' ||
              segment === '..' ||
              bytesOf(segment) > 200,
          ) !== undefined
          ? 'a segment breaks the grammar or is over 200 bytes'
          : (segments.length % 2 === 0) !== (kind === 'document')
            ? `a ${kind} path needs an ${kind === 'document' ? 'even' : 'odd'} number of segments, and this one has ${segments.length}`
            : null;
    if (broken) throw new TypeError(`invalid ${kind} path "${path}": ${broken}`);
  };
  const parentOf = (path: string): string =>
    path.slice(0, path.lastIndexOf('/'));

  // A frozen copy, down through every nested object. JSON.parse hands its
  // reviver each value after that value's children, so freezing there freezes
  // the whole body, with no walker of our own (one-home.test.ts).
  const frozenCopyOf = (json: string): StoredBody =>
    JSON.parse(json, (_key: string, value: unknown) =>
      value !== null && typeof value === 'object'
        ? Object.freeze(value)
        : value,
    ) as StoredBody;

  // The last frozen body delivered per path, reused while it is unchanged.
  const lastDelivered = new Map<string, { json: string; body: StoredBody }>();
  const frozenBody = (path: string, body: StoredBody): StoredBody => {
    const json = JSON.stringify(body);
    const last = lastDelivered.get(path);
    if (last && last.json === json) return last.body;
    const frozen = frozenCopyOf(json);
    lastDelivered.set(path, { json, body: frozen });
    return frozen;
  };

  // This page's own writes not yet confirmed, oldest first. The view shows
  // the newest of them over the confirmed body (latency compensation).
  const unconfirmed = new Map<string, StoredBody[]>();
  let deliveries = 0;
  // One document as a snapshot delivers it. Counted by the caller: a
  // collection's snapshot is one delivery however many documents it carries.
  const snapshotOf = (path: string): StandInSnapshot => {
    const queue = unconfirmed.get(path) ?? [];
    const latest =
      queue.length > 0 ? queue[queue.length - 1] : confirmed()[path];
    const body = latest === undefined ? undefined : frozenBody(path, latest);
    return Object.freeze({
      id: path.split('/').pop() ?? path,
      exists: body !== undefined,
      data: () => body,
      metadata: Object.freeze({
        fromCache: false,
        hasPendingWrites: queue.length > 0,
      }),
    });
  };
  const view = (path: string): StandInSnapshot => {
    deliveries += 1;
    return snapshotOf(path);
  };

  /** Every document directly inside `collection`, confirmed or pending, by id. */
  const pathsIn = (collection: string): string[] => {
    const paths = new Set(
      Object.keys(confirmed()).filter((path) => parentOf(path) === collection),
    );
    for (const [path, queue] of unconfirmed)
      if (queue.length > 0 && parentOf(path) === collection) paths.add(path);
    return [...paths].sort();
  };

  const queryView = (
    collection: string,
    previous: readonly StandInSnapshot[],
  ): StandInQuerySnapshot => {
    deliveries += 1;
    const docs = Object.freeze(
      pathsIn(collection)
        .map(snapshotOf)
        .filter((snap) => snap.exists),
    );
    const changes: StandInDocumentChange[] = [];
    docs.forEach((doc, newIndex) => {
      const oldIndex = previous.findIndex((old) => old.id === doc.id);
      if (oldIndex < 0) changes.push({ type: 'added', doc, oldIndex, newIndex });
      else if (previous[oldIndex].data() !== doc.data())
        changes.push({ type: 'modified', doc, oldIndex, newIndex });
    });
    previous.forEach((doc, oldIndex) => {
      if (!docs.some((current) => current.id === doc.id))
        changes.push({ type: 'removed', doc, oldIndex, newIndex: -1 });
    });
    const frozenChanges = Object.freeze(changes.map((c) => Object.freeze(c)));
    return Object.freeze({
      docs,
      size: docs.length,
      empty: docs.length === 0,
      docChanges: () => frozenChanges,
      metadata: Object.freeze({
        fromCache: false,
        hasPendingWrites: docs.some((doc) => doc.metadata.hasPendingWrites),
      }),
    });
  };

  const listeners = new Map<string, Set<(snap: StandInSnapshot) => void>>();
  type QueryListener = {
    next: (snap: StandInQuerySnapshot) => void;
    previous: readonly StandInSnapshot[];
  };
  const queryListeners = new Map<string, Set<QueryListener>>();
  const deliverQuery = (listener: QueryListener, collection: string): void => {
    const snap = queryView(collection, listener.previous);
    listener.previous = snap.docs;
    listener.next(snap);
  };
  const deliver = (path: string): void => {
    for (const next of listeners.get(path) ?? []) next(view(path));
    const collection = parentOf(path);
    for (const listener of queryListeners.get(collection) ?? [])
      deliverQuery(listener, collection);
  };

  const failLate = (message: string, reject: (failure: Failure) => void) =>
    setTimeout(
      () => reject(Object.freeze({ code: 'unavailable', message })),
      CONFIRM_AFTER_MS,
    );
  // Without an error callback the runtime reports a terminal error through
  // reportError, so the page's own error event sees it.
  const endSubscription = (error?: (failure: Failure) => void): (() => void) => {
    const failure = Object.freeze({
      code: 'unavailable',
      message: 'the stand-in ended this subscription',
    });
    setTimeout(
      () => (error ? error(failure) : reportError(failure)),
      CONFIRM_AFTER_MS * 2,
    );
    return () => {};
  };

  let writes = 0;
  let inflight = 0;
  const writesByPath = new Map<string, number>();
  const documentAt = (path: string): StandInDocument =>
    Object.freeze({
      id: path.split('/').pop() ?? path,
      path,
      get: () =>
        new Promise<StandInSnapshot>((resolve, reject) => {
          if (getFails) failLate('the stand-in failed this read', reject);
          else setTimeout(() => resolve(view(path)), 0);
        }),
      set: (data: StoredBody) => {
        writes += 1;
        writesByPath.set(path, (writesByPath.get(path) ?? 0) + 1);
        inflight += 1;
        const body = copyOf(data);
        const queue = unconfirmed.get(path) ?? [];
        queue.push(body);
        unconfirmed.set(path, queue);
        setTimeout(() => deliver(path), 0);
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            persist(path, body);
            queue.splice(queue.indexOf(body), 1);
            if (order === 'resolve-then-confirm') {
              resolve();
              setTimeout(() => {
                deliver(path);
                inflight -= 1;
              }, 0);
            } else {
              deliver(path);
              setTimeout(() => {
                resolve();
                inflight -= 1;
              }, 0);
            }
          }, CONFIRM_AFTER_MS);
        });
      },
      onSnapshot: (
        next: (snap: StandInSnapshot) => void,
        error?: (failure: Failure) => void,
      ) => {
        if (subscriptionDies) return endSubscription(error);
        const subscribed = listeners.get(path) ?? new Set();
        subscribed.add(next);
        listeners.set(path, subscribed);
        setTimeout(() => {
          if (subscribed.has(next)) next(view(path));
        }, 0);
        return () => {
          subscribed.delete(next);
        };
      },
    });

  const collectionAt = (path: string): StandInCollection =>
    Object.freeze({
      path,
      doc: (id: string) => {
        assertPath(`${path}/${id}`, 'document');
        return documentAt(`${path}/${id}`);
      },
      get: () =>
        new Promise<StandInQuerySnapshot>((resolve, reject) => {
          if (getFails) failLate('the stand-in failed this read', reject);
          else setTimeout(() => resolve(queryView(path, [])), 0);
        }),
      onSnapshot: (
        next: (snap: StandInQuerySnapshot) => void,
        error?: (failure: Failure) => void,
      ) => {
        if (subscriptionDies) return endSubscription(error);
        const listener: QueryListener = { next, previous: [] };
        const subscribed = queryListeners.get(path) ?? new Set();
        subscribed.add(listener);
        queryListeners.set(path, subscribed);
        setTimeout(() => {
          if (subscribed.has(listener)) deliverQuery(listener, path);
        }, 0);
        return () => {
          subscribed.delete(listener);
        };
      },
    });

  const namespace = Object.freeze({
    doc: (path: string) => {
      assertPath(path, 'document');
      return documentAt(path);
    },
    collection: (path: string) => {
      assertPath(path, 'collection');
      return collectionAt(path);
    },
  });
  let answer = (): void => {};
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  if (!holdUse) setTimeout(() => answer(), 0);

  Object.defineProperty(window, 'claude', {
    value: Object.freeze({
      use: (name: string): Promise<unknown> => {
        if (name === 'db')
          return options.absent
            ? Promise.resolve(null)
            : answered.then(() => namespace);
        const others = (
          window as Window & { __capabilityStandIns?: Record<string, unknown> }
        ).__capabilityStandIns;
        return Promise.resolve(others?.[name] ?? null);
      },
    }),
  });

  const control: DbStandInControl = {
    read: (path) => confirmed()[path] ?? null,
    list: (collection) =>
      Object.fromEntries(
        Object.entries(confirmed())
          .filter(([path]) => parentOf(path) === collection)
          .map(([path, body]) => [path.slice(collection.length + 1), body]),
      ),
    writes: () => writes,
    writesTo: (path) => writesByPath.get(path) ?? 0,
    inflight: () => inflight,
    deliveries: () => deliveries,
    answer: () => answer(),
    remoteWrite: (path, body) => {
      persist(path, copyOf(body));
      deliver(path);
    },
  };
  Object.defineProperty(window, '__dbStandIn', {
    value: Object.freeze(control),
  });
}
