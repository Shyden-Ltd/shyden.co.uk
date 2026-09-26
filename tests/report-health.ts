import { expect, type APIRequestContext } from '@playwright/test';

/**
 * The report endpoint's health check answers ok (#97, spec 6.2): the REPORTS
 * binding is present and its table has the migration's columns. The one home
 * for the functions-runtime suite and the dev and prod sanity suites.
 */
export async function expectReportsBound(
  request: APIRequestContext,
): Promise<void> {
  const response = await request.get('/api/report/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
}
