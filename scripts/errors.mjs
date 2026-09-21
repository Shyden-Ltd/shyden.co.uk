/**
 * What a caught value actually says, for scripts.
 *
 * `catch` binds `unknown`, because JavaScript can throw anything: a string, a
 * number, `undefined`. Reading `.message` off one of those is not merely a
 * type error -- it evaluates to `undefined`, so the very line written to
 * explain a failure prints nothing, and the operator is told less than if it
 * had thrown plainly.
 *
 * One home rather than a cast at each site: a cast asserts a shape nobody
 * checked, which is the same defect in the other direction.
 */

/**
 * The message a caught value carries, or the value itself rendered.
 *
 * @param {unknown} error
 * @returns {string}
 */
export const messageOf = (error) =>
  error instanceof Error ? error.message : String(error);

/**
 * The stack a caught value carries, falling back to its message.
 *
 * @param {unknown} error
 * @returns {string}
 */
export const stackOf = (error) =>
  error instanceof Error && error.stack ? error.stack : messageOf(error);

/**
 * A node error's `code` (`ENOENT`, `EADDRINUSE`), or undefined for anything
 * that carries none. Read through a property check rather than a cast: a
 * plain `Error` has no `code`, and neither does a thrown string.
 *
 * @param {unknown} error
 * @returns {string | undefined}
 */
export const codeOf = (error) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof (/** @type {{ code?: unknown }} */ (error).code) === 'string'
    ? /** @type {{ code: string }} */ (error).code
    : undefined;
