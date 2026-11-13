"use client"

import { Client, type IMessage } from "@stomp/stompjs"

import { getSessionToken } from "@/lib/api/session-token"
import { API_URL } from "@/lib/config/urls"

/**
 * Utilitaire temps réel : construit les URLs WebSocket/SockJS du broker STOMP à partir de l'URL API.
 * Consommé par `use-notifications-realtime` et `use-project-realtime`, qui portent chacun leur propre
 * client STOMP et leur repli SockJS, par `use-issue-realtime` (fiche d'une issue ouverte) au travers de
 * `subscribeTopic`, et par `use-project-live` (les missions et les analyses d'un projet, R166) au travers de
 * `subscribeTopics`. Le dock « Workflows IA » reste à son polling (`IA-DEC-004`).
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

/**
 * Abonne `topic` au broker STOMP et passe le corps de chaque message à `onMessage`. WebSocket natif d'abord ; s'il ne
 * s'ouvre jamais, repli SockJS, chargé à la demande comme dans les autres abonnements. Rend de quoi fermer la
 * connexion. Hors du navigateur, rien.
 */
export function subscribeTopic(topic: string, onMessage: (body: string) => void): () => void {
  return subscribeTopics({ [topic]: onMessage })
}

/**
 * Abonne plusieurs topics sur une seule connexion (le projet ouvert : ses missions et ses analyses), chacun avec son
 * traitement. `onConnect` est appelé à chaque connexion, la première et celles qui suivent une coupure : les messages
 * publiés pendant la coupure sont perdus, l'appelant relit ce qu'il montre. Rend de quoi fermer la connexion.
 */
export function subscribeTopics(
  handlers: Readonly<Record<string, (body: string) => void>>,
  onConnect?: () => void,
): () => void {
  if (globalThis.window === undefined) return () => {}

  let disposed = false
  let fallbackTriggered = false
  let connectedOnce = false
  let current: Client | null = null
  const token = getSessionToken()
  const { wsUrl, sockJsUrl } = buildRealtimeUrls(API_URL)
  const connectHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

  async function activate(useSockJs: boolean) {
    if (disposed) return
    const SockJS = useSockJs ? (await import("sockjs-client")).default : null
    if (disposed) return
    const client = new Client({
      brokerURL: useSockJs ? undefined : wsUrl,
      webSocketFactory: SockJS ? () => new SockJS(sockJsUrl) : undefined,
      connectHeaders,
      reconnectDelay: 5000,
      onConnect: () => {
        connectedOnce = true
        for (const [topic, onMessage] of Object.entries(handlers)) {
          client.subscribe(topic, (msg: IMessage) => onMessage(msg.body))
        }
        onConnect?.()
      },
      onWebSocketClose: () => {
        if (!connectedOnce && !useSockJs && !fallbackTriggered && !disposed) {
          fallbackTriggered = true
          void client.deactivate().finally(() => void activate(true))
        }
      },
    })
    client.activate()
    current = client
  }

  void activate(false)

  return () => {
    disposed = true
    const client = current
    current = null
    if (client) void client.deactivate()
  }
}
