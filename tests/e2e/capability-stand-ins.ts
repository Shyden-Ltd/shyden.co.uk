/**
 * Stand-ins for the artifact runtime's `downloads` and `comments`
 * capabilities, so the evidence page's review viewer can be driven through its
 * own script in a real browser (#205). They sit beside `db-stand-in.ts`, whose
 * `claude.use()` resolves them by name.
 *
 * Each honours the part of its published contract (runtime contract 0.2.52)
 * the page reaches for, and records what the page asked for so a test can
 * read it back:
 *
 * - `downloads.save({filename, data})` is answered by the viewer. `accept`
 *   resolves `{status: "saved"}`; `decline` rejects `declined`, and nothing is
 *   saved. Empty data or a missing filename rejects `bad_request`, as a caller
 *   bug does on the real runtime (downloads.d.ts).
 * - `comments.canSendToClaude()` resolves the state a test sets.
 *   `sendToClaude({anchor, text})` rejects `invalid` for text the real
 *   runtime refuses (empty, over 4 KiB as UTF-8, or carrying a control
 *   character other than a newline or a tab), and otherwise posts or rejects
 *   as the test says (comments.d.ts).
 */

export type SaveAnswer = 'accept' | 'decline';

export type CanSendToClaude =
  'available' | 'writers_only' | 'no_session' | 'off';

export type SendAnswer =
  'post' | 'consent_required' | 'forbidden' | 'claude_unavailable';

export interface CapabilityStandInOptions {
  /** How the viewer answers every save; null resolves `use('downloads')` to null. */
  downloads: SaveAnswer | null;
  /** How sending to Claude behaves; null resolves `use('comments')` to null. */
  comments: { canSend: CanSendToClaude; send: SendAnswer } | null;
}

/** One `save()` the page made, and how it was answered. */
export interface RecordedSave {
  filename: string;
  size: number;
  /** SHA-256 of the bytes the page offered, as lower-case hex. */
  sha256: string;
  outcome: 'saved' | 'declined' | 'bad_request';
}

/** One `sendToClaude()` the page made. */
export interface RecordedSend {
  /** The `id` of the element the anchor was built for, or its tag. */
  anchoredAt: string;
  text: string;
  outcome: SendAnswer | 'invalid';
}

export interface CapabilityStandInControl {
  saves(): RecordedSave[];
  sends(): RecordedSend[];
}

export type CapabilityStandInWindow = Window &
  typeof globalThis & {
    __capabilityStandIns: Record<string, unknown>;
    __capabilityControl: CapabilityStandInControl;
  };

/**
 * Installs the stand-ins. Pass it to `page.addInitScript` together with its
 * options: Playwright serialises the function's source, so it must not
 * reference anything outside its own body.
 */
export function installCapabilityStandIns(
  options: CapabilityStandInOptions,
): void {
  const saves: RecordedSave[] = [];
  const sends: RecordedSend[] = [];
  const failure = (code: string, message: string) =>
    Object.freeze({ code, message });
  const hex = (buffer: ArrayBuffer): string =>
    Array.from(new Uint8Array(buffer), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');

  // The bytes of anything `save()` accepts, as the runtime would hand them on.
  const bytesOf = async (data: unknown): Promise<ArrayBuffer | null> => {
    if (data instanceof Blob) return data.arrayBuffer();
    if (typeof data === 'string')
      return new TextEncoder().encode(data).buffer as ArrayBuffer;
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data))
      return new Uint8Array(
        data.buffer,
        data.byteOffset,
        data.byteLength,
      ).slice().buffer as ArrayBuffer;
    return null;
  };

  const answer = options.downloads;
  const downloads =
    answer === null
      ? null
      : Object.freeze({
          save: async (request: { filename?: unknown; data?: unknown }) => {
            const filename =
              typeof request?.filename === 'string' ? request.filename : '';
            const bytes = await bytesOf(request?.data);
            const size = bytes?.byteLength ?? 0;
            const sha256 = bytes
              ? hex(await crypto.subtle.digest('SHA-256', bytes))
              : '';
            if (filename === '' || size === 0) {
              saves.push({ filename, size, sha256, outcome: 'bad_request' });
              throw failure('bad_request', 'a filename and non-empty data');
            }
            if (answer === 'decline') {
              saves.push({ filename, size, sha256, outcome: 'declined' });
              throw failure('declined', 'the viewer said no');
            }
            saves.push({ filename, size, sha256, outcome: 'saved' });
            return Object.freeze({ status: 'saved' });
          },
        });

  // A control character other than a tab (9) or a newline (10), counted by
  // code so this source carries no escape a tool could decode on the way in.
  const hasControlCharacter = (text: string): boolean =>
    Array.from(text).some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && code !== 9 && code !== 10) || code === 127;
    });

  const sending = options.comments;
  const comments =
    sending === null
      ? null
      : Object.freeze({
          canSendToClaude: async () => sending.canSend,
          anchorFor: async (element: unknown) => {
            if (!(element instanceof Element) || !element.isConnected)
              throw failure('invalid', 'not an attached element');
            return Object.freeze({
              path: element.id ? `#${element.id}` : element.localName,
              x: 0,
              y: 0,
            });
          },
          sendToClaude: async (target: {
            anchor?: { path?: unknown };
            text?: unknown;
          }) => {
            const text = typeof target?.text === 'string' ? target.text : '';
            const anchoredAt =
              typeof target?.anchor?.path === 'string'
                ? target.anchor.path.replace(/^#/, '')
                : '';
            const invalid =
              text.trim() === '' ||
              new TextEncoder().encode(text).length > 4096 ||
              hasControlCharacter(text) ||
              anchoredAt === '';
            const outcome = invalid ? 'invalid' : sending.send;
            sends.push({ anchoredAt, text, outcome });
            if (outcome !== 'post')
              throw failure(outcome, `the stand-in answered ${outcome}`);
            return Object.freeze({
              threadId: `thread-${sends.length}`,
              commentId: `comment-${sends.length}`,
            });
          },
        });

  Object.defineProperty(window, '__capabilityStandIns', {
    value: Object.freeze({ downloads, comments }),
  });
  const control: CapabilityStandInControl = {
    saves: () => saves.map((save) => ({ ...save })),
    sends: () => sends.map((send) => ({ ...send })),
  };
  Object.defineProperty(window, '__capabilityControl', {
    value: Object.freeze(control),
  });
}
