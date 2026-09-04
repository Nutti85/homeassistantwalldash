import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const fallbackPath = fileURLToPath(new URL('./node-os-userinfo-fallback.cjs', import.meta.url));

describe('local Node startup fallback', () => {
  it('allows tsx to load when Windows user lookup returns ENOMEM', () => {
    const result = spawnSync(process.execPath, [
      '--require', fallbackPath,
      '--import', 'tsx',
      '-e', "console.log('tsx preload ok')",
    ], { cwd: process.cwd(), encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('tsx preload ok');
    expect(result.stderr).not.toContain('uv_os_get_passwd');
  });
});
