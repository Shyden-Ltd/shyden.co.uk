import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // Sized from the slowest test that spawns a process, never left at the
    // 5000ms default: `test-e2e.mjs refuses from this checkout` took 1.1s on a
    // laptop, 5.4s on the CI runner and up to 9.8s under load (#235). Pinned
    // by tests/unit/unit-budget.test.ts.
    testTimeout: 30_000,
  },
});
