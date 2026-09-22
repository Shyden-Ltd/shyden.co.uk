/**
 * Uploads an evidence run's recordings into an artifact's asset store and
 * writes the map the page is built from (#291).
 *
 * The ids cannot be known before the upload, and carrying 281 of them out of
 * tool results by hand is where a silent error lives: a well-formed but
 * MIS-PAIRED id renders one journey's recording against another journey's
 * assertion, and nothing about the page looks wrong. So nothing here is
 * transcribed. Every pairing is derived from the sha256 the asset store
 * reports beside each stored asset.
 */

/** The count the listing states for itself, which every asset line is checked against. */
const DECLARED_FILES = /^Assets of \S+: (\d+) files,/m;

/** An asset line as the listing prints it, and nothing else. */
const ASSET_LINE =
  /^- \/_blob\/([0-9a-f]{32})\s+\S+\s+(\d+) bytes\s+\S+\s+sha256 ([0-9a-f]{64})$/;

/**
 * What the asset store already holds, read from the listing's own text.
 *
 * The listing is parsed here rather than turned into JSON by whoever ran it:
 * a hand-made JSON copy is hand-transcription, which is the failure this
 * script exists to remove.
 *
 * @param {string} text - `Artifact action:"list" scope:"assets"` verbatim.
 * @returns {{ id: string, bytes: number, sha256: string }[]}
 */
export const parseAssetListing = (text) => {
  const assets = [];
  const unreadable = [];
  for (const line of text.split('\n')) {
    const asset = line.trimEnd();
    if (!asset.startsWith('- ')) continue;
    const found = ASSET_LINE.exec(asset);
    if (found)
      assets.push({ id: found[1], bytes: Number(found[2]), sha256: found[3] });
    else unreadable.push(asset);
  }
  if (unreadable.length)
    throw new Error(
      `upload-evidence-assets: ${unreadable.length} asset line(s) the ` +
        `listing format does not explain:\n  ${unreadable.join('\n  ')}\n` +
        'Skipping one would read as an asset the store does not hold, so it ' +
        'would be uploaded a second time -- or leave a recording paired with ' +
        'nothing. The format changed; fix the pattern rather than the data.',
    );
  const header = DECLARED_FILES.exec(text);
  if (!header)
    throw new Error(
      'upload-evidence-assets: that text carries no asset listing header, ' +
        'so there is nothing to check the asset lines against. An empty ' +
        'store and a listing this script could not read look identical -- ' +
        'a short list -- and only one of them is good news.',
    );
  const declared = Number(header[1]);
  if (assets.length !== declared)
    throw new Error(
      `upload-evidence-assets: ${assets.length} asset line(s) against the ` +
        `${declared} its header declares. The listing pages, so a page taken ` +
        'for the whole store would upload every recording beyond it a second ' +
        'time. Continue the listing with `after` until it is whole.',
    );
  return assets;
};
