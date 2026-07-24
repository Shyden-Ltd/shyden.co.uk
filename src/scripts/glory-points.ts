import { calculateGlory, formatNumber } from '../lib/gloryPoints';

const input = document.querySelector<HTMLInputElement>('#glory-input');
const submit = document.querySelector<HTMLButtonElement>('#glory-submit');
const result = document.querySelector<HTMLElement>('#glory-result');
const error = document.querySelector<HTMLElement>('#glory-error');

function run(): void {
  if (!input || !result || !error) return;
  const outcome = calculateGlory(input.value);
  if (!outcome.ok) {
    result.textContent = '';
    error.textContent = outcome.error;
    return;
  }
  error.textContent = '';
  const { coinsNeeded, beansNeeded, totalGiftValue } = outcome.result;
  result.textContent =
    `${formatNumber(coinsNeeded)} coins → ${formatNumber(beansNeeded)} beans → ` +
    `${formatNumber(totalGiftValue)} total gift value`;
}

submit?.addEventListener('click', run);
input?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    run();
  }
});
