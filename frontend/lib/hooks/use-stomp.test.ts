import { describe, expect, it } from 'vitest';
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
});
