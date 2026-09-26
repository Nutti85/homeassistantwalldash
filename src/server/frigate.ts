import type { FrigateReviewItem } from '../shared/activity';

export class FrigateCommunicationError extends Error {
  public constructor(public readonly mediaMissing = false) {
    super('Kunne ikke kommunisere med Frigate');
  }
}

export const isFrigateReviewId = (value: string): boolean => /^\d{10}(?:\.\d{1,6})?-[a-z0-9]{6}$/.test(value);
const cameraPattern = /^[A-Za-z0-9_-]+$/;
const validTimestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 253402300799;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Server-configured origin only. Never accepts upstream URLs from a request. */
export class FrigateClient {
  private readonly baseUrl: string;

  public constructor(baseUrl: string, private readonly fetcher: typeof fetch = fetch) {
    try {
      const url = new URL(baseUrl.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new FrigateCommunicationError();
      this.baseUrl = url.toString().replace(/\/+$/, '');
    } catch { throw new FrigateCommunicationError(); }
  }

  public async getReviewItems(after: Date, before: Date, signal?: AbortSignal): Promise<FrigateReviewItem[]> {
    try {
      const start = after.getTime() / 1000;
      const end = before.getTime() / 1000;
      if (!validTimestamp(start) || !validTimestamp(end) || end <= start) throw new FrigateCommunicationError();
      const query = new URLSearchParams({ after: String(start), before: String(end), limit: '500' });
      const response = await this.request(`/api/review?${query}`, signal);
      const payload: unknown = await response.json();
      if (!Array.isArray(payload) || payload.length > 500) throw new FrigateCommunicationError();
      return payload.map((item) => {
        if (!record(item) || typeof item.id !== 'string' || !isFrigateReviewId(item.id)
          || typeof item.camera !== 'string' || !cameraPattern.test(item.camera)
          || !validTimestamp(item.start_time)
          || (item.end_time != null && (!validTimestamp(item.end_time) || item.end_time < item.start_time))
          || !['alert', 'detection'].includes(String(item.severity))
          || (item.data != null && !record(item.data))) throw new FrigateCommunicationError();
        const data: Record<string, unknown> = {};
        for (const key of ['objects', 'zones']) {
          const value = item.data?.[key];
          if (value !== undefined) {
            if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) throw new FrigateCommunicationError();
            data[key] = value;
          }
        }
        return { id: item.id, camera: item.camera, start_time: item.start_time,
          ...(typeof item.end_time === 'number' ? { end_time: item.end_time } : {}),
          severity: String(item.severity), ...(item.data ? { data } : {}) };
      });
    } catch { throw new FrigateCommunicationError(); }
  }

  public async getReviewPreview(id: string, signal?: AbortSignal): Promise<Response> {
    if (!isFrigateReviewId(id)) throw new FrigateCommunicationError();
    return this.media(`/api/review/${id}/preview?format=mp4`, signal);
  }

  public async getReviewThumbnail(id: string, camera: string, signal?: AbortSignal): Promise<Response> {
    if (!isFrigateReviewId(id) || !cameraPattern.test(camera)) throw new FrigateCommunicationError();
    return this.media(`/clips/review/thumb-${camera}-${id}.webp`, signal, 'image/webp');
  }

  public async getRecordingClip(camera: string, start: number, end: number, signal?: AbortSignal): Promise<Response> {
    if (!cameraPattern.test(camera) || !validTimestamp(start) || !validTimestamp(end) || end <= start || end - start > 300) throw new FrigateCommunicationError();
    return this.media(`/api/${camera}/start/${start}/end/${end}/clip.mp4`, signal);
  }

  private async media(path: string, signal?: AbortSignal, contentType = 'video/mp4'): Promise<Response> {
    const response = await this.request(path, signal);
    if (response.headers.get('content-type')?.split(';')[0].trim() !== contentType || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      throw new FrigateCommunicationError();
    }
    return response;
  }

  private async request(path: string, signal?: AbortSignal): Promise<Response> {
    try {
      const timeout = AbortSignal.timeout(8000);
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: 'GET', redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new FrigateCommunicationError(response.status === 404 || response.status === 410);
      }
      return response;
    } catch (error) {
      throw error instanceof FrigateCommunicationError ? error : new FrigateCommunicationError();
    }
  }
}
