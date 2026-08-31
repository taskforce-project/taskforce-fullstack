"use client"

import { useEffect, useRef } from "react"
import { Client, type IMessage } from "@stomp/stompjs"
import { toast } from "sonner"

import { buildRealtimeUrls } from "@/lib/hooks/use-stomp"
import { useNotificationStore } from "@/lib/store/notification-store"
import { useUserStore } from "@/lib/store/user-store"
import type { NotificationResponse } from "@/lib/api/notification-service"

/**
 * Abonne l'utilisateur connecté à ses notifications en temps réel (US-023).
 * Le backend publie sur `/topic/notifications.{recipientId}` (NotificationService) ;
 * on prepend la notification au store (dédup par id, incrément du compteur non-lu).
 *
 * @param slug - slug du workspace actif (réutilisé pour cohérence avec le board) ; sert
 *               surtout de garde : on ne s'abonne que dans un workspace.
 */
export function useNotificationsRealtime(slug: string | undefined) {
  const userId = useUserStore((s) => s.user?.id)
  const pushSignal = useNotificationStore((s) => s.pushSignal)
  const clientRef = useRef<Client | null>(null)

  useEffect(() => {
    if (globalThis.window === undefined || !slug || !userId) return

    let disposed = false
    let fallbackTriggered = false
    let connectedOnce = false
    const token = localStorage.getItem("accessToken")
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api"
    const { wsUrl, sockJsUrl } = buildRealtimeUrls(apiUrl)
    const connectHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

    function handle(msg: IMessage) {
      try {
        const notification = JSON.parse(msg.body) as NotificationResponse
        pushSignal(notification)
        // Toast « live » : la notif in-app se voit à l'instant (pas seulement le badge de la cloche).
        // On ne reçoit ici QUE les événements dont le canal in-app est activé (gating côté back) -
        // donc pas besoin de re-vérifier la préférence, et pas de spam.
        const opts = { description: notification.body ?? undefined }
        if (notification.urgency === "critical") toast.error(notification.title, opts)
        else if (notification.urgency === "warning") toast.warning(notification.title, opts)
        else toast(notification.title, opts)
      } catch {
        // message non-JSON ignoré
      }
    }

    async function activate(useSockJs: boolean) {
      if (disposed) return
      // Fallback chargé À LA DEMANDE : sur le chemin nominal (WS natif), SockJS n'est jamais importé,
      // donc son écouteur `unload` - déprécié (audit Lighthouse best-practices) - n'est pas enregistré
      // et il ne pèse pas sur le bundle initial. Le repli reste identique si le WS natif échoue.
      const SockJS = useSockJs ? (await import("sockjs-client")).default : null
      if (disposed) return
      const client = new Client({
        brokerURL: useSockJs ? undefined : wsUrl,
        webSocketFactory: SockJS ? () => new SockJS(sockJsUrl) : undefined,
        connectHeaders,
        reconnectDelay: 5000,
        onConnect: () => {
          connectedOnce = true
          client.subscribe(`/topic/notifications.${userId}`, handle)
        },
        onWebSocketClose: () => {
          if (!connectedOnce && !useSockJs && !fallbackTriggered && !disposed) {
            fallbackTriggered = true
            void client.deactivate().finally(() => void activate(true))
          }
        },
      })
      client.activate()
      clientRef.current = client
    }

    void activate(false)

    return () => {
      disposed = true
      const current = clientRef.current
      clientRef.current = null
      if (current) void current.deactivate()
    }
  }, [slug, userId, pushSignal])
}
