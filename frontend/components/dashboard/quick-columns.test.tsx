import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, render, screen, within } from "@testing-library/react"

import type { NotificationResponse } from "@/lib/api/notification-service"

vi.mock("@/lib/api/notification-service", () => ({
  listNotifications: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  acknowledge: vi.fn(),
  acknowledgeAll: vi.fn(),
}))
vi.mock("@/lib/api/dashboard-card-service", () => ({ listMyIssuesQuiet: vi.fn(() => Promise.resolve([])) }))
// La cloche s'abonne au temps réel (STOMP) : hors sujet ici.
vi.mock("@/lib/hooks/use-notifications-realtime", () => ({ useNotificationsRealtime: vi.fn() }))

import * as notificationService from "@/lib/api/notification-service"
import { QuickColumns } from "./quick-columns"
import { NotificationBell } from "@/components/layout/topbar/notification-bell"
import { useNotificationStore } from "@/lib/store/notification-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import type { Workspace } from "@/lib/api/workspace-service"

function notif(id: number, createdAt: string, urgency = "info"): NotificationResponse {
  return {
    id,
    type: "mention",
    urgency,
    read: false,
    acknowledged: false,
    actor: null,
    title: `Notification ${id}`,
    body: null,
    issueIdentifier: `TF-${id}`,
    issueUrl: `/acme/projects/1?issue=${id}`,
    projectName: "Proj",
    projectUrl: "/acme/projects/1",
    createdAt,
  }
}

const recentColumn = () => screen.getByText("Recent").closest("[data-slot='card']") as HTMLElement

/**
 * Colonne « Recent » du dashboard : elle lit la liste de la cloche du topbar au lieu de la recharger.
 * Avant, `/notifications` partait deux fois à chaque arrivée sur le dashboard (cloche + colonne).
 */
describe("QuickColumns - colonne Recent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNotificationStore.setState({
      signals: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      lastSyncAt: null,
      slug: null,
      fetchedAt: null,
    })
  })

  it("montée avec la cloche, un seul appel pour les deux", async () => {
    vi.mocked(notificationService.listNotifications).mockResolvedValue([notif(1, "2026-10-18T21:41:00")])
    useWorkspaceStore.setState({ activeWorkspace: { slug: "acme" } as Workspace })

    await act(async () => {
      render(
        <>
          <NotificationBell />
          <QuickColumns slug="acme" />
        </>,
      )
    })

    expect(notificationService.listNotifications).toHaveBeenCalledTimes(1)
    expect(within(recentColumn()).getByText("Notification 1")).toBeInTheDocument()
  })

  it("affiche les 5 plus récentes de la liste partagée, sans nouvel appel", async () => {
    const list = [
      notif(1, "2026-10-18T08:00:00", "critical"),
      notif(2, "2026-10-18T09:00:00"),
      notif(3, "2026-10-18T10:00:00", "warning"),
      notif(4, "2026-10-18T11:00:00"),
      notif(5, "2026-10-18T12:00:00", "low"),
      notif(6, "2026-10-18T13:00:00"),
    ]
    vi.mocked(notificationService.listNotifications).mockResolvedValue(list)
    await act(async () => {
      await useNotificationStore.getState().fetchNotifications("acme")
    })
    vi.mocked(notificationService.listNotifications).mockClear()

    await act(async () => {
      render(<QuickColumns slug="acme" />)
    })

    expect(notificationService.listNotifications).not.toHaveBeenCalled()
    const titles = within(recentColumn())
      .getAllByText(/^Notification \d$/)
      .map((el) => el.textContent)
    expect(titles).toEqual(["Notification 6", "Notification 5", "Notification 4", "Notification 3", "Notification 2"])
  })

  it("dit que les notifications sont indisponibles si le chargement échoue", async () => {
    vi.mocked(notificationService.listNotifications).mockRejectedValue(new Error("boom"))

    await act(async () => {
      render(<QuickColumns slug="acme" />)
    })

    expect(within(recentColumn()).getByText("Notifications unavailable right now")).toBeInTheDocument()
  })

  it("n'affiche jamais la liste d'un autre workspace", async () => {
    vi.mocked(notificationService.listNotifications).mockResolvedValue([notif(9, "2026-10-18T21:41:00")])
    await act(async () => {
      await useNotificationStore.getState().fetchNotifications("beta")
    })
    vi.mocked(notificationService.listNotifications).mockReturnValue(new Promise<NotificationResponse[]>(() => {}))

    await act(async () => {
      render(<QuickColumns slug="acme" />)
    })

    expect(notificationService.listNotifications).toHaveBeenLastCalledWith("acme")
    expect(within(recentColumn()).queryByText("Notification 9")).not.toBeInTheDocument()
  })
})
