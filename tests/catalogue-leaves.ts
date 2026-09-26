/**
 * The catalogue walk, for the test tree. It lives in
 * `src/lib/catalogue-leaves.ts` since #97, because the Pages Function that
 * validates a translation report walks the same tables, and shipped code
 * cannot import tests/. Every existing importer keeps this path.
 */
export { catalogueLeaves, stringLeaves } from '../src/lib/catalogue-leaves';
