import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStates, requestAiReportRefresh } from './api';

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

  it('forwards the requested report mode and trigger time', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await requestAiReportRefresh('coming_home');

    expect(fetchMock).toHaveBeenCalledWith('/api/ai-report/refresh', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"mode":"coming_home"'),
    }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).requestedAt).toEqual(expect.any(String));
  });
});
