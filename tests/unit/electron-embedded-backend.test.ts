import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { APP_HOST, findFreePort } = require('../../electron/embedded-backend.cjs') as {
  APP_HOST: string;
  findFreePort: (host?: string) => Promise<number>;
};

describe('Electron embedded backend helpers', () => {
  it('uses the desktop loopback host constant', () => {
    expect(APP_HOST).toBe('127.0.0.1');
  });

  it('can allocate a free port on the desktop loopback host', async () => {
    const port = await findFreePort(APP_HOST);
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(0);
  });
});
