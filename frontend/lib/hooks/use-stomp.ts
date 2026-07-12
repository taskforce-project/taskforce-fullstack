"use client"

/**
 * Utilitaire temps réel : construit les URLs WebSocket/SockJS du broker STOMP à partir de l'URL API.
 * Consommé par les hooks realtime conservés (notifications, issues, workflows IA).
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
