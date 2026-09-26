import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebDriver } from '../device/ios/webdriver';

/**
 * `WebDriver.isReady` is the readiness check `startSafaridriver` polls
 * (#309): W3C `GET /status`, answered here by a real HTTP server in the
 * shape measured from `safaridriver`, `{"value":{"message":"","ready":true}}`.
 */

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

/** A server answering every request with `body`; resolves to its base URL. */
async function answering(body: unknown): Promise<string> {
  const server = createServer((_, response) =>
    response.end(JSON.stringify(body)),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(`expected a TCP address, got ${String(address)}`);
  }
  return `http://127.0.0.1:${address.port}`;
}

describe('WebDriver.isReady', () => {
  it('is true when the server says it is ready', async () => {
    const url = await answering({ value: { message: '', ready: true } });

    expect(await WebDriver.isReady(url)).toBe(true);
  });

  it('is false when the server answers but is not ready', async () => {
    const url = await answering({
      value: { message: 'Session already in progress', ready: false },
    });

    expect(await WebDriver.isReady(url)).toBe(false);
  });
});
