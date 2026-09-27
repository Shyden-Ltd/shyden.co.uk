import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filesUnder, searched } from '../source-files';
import {
  astroCodeViews,
  astroTemplate,
  withoutTsComments,
} from './source-text';

/**
 * No `.astro` source reads the clock, so no built page carries a date and no
 * visual baseline can bake one in (#370).
 *
 * This replaces a mask. The footer's copyright line was built from
 * `new Date().getFullYear()`, so `visual.spec.ts` masked it, or every
 * baseline would have failed each 1 January for no change to any code. The
 * line went with the dissolved company, and the mask with it. Rather than
 * leave a mask standing ready for a date that might return, this refuses the
 * date itself: a page that needs one has to get past this guard, which says
 * why.
 */
const CLOCK = /\bnew Date\(|\bDate\.now\(|\.getFullYear\(/;

describe('no page is rendered from the clock (#370)', () => {
  it('no .astro source reads the date, in its code or its markup', () => {
    const sources = filesUnder('src', (path) => path.endsWith('.astro'));
    const dated = sources.filter((path) => {
      const text = readFileSync(path, 'utf8');
      const code = astroCodeViews(text).map(withoutTsComments);
      return [...code, withoutTsComments(astroTemplate(text))].some((view) =>
        CLOCK.test(view),
      );
    });
    expect(searched(dated, { of: sources, what: '.astro sources' })).toEqual(
      [],
    );
  });
});
