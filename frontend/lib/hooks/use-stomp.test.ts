import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRealtimeUrls, subscribeTopic } from './use-stomp';

// --- Clients STOMP simulés : la configuration reçue, l'abonnement, la fermeture ---
interface FakeConfig {
  brokerURL?: string;
  webSocketFactory?: () => unknown;
  connectHeaders: Record<string, string>;
  onConnect: () => void;
  onWebSocketClose: () => void;
}

interface FakeClient {
  config: FakeConfig;
  topic: string | null;
  handler: ((msg: { body: string }) => void) | null;
  deactivated: boolean;
}

const clients = vi.hoisted(() => [] as FakeClient[]);

vi.mock('@stomp/stompjs', () => {
  class Client implements FakeClient {
    topic: string | null = null;
    handler: ((msg: { body: string }) => void) | null = null;
    deactivated = false;
    constructor(public config: FakeConfig) {
      clients.push(this);
    }
    activate() {}
    subscribe(topic: string, handler: (msg: { body: string }) => void) {
      this.topic = topic;
      this.handler = handler;
    }
    deactivate() {
      this.deactivated = true;
      return Promise.resolve();
    }
  }
  return { Client };
});
vi.mock('sockjs-client', () => ({ default: class {} }));
vi.mock('@/lib/config/urls', () => ({ API_URL: 'http://localhost:8080/api' }));
const token = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('@/lib/api/session-token', () => ({ getSessionToken: () => token.value }));

/** Laisse passer les promesses en attente (import de SockJS, fermeture du premier client). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('use-stomp helpers', () => {
  it('builds websocket and SockJS endpoints from an API URL', () => {
    expect(buildRealtimeUrls('http://localhost:8080/api')).toEqual({
      wsUrl: 'ws://localhost:8080/ws',
      sockJsUrl: 'http://localhost:8080/ws-sockjs',
    });
  });

  it('supports https origins and trailing slashes', () => {
    expect(buildRealtimeUrls('https://api.taskforce.test/api/')).toEqual({
      wsUrl: 'wss://api.taskforce.test/ws',
      sockJsUrl: 'https://api.taskforce.test/ws-sockjs',
    });
  });

  it('uses the page origin when the API shares it (desktop app)', () => {
    vi.stubGlobal('location', { origin: 'http://127.0.0.1:47900' });
    try {
      expect(buildRealtimeUrls('')).toEqual({
        wsUrl: 'ws://127.0.0.1:47900/ws',
        sockJsUrl: 'http://127.0.0.1:47900/ws-sockjs',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('subscribeTopic', () => {
  beforeEach(() => {
    clients.length = 0;
    token.value = null;
  });

  it('subscribes to the topic once connected, and hands over each message body', async () => {
    const bodies: string[] = [];
    subscribeTopic('/topic/projects.30', (body) => bodies.push(body));
    await settle();

    const client = clients[0];
    expect(client?.config.brokerURL).toBe('ws://localhost:8080/ws');
    client?.config.onConnect();
    expect(client?.topic).toBe('/topic/projects.30');
    client?.handler?.({ body: '{"action":"activity","issueId":7}' });
    expect(bodies).toEqual(['{"action":"activity","issueId":7}']);
  });

  it('sends the session token, when there is one', async () => {
    token.value = 'jwt-123';
    subscribeTopic('/topic/projects.30', () => {});
    await settle();

    expect(clients[0]?.config.connectHeaders).toEqual({ Authorization: 'Bearer jwt-123' });
  });

  it('falls back to SockJS when the WebSocket never opens', async () => {
    subscribeTopic('/topic/projects.30', () => {});
    await settle();

    clients[0]?.config.onWebSocketClose();
    await settle();

    expect(clients[0]?.deactivated).toBe(true);
    expect(clients).toHaveLength(2);
    expect(clients[1]?.config.brokerURL).toBeUndefined();
    expect(clients[1]?.config.webSocketFactory).toBeTypeOf('function');
    // Le repli ne se replie pas une seconde fois.
    clients[1]?.config.onWebSocketClose();
    await settle();
    expect(clients).toHaveLength(2);
  });

  it('keeps the WebSocket after a first connection, even if it closes', async () => {
    subscribeTopic('/topic/projects.30', () => {});
    await settle();

    clients[0]?.config.onConnect();
    clients[0]?.config.onWebSocketClose();
    await settle();

    expect(clients).toHaveLength(1);
    expect(clients[0]?.deactivated).toBe(false);
  });

  it('closes the connection when unsubscribed', async () => {
    const unsubscribe = subscribeTopic('/topic/projects.30', () => {});
    await settle();

    unsubscribe();

    expect(clients[0]?.deactivated).toBe(true);
  });

  it('opens nothing when unsubscribed before the connection starts', async () => {
    const unsubscribe = subscribeTopic('/topic/projects.30', () => {});
    unsubscribe();
    await settle();

    expect(clients.every((c) => c.deactivated)).toBe(true);
  });

  it('does nothing outside a browser', () => {
    vi.stubGlobal('window', undefined);
    try {
      const unsubscribe = subscribeTopic('/topic/projects.30', () => {});
      unsubscribe();
      expect(clients).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
