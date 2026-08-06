import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStates } from './api';

describe('browser dashboard API', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('rejects a successful response without valid confirmed states', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ states: { guestMode: { state: 'on' } } }), { status: 200 })));

    await expect(getStates()).rejects.toThrow('Kunne ikke oppdatere smarthuset. Prøv igjen.');
  });

  it('rejects non-JSON successful responses with the safe fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 200 })));

    await expect(getStates()).rejects.toThrow('Kunne ikke oppdatere smarthuset. Prøv igjen.');
  });
});
