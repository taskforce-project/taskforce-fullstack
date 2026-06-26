"use client"

import { useEffect, useRef, useState } from "react"
import { Client, type IMessage } from "@stomp/stompjs"
import SockJS from "sockjs-client"
import { useMessageStore }       from "@/lib/store/message-store"
import type { ApiChatMessage }   from "@/lib/api/message-service"

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

function subscribeToChannel(
  client: Client,
  channelId: number,
  addMessage: (channelId: number, msg: ApiChatMessage) => void
) {
  client.subscribe(`/topic/channel.${channelId}`, (msg: IMessage) => {
    try {
      const payload = JSON.parse(msg.body) as ApiChatMessage
      addMessage(channelId, payload)
    } catch {
      // message non-JSON ignore
    }
  })
}

function scheduleSockJsFallback(
  client: Client,
  activateFallback: () => void,
  setLastError: (message: string) => void
) {
  setLastError("WebSocket natif indisponible, bascule sur SockJS")
  void client.deactivate().finally(activateFallback)
}

/**
 * Hook de connexion WebSocket STOMP.
 * Se connecte au broker RabbitMQ via Spring STOMP et s'abonne aux canaux actifs.
 *
 * @param channelIds — IDs des canaux auxquels s'abonner
 */
export function useStomp(channelIds: number[]) {
  const addMessage = useMessageStore((s) => s.addMessage)
  const clientRef  = useRef<Client | null>(null)
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>("idle")
  const [transport, setTransport] = useState<RealtimeTransport>("none")
  const [lastError, setLastError] = useState<string | null>(null)

  const idsKey = channelIds.slice().sort((a, b) => a - b).join(",")

  useEffect(() => {
    if (globalThis.window === undefined || channelIds.length === 0) {
      setConnectionState("idle")
      setTransport("none")
      setLastError(null)
      return
    }

    let disposed = false
    let fallbackTriggered = false
    let hasConnectedOnce = false
    const token  = globalThis.window === undefined ? null : localStorage.getItem("accessToken")
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api"
    const { wsUrl, sockJsUrl } = buildRealtimeUrls(apiUrl)

    const connectHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

    function activateClient(useSockJs: boolean) {
      if (disposed) return

      setConnectionState("connecting")
      setTransport(useSockJs ? "sockjs" : "websocket")

      const client = new Client({
        brokerURL: useSockJs ? undefined : wsUrl,
        webSocketFactory: useSockJs ? () => new SockJS(sockJsUrl) : undefined,
        connectHeaders,
        reconnectDelay: 5000,
        onConnect: () => {
          hasConnectedOnce = true
          setConnectionState("connected")
          setLastError(null)

          for (const id of channelIds) {
            subscribeToChannel(client, id, addMessage)
          }
        },
        onStompError: (frame) => {
          const brokerMessage = frame.headers.message ?? "Erreur STOMP"
          setLastError(brokerMessage)
          setConnectionState("error")
        },
        onWebSocketError: () => {
          setLastError(
            useSockJs
              ? "Connexion temps reel SockJS indisponible"
              : "Connexion WebSocket indisponible"
          )
        },
        onWebSocketClose: () => {
          if (!hasConnectedOnce && !useSockJs && !fallbackTriggered && !disposed) {
            fallbackTriggered = true
            scheduleSockJsFallback(client, () => activateClient(true), setLastError)
            return
          }

          if (!disposed) {
            setConnectionState("disconnected")
          }
        },
      })

      client.activate()
      clientRef.current = client
    }

    activateClient(false)

    return () => {
      disposed = true
      const currentClient = clientRef.current
      clientRef.current = null
      if (currentClient) {
        void currentClient.deactivate()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, addMessage])

  return {
    connectionState,
    transport,
    lastError,
  }
}
