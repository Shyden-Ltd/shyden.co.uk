import { describe, expect, it } from 'vitest';
import { qualify } from '../../scripts/visual-rebaseline.mjs';

/**
 * The visual rebaseline (#459) and the decisions it makes. Fixtures are
 * written here, never imported from the code under test.
 */

/**
 * #26's real lockfile entries (c6af312, @playwright/test 1.61.1 to 1.63.0),
 * copied verbatim. The bump changed the root devDependency, these three
 * entries, and REMOVED `node_modules/playwright/node_modules/fsevents`, so a
 * rule naming only the three entries would have refused the one real
 * Playwright update this repository has had.
 */
const PLAYWRIGHT_ENTRIES = {
  '1.61.1': {
    'node_modules/@playwright/test': {
      version: '1.61.1',
      resolved: 'https://registry.npmjs.org/@playwright/test/-/test-1.61.1.tgz',
      integrity:
        'sha512-8nKv6+0RJSL9FE4jYOEGXnPeM/Hg12qZpmqzZjRh3qM0Y7c3z1mrOTfFLids72RDQYVh9WpLEfR5WdpNX4fkig==',
      dev: true,
      license: 'Apache-2.0',
      dependencies: { playwright: '1.61.1' },
      bin: { playwright: 'cli.js' },
      engines: { node: '>=18' },
    },
    'node_modules/playwright': {
      version: '1.61.1',
      resolved: 'https://registry.npmjs.org/playwright/-/playwright-1.61.1.tgz',
      integrity:
        'sha512-DWnY5o3YbLWK4GovuAVwpqL+1VwGNdUGrRr++8j8PtQQzvAVZUIMjKQ90fY689sEJZJBbZVw1rXaOKSTitkzPQ==',
      dev: true,
      license: 'Apache-2.0',
      dependencies: { 'playwright-core': '1.61.1' },
      bin: { playwright: 'cli.js' },
      engines: { node: '>=18' },
      optionalDependencies: { fsevents: '2.3.2' },
    },
    'node_modules/playwright/node_modules/fsevents': {
      version: '2.3.2',
      resolved: 'https://registry.npmjs.org/fsevents/-/fsevents-2.3.2.tgz',
      integrity:
        'sha512-xiqMQR4xAeHTuB9uWm+fFRcIOgKBMiOBP+eXiyT7jsgVCq1bkVygt00oASowB7EdtpOHaaPgKt812P9ab+DDKA==',
      dev: true,
      hasInstallScript: true,
      license: 'MIT',
      optional: true,
      os: ['darwin'],
      engines: { node: '^8.16.0 || ^10.6.0 || >=11.0.0' },
    },
    'node_modules/playwright-core': {
      version: '1.61.1',
      resolved:
        'https://registry.npmjs.org/playwright-core/-/playwright-core-1.61.1.tgz',
      integrity:
        'sha512-h7Qlt6m4REp25qvIdvbDtVmD4LqVXfpRxhORv9L0jzETM05p4fuPJ3dKyuSXQxDSbXnmS79HAgi9589lGSpLkg==',
      dev: true,
      license: 'Apache-2.0',
      bin: { 'playwright-core': 'cli.js' },
      engines: { node: '>=18' },
    },
  },
  '1.63.0': {
    'node_modules/@playwright/test': {
      version: '1.63.0',
      resolved: 'https://registry.npmjs.org/@playwright/test/-/test-1.63.0.tgz',
      integrity:
        'sha512-oxMK4vllB9RK5NQ2l1pq1IfOf2AvnEuj/vYGDj0H2nMtmtZpKtCwt/l00GEO6xjGfpBNAvjovvYdCm50dRQkpQ==',
      dev: true,
      license: 'Apache-2.0',
      dependencies: { playwright: '1.63.0' },
      bin: { playwright: 'cli.js' },
      engines: { node: '>=20' },
    },
    'node_modules/playwright': {
      version: '1.63.0',
      resolved: 'https://registry.npmjs.org/playwright/-/playwright-1.63.0.tgz',
      integrity:
        'sha512-+7ziBLidS4NaNCdt57SUDT+wYmmd5fmiQejUic/kb+YsYSCPyOOE9sebzMjNmQrsnNpDJqd4WHvV/8lfKfUDUg==',
      dev: true,
      license: 'Apache-2.0',
      dependencies: { 'playwright-core': '1.63.0' },
      bin: { playwright: 'cli.js' },
      engines: { node: '>=20' },
    },
    'node_modules/playwright-core': {
      version: '1.63.0',
      resolved:
        'https://registry.npmjs.org/playwright-core/-/playwright-core-1.63.0.tgz',
      integrity:
        'sha512-rYCsBF/M5HjUch52bbtVONEFjv6Xu8sm8h72dNlR5bzIE1fvC/bxgspzkjSfU+MweEMmPM8KJebG6nnyxo5mCg==',
      dev: true,
      license: 'Apache-2.0',
      bin: { 'playwright-core': 'cli.js' },
      engines: { node: '>=20' },
    },
  },
} as const;

type Release = keyof typeof PLAYWRIGHT_ENTRIES;

