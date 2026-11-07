"use client"

import { useEffect, useMemo } from "react"
import { useParams, usePathname } from "next/navigation"
import { Activity, LayoutGrid, PanelRight } from "lucide-react"
import { useTheme } from "next-themes"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { useMinWidth } from "@/hooks/use-min-width"
import { fillText } from "@/lib/delivery/result-card"
import { desktopBridge, IS_DESKTOP } from "@/lib/desktop"
import { useDesktopNavigation } from "@/lib/hooks/use-desktop-navigation"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useUserStore } from "@/lib/store/user-store"
import { useWindowStore } from "@/lib/store/window-store"
import { cn } from "@/lib/utils"
import { missionOf } from "@/lib/window/address"
import { changesOf } from "@/lib/window/changes"
import { projectInView } from "@/lib/window/environment"
import { conversationMission, runLabel } from "@/lib/window/missions"
import { boardPath } from "@/lib/window/pane"

/** Le haut de la fenêtre de l'app desktop : la marge de 8 px au-dessus du contenu arrondi, puis cette ligne de 44 px. */
export const DESKTOP_TITLE_BAR_HEIGHT = 52

const ICON_BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"

const TEXT_BUTTON =
  "flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"

/**
 * La ligne du haut de la fenêtre (R119, séance n°18), 44 px, à la place de la barre du haut. À gauche, le bouton de la
 * barre de gauche (Ctrl+B), puis le titre de la conversation. À droite, « Board » quand un projet est en vue (celui du
 * volet, sinon celui de la conversation) et que son tableau n'est pas déjà le volet ; « Work view » quand une mission
 * lancée depuis cette conversation tourne ; puis le bouton de la zone de droite, un tiroir sous `lg`. Dans l'app
 * desktop, c'est la zone qu'on saisit pour déplacer la fenêtre ; ses boutons restent cliquables, et les boutons de
 * Windows se posent après eux.
 */
export function TitleLine() {
  const pathname = usePathname()
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.window)
  const untitled = usePreferencesStore((s) => s.t.shell.chatNew)
  const { resolvedTheme } = useTheme()
  const wide = useMinWidth(1024)
  const conversations = useCortexStore((s) => s.conversations)
  const conversationId = useCortexStore((s) => s.conversationId)
  const turns = useCortexStore((s) => s.turns)
  const done = useCortexStore((s) => s.done)
  const runs = useDeliveryStore((s) => s.workspaceRuns)
  const me = useUserStore((s) => s.user?.id)
  const projects = useProjectStore((s) => s.projects)
  const rightOpen = useWindowStore((s) => s.rightOpen)
  const rightDrawer = useWindowStore((s) => s.rightDrawer)
  const toggleRight = useWindowStore((s) => s.toggleRight)
  const setRightDrawer = useWindowStore((s) => s.setRightDrawer)
  const { openBoard, openMission } = usePaneNavigation()

  // App desktop : les boutons du système aux couleurs du thème, sur la hauteur de cette ligne.
  useEffect(() => {
    desktopBridge()?.setTitleBarTheme?.(resolvedTheme === "dark", DESKTOP_TITLE_BAR_HEIGHT)
  }, [resolvedTheme])
  // Clic sur une notification du système : la coque demande la page de l'événement.
  useDesktopNavigation()

  const conversation = conversations.find((c) => c.id === conversationId)
  const project = projectInView(pathname, conversation, projects)
  const board = project && slug ? boardPath(slug, project.id) : null
  // La mission que cette conversation a lancée et qui tourne : sa vue du travail, sauf si elle est déjà le volet.
  const mission = useMemo(() => conversationMission(changesOf(turns, done), runs, me), [turns, done, runs, me])
  const showMission = mission !== null && missionOf(pathname) !== mission.id
  const panelOpen = wide ? rightOpen : rightDrawer

  return (
    <header
      className={cn("flex h-11 shrink-0 items-center gap-1 border-b border-border px-2", IS_DESKTOP && "desktop-titlebar")}
    >
      <SidebarTrigger aria-label={t.toggleLeftBar} title={t.toggleLeftBar} className="text-muted-foreground" />
      <span className="min-w-0 truncate px-1 text-[13px] font-medium text-foreground">
        {conversation?.title ?? untitled}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {project && board && pathname !== board && (
          <button
            type="button"
            onClick={() => openBoard(project.id)}
            title={fillText(t.boardOf, { project: project.name })}
            className={TEXT_BUTTON}
          >
            <LayoutGrid className="size-4" />
            {t.board}
          </button>
        )}
        {showMission && (
          <button
            type="button"
            onClick={() => openMission(mission.id)}
            title={fillText(t.workViewOf, { mission: runLabel(mission) })}
            className={TEXT_BUTTON}
          >
            <Activity className="size-4" />
            {t.workView}
          </button>
        )}
        <button
          type="button"
          onClick={() => (wide ? toggleRight() : setRightDrawer(!rightDrawer))}
          aria-pressed={panelOpen}
          aria-label={t.toggleRightPanel}
          title={t.toggleRightPanel}
          className={cn(ICON_BUTTON, panelOpen && "text-foreground")}
        >
          <PanelRight className="size-4" />
        </button>
      </div>
    </header>
  )
}
