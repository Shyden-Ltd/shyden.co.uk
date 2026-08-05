import { calculateGlory, formatNumber, ERRORS } from '../lib/gloryPoints';
import { siteEn, siteId } from '../lib/i18n/site';

// The calculator's own error copy is asserted verbatim by its unit tests, so
// gloryPoints.ts stays English and untouched. Mapping BY THE EXPORTED ERRORS
// OBJECT rather than by literal strings means a reworded message updates here
// automatically instead of silently falling through to English.
const lang = document.documentElement.lang === 'id' ? 'id' : 'en';
const t = (lang === 'id' ? siteId : siteEn).glory;
const LOCALISED_ERROR = new Map<string, string>([
  [ERRORS.empty, t.errors.empty],
  [ERRORS.notWhole, t.errors.notWhole],
  [ERRORS.zero, t.errors.zero],
  [ERRORS.tooLarge, t.errors.tooLarge],
]);

const input = document.querySelector<HTMLInputElement>('#glory-input');
const submit = document.querySelector<HTMLButtonElement>('#glory-submit');
const result = document.querySelector<HTMLElement>('#glory-result');
const error = document.querySelector<HTMLElement>('#glory-error');

function run(): void {
  if (!input || !result || !error) return;
  const outcome = calculateGlory(input.value);
  if (!outcome.ok) {
    result.textContent = '';
    error.textContent = LOCALISED_ERROR.get(outcome.error) ?? outcome.error;
    return;
  }
  error.textContent = '';
  const { coinsNeeded, beansNeeded, totalGiftValue } = outcome.result;
  result.textContent = t.resultLine(
    formatNumber(coinsNeeded, lang),
    formatNumber(beansNeeded, lang),
    formatNumber(totalGiftValue, lang),
  );
}

submit?.addEventListener('click', run);
input?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    run();
  }
});
