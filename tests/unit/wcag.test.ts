import { describe, expect, it } from 'vitest';
import { contrast, luminance, over, parseColour, type RGB } from '../wcag';

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

describe('WCAG relative luminance and contrast', () => {
  it('spans 1:1 to 21:1, the two ends the standard fixes', () => {
    expect(contrast(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrast(WHITE, WHITE)).toBe(1);
    expect(luminance(WHITE)).toBeCloseTo(1, 10);
    expect(luminance(BLACK)).toBe(0);
  });

  it('does not care which colour is given first', () => {
    const accent: RGB = [10, 125, 102];
    expect(contrast(accent, WHITE)).toBe(contrast(WHITE, accent));
  });

  it('linearises at 0.04045, which no 8-bit channel can tell from 0.03928', () => {
    // The two copies this module replaced disagreed: WCAG 2.0's published
    // text says 0.03928 and sRGB / WCAG 2.1 say 0.04045 (#277). They cannot
    // ever disagree about a result. The thresholds straddle channel values
    // 10.0164 to 10.3148, and `v / 255` for an integer `v` never lands
    // there -- 10/255 is 0.0392 and 11/255 is 0.0431.
    //
    // Pinned so the claim is a measurement rather than a comment: this is
    // the arithmetic both constants agree on, either side of the gap.
    const under = (v: number) => v / 255 / 12.92;
    const overThreshold = (v: number) => ((v / 255 + 0.055) / 1.055) ** 2.4;
    expect(luminance([10, 10, 10])).toBeCloseTo(under(10), 12);
    expect(luminance([11, 11, 11])).toBeCloseTo(overThreshold(11), 12);
    // And nothing integral sits between them.
    expect(Math.ceil(0.03928 * 255)).toBe(Math.ceil(0.04045 * 255));
  });
});

describe('reading a CSS colour', () => {
  it('reads every form this repo writes', () => {
    expect(parseColour('#abc')).toEqual({ rgb: [170, 187, 204], alpha: 1 });
    expect(parseColour('#0A7D66')).toEqual({ rgb: [10, 125, 102], alpha: 1 });
    expect(parseColour('rgb(1, 2, 3)')).toEqual({ rgb: [1, 2, 3], alpha: 1 });
    // The space-separated form, which is how tokens.css writes a glass
    // surface, and the comma form, which is how a browser reports one.
    expect(parseColour('rgb(255 255 255 / 0.35)')).toEqual({
      rgb: [255, 255, 255],
      alpha: 0.35,
    });
    expect(parseColour('rgba(0, 0, 0, 0.5)')).toEqual({
      rgb: [0, 0, 0],
      alpha: 0.5,
    });
    expect(parseColour('rgb(0 0 0 / 50%)')).toEqual({
      rgb: [0, 0, 0],
      alpha: 0.5,
    });
  });

  it('says no rather than guessing', () => {
    // A guard that treats an unreadable colour as a readable one drops it
    // from the check silently, which is how #17's alpha tokens went unseen.
    for (const value of ['', 'transparent', 'currentColor', '#ab', 'rgb(1,2)'])
      expect(parseColour(value), value).toBeNull();
  });
});

describe('putting a colour onto its ground', () => {
  it('is the ground at alpha 0 and the colour at alpha 1', () => {
    expect(over({ rgb: BLACK, alpha: 0 }, WHITE)).toEqual(WHITE);
    expect(over({ rgb: BLACK, alpha: 1 }, WHITE)).toEqual(BLACK);
  });

  it('changes the verdict, which is why it is done before judging', () => {
    // The case `print-legibility.spec.ts` read wrong before #277: it dropped
    // the alpha and measured this ink as pure black, 21:1 -- a colour it
    // would have passed as readable while the sheet shows barely a tint.
    const faint = parseColour('rgba(0, 0, 0, 0.1)');
    expect(contrast(faint!.rgb, WHITE)).toBeCloseTo(21, 5);
    const onPaper = over(faint!, WHITE);
    expect(onPaper).toEqual([230, 230, 230]);
    expect(contrast(onPaper, WHITE)).toBeLessThan(1.3);
  });
});
