import { test, expect } from './fixtures';

// Throwaway (#163 AC2): fails on purpose, so the shard running it fails and
// build-and-test must go red with every other job green.
test('probe #163: a failing test fails its shard', async () => {
  expect(1, 'deliberately failing, to prove build-and-test goes red').toBe(2);
});