const npmEntry = (name: string, version: string) => ({
  version,
  resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`,
  integrity: `sha512-${name}-${version}`,
  dev: true,
  license: 'MIT',
});

interface LockChange {
  readonly astro?: string;
  readonly root?: Record<string, string>;
  readonly extra?: Record<string, unknown>;
  readonly top?: Record<string, unknown>;
}

/** A lockfile shaped like this repository's. */
const lockAt = (playwright: Release, change: LockChange = {}) =>
  JSON.stringify(
    {
      name: 'shyden-co-uk',
      version: '0.1.0',
      lockfileVersion: 3,
      requires: true,
      ...change.top,
      packages: {
        '': {
          name: 'shyden-co-uk',
          version: '0.1.0',
          dependencies: { astro: `^${change.astro ?? '7.3.5'}` },
          devDependencies: {
            '@playwright/test': `^${playwright}`,
            ...change.root,
          },
        },
        'node_modules/astro': npmEntry('astro', change.astro ?? '7.3.5'),
        ...PLAYWRIGHT_ENTRIES[playwright],
        ...change.extra,
      },
    },
    null,
    2,
  );

const pkgAt = (
  playwright: Release,
  change: { astro?: string; build?: string } = {},
) =>
  JSON.stringify(
    {
      name: 'shyden-co-uk',
      version: '0.1.0',
      scripts: { build: change.build ?? 'astro build' },
      dependencies: { astro: `^${change.astro ?? '7.3.5'}` },
      devDependencies: { '@playwright/test': `^${playwright}` },
    },
    null,
    2,
  );

const dockerfileAt = (version: string, comment = '# The image CI runs.') =>
  `${comment}\nFROM mcr.microsoft.com/playwright:v${version}-noble@sha256:${'a'.repeat(64)}\n`;

const OLD = {
  lock: lockAt('1.61.1'),
  pkg: pkgAt('1.61.1'),
  dockerfile: dockerfileAt('1.61.1'),
};
const NEW = {
  lock: lockAt('1.63.0'),
  pkg: pkgAt('1.63.0'),
  dockerfile: dockerfileAt('1.61.1'),
};
const REPO = 'shyden-labs/shyden.co.uk';

/** #26 as a pull request: Dependabot's, level, the lockfile and package.json. */
const pr = (change: Partial<Parameters<typeof qualify>[0]> = {}) => ({
  author: 'dependabot[bot]',
  headRepo: REPO,
  baseRepo: REPO,
  files: ['package-lock.json', 'package.json'],
  changedFiles: 2,
  behindBy: 0,
  base: OLD,
  head: NEW,
  ...change,
});

const reasonOf = (verdict: ReturnType<typeof qualify>) =>
  verdict.qualifies ? '(it qualified)' : verdict.reason;

describe('qualify: a Playwright update and nothing else (#459)', () => {
  it('qualifies #26, the real bump, nested fsevents removed', () => {
    expect(qualify(pr())).toEqual({
      qualifies: true,
      versions:
        '@playwright/test 1.61.1 → 1.63.0, playwright 1.61.1 → 1.63.0, ' +
        'playwright-core 1.61.1 → 1.63.0',
    });
  });

  it('qualifies a bump that also brings the Dockerfile pin level', () => {
    const verdict = qualify(
      pr({
        files: [
          'docker/playwright/Dockerfile',
          'package-lock.json',
          'package.json',
        ],
        changedFiles: 3,
        head: { ...NEW, dockerfile: dockerfileAt('1.63.0') },
      }),
    );
    expect(verdict.qualifies).toBe(true);
  });

  it('qualifies a downgrade, the move the end-to-end proof makes', () => {
    expect(qualify(pr({ base: NEW, head: OLD }))).toEqual({
      qualifies: true,
      versions:
        '@playwright/test 1.63.0 → 1.61.1, playwright 1.63.0 → 1.61.1, ' +
        'playwright-core 1.63.0 → 1.61.1',
    });
  });

  it('refuses a pull request a person opened', () => {
    expect(reasonOf(qualify(pr({ author: 'ShydenMcM' })))).toBe(
      'opened by ShydenMcM, not dependabot[bot]',
    );
  });

  it('refuses a fork', () => {
    expect(reasonOf(qualify(pr({ headRepo: 'someone/shyden.co.uk' })))).toBe(
      'the head is someone/shyden.co.uk, not shyden-labs/shyden.co.uk',
    );
  });

  it('throws on a truncated file list rather than answering', () => {
    expect(() => qualify(pr({ changedFiles: 3 }))).toThrow(
      'the file list holds 2 of 3 changed files, so it is truncated',
    );
  });

  for (const path of [
    'src/pages/index.astro',
    'tests/e2e/__screenshots__/home-linux.png',
    '.github/workflows/ci.yml',
    'package-lock.json.orig',
  ])
    it(`refuses a pull request that also changes ${path}`, () => {
      expect(
        reasonOf(
          qualify(
            pr({
              files: ['package-lock.json', 'package.json', path],
              changedFiles: 3,
            }),
          ),
        ),
      ).toBe(`it changes more than dependencies: ${path}`);
    });

  it('refuses a rename into package.json, recorded as old → new', () => {
    expect(
      reasonOf(
        qualify(
          pr({ files: ['package-lock.json', 'docs/x.json → package.json'] }),
        ),
      ),
    ).toBe('it changes more than dependencies: docs/x.json → package.json');
  });

  it('refuses a head behind its base', () => {
    expect(reasonOf(qualify(pr({ behindBy: 2 })))).toBe(
      'it is 2 commit(s) behind its base; bringing it level runs this again',
    );
  });

  it('refuses Playwright grouped with Astro', () => {
    const head = {
      ...NEW,
      lock: lockAt('1.63.0', { astro: '7.4.0' }),
      pkg: pkgAt('1.63.0', { astro: '7.4.0' }),
    };
    expect(reasonOf(qualify(pr({ head })))).toBe(
      "package-lock.json's root entry changes more than @playwright/test",
    );
  });

  it('refuses Playwright grouped with a font', () => {
    const font = (version: string) => ({
      'node_modules/@fontsource-variable/instrument-sans': npmEntry(
        '@fontsource-variable/instrument-sans',
        version,
      ),
    });
    const base = { ...OLD, lock: lockAt('1.61.1', { extra: font('5.3.0') }) };
    const head = { ...NEW, lock: lockAt('1.63.0', { extra: font('5.2.4') }) };
    expect(reasonOf(qualify(pr({ base, head })))).toBe(
      "package-lock.json changes node_modules/@fontsource-variable/instrument-sans, outside Playwright's tree",
    );
  });

  it("refuses a package added outside Playwright's tree", () => {
    const head = {
      ...NEW,
      lock: lockAt('1.63.0', {
        extra: { 'node_modules/left-pad': npmEntry('left-pad', '1.3.0') },
      }),
    };
    expect(reasonOf(qualify(pr({ head })))).toBe(
      "package-lock.json changes node_modules/left-pad, outside Playwright's tree",
    );
  });

  it("refuses a package removed outside Playwright's tree", () => {
    const base = {
      ...OLD,
      lock: lockAt('1.61.1', {
        extra: { 'node_modules/left-pad': npmEntry('left-pad', '1.3.0') },
      }),
    };
    expect(reasonOf(qualify(pr({ base })))).toBe(
      "package-lock.json changes node_modules/left-pad, outside Playwright's tree",
    );
  });

  it("refuses a package nested in another package's tree", () => {
    const head = {
      ...NEW,
      lock: lockAt('1.63.0', {
        extra: {
          'node_modules/astro/node_modules/fsevents': npmEntry(
            'fsevents',
            '2.3.3',
          ),
        },
      }),
    };
    expect(reasonOf(qualify(pr({ head })))).toBe(
      "package-lock.json changes node_modules/astro/node_modules/fsevents, outside Playwright's tree",
    );
  });

  it('refuses a lookalike of a Playwright entry', () => {
    const head = {
      ...NEW,
      lock: lockAt('1.63.0', {
        extra: {
          'node_modules/playwright-extra': npmEntry(
            'playwright-extra',
            '4.3.6',
          ),
        },
      }),
    };
    expect(reasonOf(qualify(pr({ head })))).toBe(
      "package-lock.json changes node_modules/playwright-extra, outside Playwright's tree",
    );
  });

  it('refuses a root-entry change besides @playwright/test', () => {
    const head = {
      ...NEW,
      lock: lockAt('1.63.0', { root: { vitest: '^5.0.2' } }),
    };
    expect(reasonOf(qualify(pr({ head })))).toBe(
      "package-lock.json's root entry changes more than @playwright/test",
    );
  });

  it('refuses a lockfile change outside its packages', () => {
    const head = {
      ...NEW,
      lock: lockAt('1.63.0', { top: { lockfileVersion: 4 } }),
    };
    expect(reasonOf(qualify(pr({ head })))).toBe(
      'package-lock.json changes outside its packages',
    );
  });

  it('refuses a package.json change besides @playwright/test', () => {
    const head = {
      ...NEW,
      pkg: pkgAt('1.63.0', { build: 'astro build && true' }),
    };
    expect(reasonOf(qualify(pr({ head })))).toBe(
      'package.json changes more than @playwright/test',
    );
  });

  it('refuses a Dockerfile change besides its FROM pin', () => {
    const verdict = qualify(
      pr({
        files: [
          'docker/playwright/Dockerfile',
          'package-lock.json',
          'package.json',
        ],
        changedFiles: 3,
        head: { ...NEW, dockerfile: dockerfileAt('1.63.0', '# Edited.') },
      }),
    );
    expect(reasonOf(verdict)).toBe(
      'docker/playwright/Dockerfile changes more than its FROM pin',
    );
  });

  it('refuses a Dockerfile-only pull request: no Playwright version moved', () => {
    const verdict = qualify(
      pr({
        files: ['docker/playwright/Dockerfile'],
        changedFiles: 1,
        head: { ...OLD, dockerfile: dockerfileAt('1.63.0') },
      }),
    );
    expect(reasonOf(verdict)).toBe('no Playwright version moved');
  });
});
