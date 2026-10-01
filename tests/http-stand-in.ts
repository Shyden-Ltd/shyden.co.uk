import { afterEach } from 'vitest';
import type { Server } from 'node:http';

/**
 * A list a test file pushes each HTTP server it starts onto; every server on it
 * is closed after each test. Registers its own `afterEach`, so call it once at
 * the top of a test file, never inside a test.
 *
 * One home since #390: `device-runner.test.ts` was written with a copy of the
 * teardown `webdriver-status.test.ts` already had, and `duplication.test.ts`
 * refused the pair.
 */
export function serversClosedAfterEach(): Server[] {
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve())),
        ),
    );
  });
  return servers;
}
