import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAiReport, getStates, requestAiReportRefresh } from './api';

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

  it('requests the focused morning report', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await requestAiReportRefresh('morning');

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ mode: 'morning' });
  });

  it('requests the focused evening report', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await requestAiReportRefresh('evening');

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ mode: 'evening' });
  });

  it('bypasses the browser cache when polling for a published report', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: 'Ny rapport', publishedAt: '2026-08-23T08:00:00.000Z' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getAiReport();

    expect(fetchMock).toHaveBeenCalledWith('/api/ai-report', expect.objectContaining({ cache: 'no-store' }));
  });
});
