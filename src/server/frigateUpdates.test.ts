import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connect } from 'mqtt';
import { FrigateUpdateService, parseFrigateUpdateConfig } from './frigateUpdates';

vi.mock('mqtt', () => ({ connect: vi.fn() }));

class FakeMqttClient extends EventEmitter {
  public readonly subscribe = vi.fn((_topic: string, callback?: (error?: Error) => void) => callback?.());
  public readonly end = vi.fn();
}

const mqttConfig = { url: 'mqtts://broker.internal:8883', username: 'walldash-readonly', password: 'not-a-real-secret', topic: 'frigate/reviews' } as const;
const message = (value: unknown) => Buffer.from(JSON.stringify(value));

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('parseFrigateUpdateConfig', () => {
  it('requires a complete broker configuration and defaults the review topic', () => {
    expect(parseFrigateUpdateConfig(' mqtts://broker.internal:8883 ', 'readonly', 'secret')).toEqual({
      url: 'mqtts://broker.internal:8883', username: 'readonly', password: 'secret', topic: 'frigate/reviews',
    });
    expect(parseFrigateUpdateConfig('', 'readonly', 'secret')).toBeUndefined();
    expect(parseFrigateUpdateConfig('mqtt://broker', '', 'secret')).toBeUndefined();
    expect(parseFrigateUpdateConfig('mqtt://broker', 'readonly', '')).toBeUndefined();
    expect(parseFrigateUpdateConfig('https://broker', 'readonly', 'secret')).toBeUndefined();
  });

  it('rejects malformed or non-review topics without exposing the configured values', () => {
    expect(parseFrigateUpdateConfig('mqtt://broker', 'readonly', 'secret', 'other/topic')).toBeUndefined();
    expect(parseFrigateUpdateConfig('mqtt://broker', 'readonly', 'secret', 'frigate/reviews/#')).toBeUndefined();
  });
});

describe('FrigateUpdateService', () => {
  it('subscribes to the configured topic and emits one invalidation for a completed review only', async () => {
    vi.useFakeTimers();
    const client = new FakeMqttClient();
    vi.mocked(connect).mockReturnValue(client as never);
    const listener = vi.fn();
    const service = new FrigateUpdateService(mqttConfig);
    const unsubscribe = service.subscribe(listener);

    client.emit('connect');
    client.emit('message', mqttConfig.topic, message({ type: 'new', id: 'new-review' }));
    client.emit('message', mqttConfig.topic, message({ type: 'update', id: 'updated-review' }));
    client.emit('message', mqttConfig.topic, message({ type: 'end', id: 'finished-review' }));
    client.emit('message', mqttConfig.topic, message({ type: 'end', id: 'finished-review' }));
    client.emit('message', 'frigate/other', message({ type: 'end', id: 'other-topic' }));
    client.emit('message', mqttConfig.topic, Buffer.from('not-json'));

    await vi.advanceTimersByTimeAsync(100);
    expect(client.subscribe).toHaveBeenCalledWith(mqttConfig.topic, expect.any(Function));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith();
    unsubscribe();
    client.emit('message', mqttConfig.topic, message({ type: 'end', id: 'after-cleanup' }));
    await vi.advanceTimersByTimeAsync(100);
    expect(listener).toHaveBeenCalledTimes(1);
    service.close();
    expect(client.end).toHaveBeenCalled();
  });

  it('resubscribes after reconnect and keeps listener registration bounded', () => {
    const client = new FakeMqttClient();
    vi.mocked(connect).mockReturnValue(client as never);
    const service = new FrigateUpdateService(mqttConfig);
    const first = service.subscribe(() => {});
    const second = service.subscribe(() => {});

    client.emit('connect');
    client.emit('close');
    client.emit('connect');

    expect(client.subscribe).toHaveBeenCalledTimes(2);
    expect(service.listenerCount()).toBe(2);
    first(); second();
    expect(service.listenerCount()).toBe(0);
    service.close();
  });

  it('does not connect or retain credentials when configuration is absent', () => {
    const service = new FrigateUpdateService(undefined);
    expect(connect).not.toHaveBeenCalled();
    expect(service.listenerCount()).toBe(0);
    service.close();
  });
});
