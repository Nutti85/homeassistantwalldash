import { connect, type IClientOptions, type MqttClient } from 'mqtt';

export interface FrigateUpdateConfig {
  url: string;
  username: string;
  password: string;
  topic: 'frigate/reviews';
}

const defaultTopic = 'frigate/reviews' as const;
const notificationCoalesceMs = 100;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseFrigateUpdateConfig = (
  urlValue?: string,
  usernameValue?: string,
  passwordValue?: string,
  topicValue?: string,
): FrigateUpdateConfig | undefined => {
  const url = urlValue?.trim() ?? '';
  const username = usernameValue?.trim() ?? '';
  const password = passwordValue ?? '';
  const topic = topicValue?.trim() || defaultTopic;
  if (!url || !username || !password || topic !== defaultTopic) return undefined;
  try {
    const parsed = new URL(url);
    if (!['mqtt:', 'mqtts:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return undefined;
    return { url: parsed.toString().replace(/\/+$/, ''), username, password, topic: defaultTopic };
  } catch {
    return undefined;
  }
};

type MqttConnector = (url: string, options?: IClientOptions) => MqttClient;

/** Server-only invalidation bridge. MQTT payloads never leave this class. */
export class FrigateUpdateService {
  private readonly listeners = new Set<() => void>();
  private readonly client?: MqttClient;
  private notificationTimer?: ReturnType<typeof setTimeout>;
  private readonly onConnect = () => {
    const config = this.config;
    if (!config) return;
    try { this.client?.subscribe(config.topic, () => {}); } catch { /* Reconnect will retry the subscription. */ }
  };
  private readonly onError = () => {
    // MQTT is an acceleration path; REST and the client poller remain authoritative.
  };
  private readonly onMessage = (topic: string, payload: Buffer) => {
    const config = this.config;
    if (!config || topic !== config.topic) return;
    try {
      const parsed: unknown = JSON.parse(payload.toString('utf8'));
      if (!isRecord(parsed) || parsed.type !== 'end' || this.notificationTimer !== undefined) return;
      this.notificationTimer = setTimeout(() => {
        this.notificationTimer = undefined;
        for (const listener of this.listeners) listener();
      }, notificationCoalesceMs);
    } catch { /* Malformed broker messages are ignored. */ }
  };

  public constructor(private readonly config: FrigateUpdateConfig | undefined, connector: MqttConnector = connect) {
    if (!config) return;
    try {
      this.client = connector(config.url, { username: config.username, password: config.password, reconnectPeriod: 5_000 });
      this.client.on('connect', this.onConnect);
      this.client.on('message', this.onMessage);
      this.client.on('error', this.onError);
    } catch { /* REST and polling remain the source of truth when MQTT is unavailable. */ }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  public listenerCount(): number {
    return this.listeners.size;
  }

  public close(): void {
    if (this.notificationTimer !== undefined) clearTimeout(this.notificationTimer);
    this.notificationTimer = undefined;
    this.listeners.clear();
    this.client?.off('connect', this.onConnect);
    this.client?.off('message', this.onMessage);
    this.client?.off('error', this.onError);
    try { this.client?.end(true); } catch { /* Cleanup must remain best-effort. */ }
  }
}
