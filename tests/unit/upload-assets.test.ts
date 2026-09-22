import { describe, it, expect } from 'vitest';
import { parseAssetListing } from '../../scripts/upload-evidence-assets.mjs';

/**
 * A real listing, copied verbatim from `Artifact action:"list" scope:"assets"`
 * against the `Asset Store Probe` artifact on 2026-09-22. The script parses
 * this text itself: asking anyone to turn it into JSON first would put the
 * hand-transcription #291 exists to remove straight back into the loop.
 */
const LISTING = [
  // Two of the run's 25 lines, and the header says so: the parser checks the
  // lines against this count, so an excerpt that kept 25 here would be a
  // fixture that disagrees with itself.
  'Assets of https://claude.ai/artifact/87T37HGYVnkZLKSt8hXH9G: 2 files, 4190 of 1073741824 bytes used (limit 5000 files).',
  'Oldest first; reference one from the page by its url verbatim, read or delete it by the id after "_blob/":',
  '- /_blob/c6574fb0cc659355f8def4c920def8e3  image/png  94 bytes  2026-09-22T02:20:31.99655Z  sha256 7b75017401c82f7c6c2cb0d325d7a705e0fa6194ab7dbdfc43f4763376060f57',
  '- /_blob/01b125997c05a9d2db8be6c8220262a2  video/mp4  4096 bytes  2026-09-22T02:20:32.975742Z  sha256 aa75017401c82f7c6c2cb0d325d7a705e0fa6194ab7dbdfc43f4763376060f5e',
].join('\n');

describe('reading what the asset store already holds', () => {
  it('takes the id, the byte count and the sha256 off every asset line', () => {
    expect(parseAssetListing(LISTING)).toEqual([
      {
        id: 'c6574fb0cc659355f8def4c920def8e3',
        bytes: 94,
        sha256:
          '7b75017401c82f7c6c2cb0d325d7a705e0fa6194ab7dbdfc43f4763376060f57',
      },
      {
        id: '01b125997c05a9d2db8be6c8220262a2',
        bytes: 4096,
        sha256:
          'aa75017401c82f7c6c2cb0d325d7a705e0fa6194ab7dbdfc43f4763376060f5e',
      },
    ]);
  });

  it('refuses a line the listing format does not explain, rather than skipping it', () => {
    const changed = LISTING.replace(' 94 bytes ', ' 94 B ');
    expect(() => parseAssetListing(changed)).toThrow(
      /1 asset line\(s\) the listing format does not explain/,
    );
  });

  it('reads an empty store as empty, because that is what a first run sees', () => {
    // The store starts empty. Refusing here would make the first upload of
    // any artifact impossible.
    expect(
      parseAssetListing(
        'Assets of https://x: 0 files, 0 of 1073741824 bytes used (limit 5000 files).',
      ),
    ).toEqual([]);
  });

  it('refuses a listing that lists fewer assets than its own header declares', () => {
    // A store with nothing in it and a listing this script read only half of
    // are the same sight -- an short list -- and only one is good news. The
    // listing pages, so a page taken for the whole store would re-upload
    // every recording beyond it. The header's own count is the control.
    const truncated = LISTING.replace('2 files', '99 files');
    expect(() => parseAssetListing(truncated)).toThrow(
      /2 asset line\(s\) against the 99 its header declares/,
    );
  });
});
