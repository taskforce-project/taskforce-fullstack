"use client"

/**
 * Utilitaire temps réel : construit les URLs WebSocket/SockJS du broker STOMP à partir de l'URL API.
 * Consommé par `use-notifications-realtime` et `use-project-realtime`, qui portent chacun leur propre
 * client STOMP et leur repli SockJS. Le dock « Workflows IA » n'est PAS abonné : il poll (`IA-DEC-004`).
 */
export type RealtimeConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error"
export type RealtimeTransport = "none" | "websocket" | "sockjs"

export function buildRealtimeUrls(apiUrl: string): { wsUrl: string; sockJsUrl: string } {
  const normalizedApiUrl = apiUrl.replace(/\/$/, "")
  const baseUrl = normalizedApiUrl.replace(/\/api\/?$/, "")

  return {
    wsUrl: `${baseUrl.replace(/^http/, "ws")}/ws`,
    sockJsUrl: `${baseUrl}/ws-sockjs`,
  }
}
