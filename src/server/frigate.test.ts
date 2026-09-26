import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrigateClient, FrigateCommunicationError } from './frigate';

const review = { id: '1787921400.123456-abc123', camera: 'Gaardsplassen_Wide', start_time: 1787921400, end_time: 1787921420, severity: 'alert', data: { objects: ['car'], zones: ['Parkering'] } };
const after = new Date('2026-08-28T07:50:00+02:00');
const before = new Date('2026-08-28T14:53:00+02:00');
const message = 'Kunne ikke kommunisere med Frigate';
afterEach(() => { vi.restoreAllMocks(); });

describe('FrigateClient', () => {
  it('queries bounded reviews at the configured normalized origin and strips private fields', async () => {
    const fetcher = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(Response.json([{ ...review, thumb_path: '/private', private: 'secret' }]));
    const client = new FrigateClient('http://frigate:5000///', fetcher);
    expect(await client.getReviewItems(after, before)).toEqual([review]);
    const [url, options] = fetcher.mock.calls[0];
    expect(new URL(String(url)).origin).toBe('http://frigate:5000');
    expect(new URL(String(url)).pathname).toBe('/api/review');
    expect(new URL(String(url)).searchParams.get('after')).toBe(String(after.getTime() / 1000));
    expect(new URL(String(url)).searchParams.get('before')).toBe(String(before.getTime() / 1000));
    expect(Number(new URL(String(url)).searchParams.get('limit'))).toBeGreaterThan(0);
    expect(Number(new URL(String(url)).searchParams.get('limit'))).toBeLessThanOrEqual(500);
    expect(options?.redirect).toBe('error');
  });

  it.each([{}, [null], [{ ...review, id: '../private' }], [{ ...review, camera: 'a/b' }], [{ ...review, start_time: '1787921400' }], [{ ...review, end_time: 1 }], [{ ...review, severity: 'unknown' }], [{ ...review, data: { objects: 'car' } }]])('rejects unexpected review JSON: %j', async (body) => {
    const client = new FrigateClient('http://frigate:5000', async () => Response.json(body));
    await expect(client.getReviewItems(after, before)).rejects.toThrow(message);
  });

  it('accepts an ongoing review with a null end timestamp', async () => {
    const client = new FrigateClient('http://frigate:5000', async () => Response.json([{ ...review, end_time: null }]));
    expect((await client.getReviewItems(after, before))[0].end_time).toBeUndefined();
  });

  it.each(['../secret', 'http://internal', '1787921400.123456-abc123?url=foo', 'abc', '1787921400.123456-abc123/'])('rejects unsafe review ID %s before fetching', async (id) => {
    const fetcher = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
    await expect(new FrigateClient('http://frigate:5000', fetcher).getReviewPreview(id)).rejects.toThrow(message);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([['../camera', 1, 2], ['camera?q=x', 1, 2], ['', 1, 2], ['Bod', NaN, 2], ['Bod', 1, Infinity], ['Bod', -1, 2], ['Bod', 2, 1], ['Bod', 1, 1], ['Bod', 1, 10000]] as const)('rejects invalid clip coordinates (%s, %s, %s)', async (camera, start, end) => {
    const fetcher = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
    await expect(new FrigateClient('http://frigate:5000', fetcher).getRecordingClip(camera, start, end)).rejects.toThrow(message);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetches preview and recording streams from fixed media paths', async () => {
    const fetcher = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockImplementation(async () => new Response('video', { headers: { 'Content-Type': 'video/mp4' } }));
    const client = new FrigateClient('http://frigate:5000', fetcher);
    expect(await (await client.getReviewPreview(review.id)).text()).toBe('video');
    expect(await (await client.getRecordingClip('Bod', 1787921400, 1787921420)).text()).toBe('video');
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'http://frigate:5000/api/review/1787921400.123456-abc123/preview?format=mp4',
      'http://frigate:5000/api/Bod/start/1787921400/end/1787921420/clip.mp4',
    ]);
  });

  it.each([401, 404, 410, 500])('redacts upstream HTTP %i details', async (status) => {
    const client = new FrigateClient('http://frigate:5000', async () => new Response('private token secret', { status }));
    await expect(client.getReviewItems(after, before)).rejects.toThrow(message);
    try { await client.getReviewPreview(review.id); } catch (error) {
      expect(error).toBeInstanceOf(FrigateCommunicationError);
      expect((error as Error).message).toBe(message);
      expect((error as FrigateCommunicationError).mediaMissing).toBe(status === 404 || status === 410);
    }
  });

  it.each([[new Date('bad'), before], [before, after], [after, after]])('rejects invalid query bounds', async (start, end) => {
    const fetcher = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
    await expect(new FrigateClient('http://frigate:5000', fetcher).getReviewItems(start, end)).rejects.toThrow(message);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('bounds upstream calls with an eight-second abort signal and redacts fetch errors', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetcher = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockRejectedValue(new Error('http://private password=secret'));
    await expect(new FrigateClient('http://frigate:5000', fetcher).getReviewItems(after, before)).rejects.toThrow(message);
    expect(timeout).toHaveBeenCalledWith(8000);
    expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects HTML masquerading as successful media', async () => {
    const client = new FrigateClient('http://frigate:5000', async () => new Response('<html>secret</html>', { headers: { 'Content-Type': 'text/html' } }));
    await expect(client.getReviewPreview(review.id)).rejects.toThrow(message);
  });

  it('gets thumbnails through a fixed validated review path', async () => {
    const fetcher = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockImplementation(async () => new Response('image', { headers: { 'content-type': 'image/webp' } }));
    const client = new FrigateClient('http://frigate:5000', fetcher);
    expect(await (await client.getReviewThumbnail(review.id, review.camera)).text()).toBe('image');
    expect(String(fetcher.mock.calls[0][0])).toBe('http://frigate:5000/clips/review/thumb-Gaardsplassen_Wide-1787921400.123456-abc123.webp');
    await expect(client.getReviewThumbnail('../bad', review.camera)).rejects.toThrow(message);
    await expect(client.getReviewThumbnail(review.id, '../bad')).rejects.toThrow(message);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects non-image thumbnail responses', async () => {
    const client = new FrigateClient('http://frigate:5000', async () => new Response('secret', { headers: { 'content-type': 'text/html' } }));
    await expect(client.getReviewThumbnail(review.id, review.camera)).rejects.toThrow(message);
  });
});
