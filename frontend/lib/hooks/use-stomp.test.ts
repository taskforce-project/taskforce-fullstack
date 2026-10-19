import { describe, expect, it, vi } from 'vitest';
import { buildRealtimeUrls } from './use-stomp';

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
