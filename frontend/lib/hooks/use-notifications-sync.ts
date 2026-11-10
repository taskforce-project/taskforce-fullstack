"use client"

import { useEffect } from "react"

import { useNotificationsRealtime } from "@/lib/hooks/use-notifications-realtime"
import { useNotificationStore } from "@/lib/store/notification-store"

/** Le filet de sécurité quand le temps réel (STOMP) ne passe pas. */
const POLL_MS = 60_000

/**
 * Ce que la cloche tenait (QA2-11), pour « Waiting for you » (R121) : la liste au montage, partagée avec la colonne
 * « Recent » du tableau de bord (une seule requête pour les deux), le temps réel, et une relecture toutes les 60 s.
 */
export function useNotificationsSync(slug: string | null | undefined): void {
  const ensureNotifications = useNotificationStore((s) => s.ensureNotifications)
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications)

  useNotificationsRealtime(slug ?? undefined)

  useEffect(() => {
    if (slug) void ensureNotifications(slug)
  }, [slug, ensureNotifications])

  useEffect(() => {
    if (!slug) return
    const id = setInterval(() => void fetchNotifications(slug), POLL_MS)
    return () => clearInterval(id)
  }, [slug, fetchNotifications])
}
