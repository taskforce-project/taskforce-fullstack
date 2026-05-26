"use client"

import { useEffect, useRef } from "react"
import { Client, type IMessage } from "@stomp/stompjs"
import { useMessageStore }       from "@/lib/store/message-store"
import type { ApiChatMessage }   from "@/lib/api/message-service"

/**
 * Hook de connexion WebSocket STOMP.
 * Se connecte au broker RabbitMQ via Spring STOMP et s'abonne aux canaux actifs.
 *
 * @param channelIds — IDs des canaux auxquels s'abonner
 */
export function useStomp(channelIds: number[]) {
  const addMessage = useMessageStore((s) => s.addMessage)
  const clientRef  = useRef<Client | null>(null)

  const idsKey = channelIds.slice().sort((a, b) => a - b).join(",")

  useEffect(() => {
    if (globalThis.window === undefined || channelIds.length === 0) return

    const token  = globalThis.window === undefined ? null : localStorage.getItem("accessToken")
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api"
    // Dériver l'URL WebSocket depuis l'URL API (http→ws, retirer /api)
    const wsUrl  = apiUrl.replace(/^http/, "ws").replace(/\/api\/?$/, "/ws")

    const client = new Client({
      brokerURL:      wsUrl,
      connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      reconnectDelay: 5000,
      onConnect: () => {
        for (const id of channelIds) {
          client.subscribe(`/topic/channel.${id}`, (msg: IMessage) => {
            try {
              const payload = JSON.parse(msg.body) as ApiChatMessage
              addMessage(id, payload)
            } catch {
              // message non-JSON ignore
            }
          })
        }
      },
    })

    client.activate()
    clientRef.current = client

    return () => {
      client.deactivate()
      clientRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, addMessage])
}
