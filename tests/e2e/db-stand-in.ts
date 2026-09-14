/**
 * A stand-in for the artifact runtime's `db` capability, so an evidence page's
 * own script can be driven in a real browser (#172).
 *
 * This is the one mock the evidence page needs: the real runtime lives inside
 * claude.ai and cannot run in CI. It honours the parts of the published
 * contract (`db.d.ts`, runtime contract 0.2.47) that the page reaches for,
 * including the two a page gets wrong without any error:
 *
 * - every delivered snapshot is FROZEN, down through `data()` and everything
 *   under it, and a body that did not change is the same object across
 *   deliveries;
 * - a page's own write is delivered at once with `hasPendingWrites: true`, and
 *   again with `false` once the store has confirmed it.
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
}

/** What a test reads and drives. The page under test never touches it. */
export interface DbStandInControl {
  /** The confirmed body at `path`, or null when no such document exists. */
  read(path: string): StoredBody | null;
  /** How many times the page has called `set()`. */
  writes(): number;
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

export interface StandInDocument {
  id: string;
  path: string;
  get(): Promise<StandInSnapshot>;
  set(data: StoredBody): Promise<void>;
  onSnapshot(next: (snap: StandInSnapshot) => void): () => void;
}

export type StandInWindow = Window & {
  claude: {
    use(name: string): Promise<{ doc(path: string): StandInDocument } | null>;
  };
  __dbStandIn: DbStandInControl;
};

/**
 * Installs the stand-in. Pass it to `page.addInitScript` together with its
 * options: Playwright serialises the function's source, so it must not
 * reference anything outside its own body.
 */
export function installDbStandIn(options: DbStandInOptions): void {
  const { storeKey, order, seed, holdUse } = options;
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

  const deepFreeze = <T>(value: T): T => {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Object.isFrozen(value)
    ) {
      Object.freeze(value);
      for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
  };

  // The last frozen body delivered per path, reused while it is unchanged.
  const lastDelivered = new Map<string, { json: string; body: StoredBody }>();
  const frozenBody = (path: string, body: StoredBody): StoredBody => {
    const json = JSON.stringify(body);
    const last = lastDelivered.get(path);
    if (last && last.json === json) return last.body;
    const frozen = deepFreeze(copyOf(body));
    lastDelivered.set(path, { json, body: frozen });
    return frozen;
  };

  // This page's own writes not yet confirmed, oldest first. The view shows
  // the newest of them over the confirmed body (latency compensation).
  const unconfirmed = new Map<string, StoredBody[]>();
  let deliveries = 0;
  const view = (path: string): StandInSnapshot => {
    const queue = unconfirmed.get(path) ?? [];
    const latest =
      queue.length > 0 ? queue[queue.length - 1] : confirmed()[path];
    const body = latest === undefined ? undefined : frozenBody(path, latest);
    deliveries += 1;
    return deepFreeze({
      id: path.split('/').pop() ?? path,
      exists: body !== undefined,
      data: () => body,
      metadata: { fromCache: false, hasPendingWrites: queue.length > 0 },
    });
  };

  const listeners = new Map<string, Set<(snap: StandInSnapshot) => void>>();
  const deliver = (path: string): void => {
    for (const next of listeners.get(path) ?? []) next(view(path));
  };

  let writes = 0;
  let inflight = 0;
  const documentAt = (path: string): StandInDocument =>
    Object.freeze({
      id: path.split('/').pop() ?? path,
      path,
      get: () =>
        new Promise<StandInSnapshot>((resolve) =>
          setTimeout(() => resolve(view(path)), 0),
        ),
      set: (data: StoredBody) => {
        writes += 1;
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
      onSnapshot: (next: (snap: StandInSnapshot) => void) => {
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

  const namespace = Object.freeze({ doc: documentAt });
  let answer = (): void => {};
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  if (!holdUse) setTimeout(() => answer(), 0);

  Object.defineProperty(window, 'claude', {
    value: Object.freeze({
      use: (name: string) =>
        name === 'db' ? answered.then(() => namespace) : Promise.resolve(null),
    }),
  });

  const control: DbStandInControl = {
    read: (path) => confirmed()[path] ?? null,
    writes: () => writes,
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
