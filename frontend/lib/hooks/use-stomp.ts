"use client"

/**
 * Utilitaire temps réel : construit les URLs WebSocket/SockJS du broker STOMP à partir de l'URL API.
 * Consommé par `use-notifications-realtime` et `use-project-realtime`, qui portent chacun leur propre
 * client STOMP et leur repli SockJS. Le dock « Workflows IA » n'est PAS abonné : il poll (`IA-DEC-004`).
 */
export type RealtimeConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error"
export type RealtimeTransport = "none" | "websocket" | "sockjs"

export function buildRealtimeUrls(apiUrl: string): { wsUrl: string; sockJsUrl: string } {
  // API sur la même origine que l'interface (app desktop, `API_URL` vide) : on part de l'adresse de la page.
  const normalizedApiUrl = (apiUrl || globalThis.location?.origin || "").replace(/\/$/, "")
  const baseUrl = normalizedApiUrl.replace(/\/api\/?$/, "")

  return {
    wsUrl: `${baseUrl.replace(/^http/, "ws")}/ws`,
    sockJsUrl: `${baseUrl}/ws-sockjs`,
  }
}
