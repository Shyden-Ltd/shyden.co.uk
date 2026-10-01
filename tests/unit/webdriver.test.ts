import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { WebDriver, WebDriverError } from '../device/ios/webdriver';
import { serversClosedAfterEach } from '../http-stand-in';

/**
 * The wire layer of the iOS leg's WebDriver client, against a real HTTP
 * server answering in the shapes measured from `safaridriver`. The leg itself
 * needs a paired iPhone and never runs in CI, so these are the only place the
 * measured protocol facts in webdriver.ts are held: a POST with no body still
 * sends JSON (safaridriver answers a bare 400 otherwise), an error envelope is
 * thrown and never read as data, and an element reference lives under one
 * exact key (#390 F104).
 */

const servers = serversClosedAfterEach();

/** The W3C web element identifier, as measured from a live session. */
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';

interface Received {
  readonly method: string;
  readonly path: string;
  readonly contentType: string | undefined;
  readonly body: string;
}

type Answer = (method: string, path: string) => string;

/**
 * A server answering each request with the raw text `answer` returns for its
 * method and path; resolves to its base URL and the requests it received.
 */
async function serverAnswering(
  answer: Answer,
): Promise<{ url: string; received: Received[] }> {
  const received: Received[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => {
      const method = request.method ?? '';
      const path = request.url ?? '';
      received.push({
        method,
        path,
        contentType: request.headers['content-type'],
        body,
      });
      response.end(answer(method, path));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(`expected a TCP address, got ${String(address)}`);
  }
  return { url: `http://127.0.0.1:${address.port}`, received };
}

/** A server answering every request with `body`; resolves to its base URL. */
async function answering(body: unknown): Promise<string> {
  return (await serverAnswering(() => JSON.stringify(body))).url;
}

/** A session `s1`, on a server answering every later request with `answer`. */
async function sessionAnswering(answer: Answer) {
  const { url, received } = await serverAnswering((method, path) =>
    method === 'POST' && path === '/session'
      ? JSON.stringify({ value: { sessionId: 's1', capabilities: {} } })
      : answer(method, path),
  );
  const driver = await WebDriver.createSession(url, { browserName: 'safari' });
  return { driver, received };
}

/** The element `e1` of session `s1`, whose later requests get `answer`. */
async function elementAnswering(answer: Answer) {
  const session = await sessionAnswering((method, path) =>
    path === '/session/s1/element'
      ? JSON.stringify({ value: { [ELEMENT_KEY]: 'e1' } })
      : answer(method, path),
  );
  const element = await session.driver.findElement('#cg-go');
  return { ...session, element };
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

describe('the WebDriver wire layer, in the shapes measured from safaridriver', () => {
  it('opens a session with the capabilities under alwaysMatch, and reads its id', async () => {
    const { driver, received } = await sessionAnswering(() => '');

    expect(driver.sessionId).toBe('s1');
    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0].body)).toEqual({
      capabilities: { alwaysMatch: { browserName: 'safari' } },
    });
  });

  it('sends a JSON content type and an empty object with a POST that has nothing to say', async () => {
    const { element, received } = await elementAnswering(() =>
      JSON.stringify({ value: null }),
    );

    await element.click();

    const click = received.at(-1);
    expect(click?.method).toBe('POST');
    expect(click?.path).toBe('/session/s1/element/e1/click');
    expect(click?.contentType).toBe('application/json');
    expect(click?.body).toBe('{}');
  });

  it('throws an error envelope as a WebDriverError carrying its code, never returns it', async () => {
    const { driver } = await sessionAnswering(() =>
      JSON.stringify({
        value: {
          error: 'no such element',
          message: 'nothing matched #missing',
          stacktrace: '',
        },
      }),
    );

    const failure = await driver.findElement('#missing').then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(WebDriverError);
    expect((failure as WebDriverError).webDriverError).toBe('no such element');
    expect((failure as WebDriverError).message).toContain(
      'nothing matched #missing',
    );
  });

  it('refuses an empty body, which is how safaridriver answers a bare 400', async () => {
    const { url } = await serverAnswering(() => '');

    await expect(WebDriver.isReady(url)).rejects.toThrow(
      'GET ' + url + '/status -> HTTP 200 with no WebDriver "value" envelope',
    );
  });

  it('refuses a body that is not JSON, naming the status and quoting the body', async () => {
    const { url } = await serverAnswering(() => '<html>proxy error</html>');

    await expect(WebDriver.isReady(url)).rejects.toThrow(
      'HTTP 200 with a non-JSON body: "<html>proxy error</html>"',
    );
  });

  it('reads an element only under the measured web element key', async () => {
    const { driver } = await sessionAnswering(() =>
      JSON.stringify({ value: { ELEMENT: 'e1' } }),
    );

    await expect(driver.findElement('#cg-go')).rejects.toThrow(
      `expected a WebDriver element reference (key "${ELEMENT_KEY}") for findElement("#cg-go")`,
    );
  });

  it('names the position of a bad entry among several elements', async () => {
    const { driver } = await sessionAnswering(() =>
      JSON.stringify({
        value: [{ [ELEMENT_KEY]: 'e1' }, { ELEMENT: 'e2' }],
      }),
    );

    await expect(driver.findElements('li')).rejects.toThrow(
      'for findElements("li")[1]',
    );
  });

  it('refuses a list of elements that is not a list', async () => {
    const { driver } = await sessionAnswering(() =>
      JSON.stringify({ value: { [ELEMENT_KEY]: 'e1' } }),
    );

    await expect(driver.findElements('li')).rejects.toThrow(
      'findElements("li") expected an array',
    );
  });

  it('passes an element to a script in the same envelope it was found in', async () => {
    const { driver, element, received } = await elementAnswering(() =>
      JSON.stringify({ value: true }),
    );

    expect(
      await driver.executeScript('return !!arguments[0];', [
        driver.elementRef(element.elementId),
      ]),
    ).toBe(true);

    const script = received.at(-1);
    expect(script?.path).toBe('/session/s1/execute/sync');
    expect(JSON.parse(script?.body ?? '')).toEqual({
      script: 'return !!arguments[0];',
      args: [{ [ELEMENT_KEY]: 'e1' }],
    });
  });

  it('reads an absent attribute as null, distinct from an empty string', async () => {
    const answers: Record<string, unknown> = {
      '/session/s1/element/e1/attribute/aria-busy': null,
      '/session/s1/element/e1/attribute/title': '',
      '/session/s1/element/e1/attribute/tabindex': 0,
    };
    const { element } = await elementAnswering((_, path) =>
      JSON.stringify({ value: answers[path] }),
    );

    expect(await element.attribute('aria-busy')).toBeNull();
    expect(await element.attribute('title')).toBe('');
    await expect(element.attribute('tabindex')).rejects.toThrow(
      'expected string|null, got: 0',
    );
  });

  it('refuses a rect missing a number, so a size check cannot measure nothing', async () => {
    const answers: Record<string, unknown> = {
      '/session/s1/element/e1/rect': { x: 0, y: 0, width: 44, height: 48 },
      '/session/s1/element/e2/rect': { x: 0, y: 0, width: '44px', height: 48 },
    };
    const { driver, element } = await elementAnswering((_, path) =>
      path === '/session/s1/elements'
        ? JSON.stringify({ value: [{ [ELEMENT_KEY]: 'e2' }] })
        : JSON.stringify({ value: answers[path] }),
    );
    const [unmeasured] = await driver.findElements('#cg-io-toggle');

    expect(await element.rect()).toEqual({ x: 0, y: 0, width: 44, height: 48 });
    await expect(unmeasured.rect()).rejects.toThrow(
      'element e2 .rect() expected numbers x, y, width and height, got: {"x":0,"y":0,"width":"44px","height":48}',
    );
  });

  it('ends a session with a DELETE of the session itself', async () => {
    const { driver, received } = await sessionAnswering(() =>
      JSON.stringify({ value: null }),
    );

    await driver.deleteSession();

    expect(received.at(-1)?.method).toBe('DELETE');
    expect(received.at(-1)?.path).toBe('/session/s1');
  });
});
