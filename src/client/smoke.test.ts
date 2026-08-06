import { describe, expect, it } from 'vitest';

describe('dashboard project', () => {
  it('exposes the Norwegian dashboard title', async () => {
    const { dashboardTitle } = await import('../shared/entities');
    expect(dashboardTitle).toBe('Smarthjem');
  });
});
