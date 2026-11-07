"use client"

import * as React from "react"
import { useParams, usePathname } from "next/navigation"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar"
import { TitleLine } from "@/components/layout/title-line"
import { Conversation } from "@/components/layout/conversation"
import { Pane } from "@/components/layout/pane"
import { PaneHandle } from "@/components/layout/pane-handle"
import { RightPanel } from "@/components/layout/right-panel"
import { AccountDeletionBanner } from "@/components/account/account-deletion-banner"
import { CommandBar } from "@/components/agent/command-bar"
import { CommandPalette } from "@/components/command-palette"
import { SettingsModal } from "@/components/settings/settings-modal"
import { CreateProjectModal } from "@/components/dialogs/create-project-modal"
import { ProductTour } from "@/components/tour/product-tour"
import { PendingInvitationsBanner } from "@/components/invitations/pending-invitations-banner"
import { DesktopUpdateToast } from "@/components/desktop/desktop-update-toast"
import { useElementWidth } from "@/hooks/use-element-width"
import { useMinWidth } from "@/hooks/use-min-width"
import { IS_DESKTOP } from "@/lib/desktop"
import { useMissionsSync } from "@/lib/hooks/use-missions-sync"
import { useNotificationsSync } from "@/lib/hooks/use-notifications-sync"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useWindowStore } from "@/lib/store/window-store"
import { cn } from "@/lib/utils"
import { paneOf } from "@/lib/window/pane"
import { paneSplit } from "@/lib/window/split"

/** `lg` : le volet tient à côté de la conversation. */
const SIDE_BY_SIDE = 1024
/** Sous cette largeur, ouvrir un volet replie la zone de droite (R122). */
const ROOMY = 1600

/**
 * Ce que la fenêtre montre, tenu à jour depuis le shell : l'espace de la conversation, ses projets et ses conversations
 * (la barre de gauche), l'état de l'IA (le compositeur, « Environment »), ce qui attend la personne (l'ancienne
 * cloche) et le travail des agents (l'ancien bouton d'AI Workflows).
 */
function useWindowData(slug: string) {
  const enterWorkspace = useCortexStore((s) => s.enterWorkspace)
  const loadConversations = useCortexStore((s) => s.loadConversations)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const fetchAiStatus = useAiStatusStore((s) => s.fetchStatus)

  React.useEffect(() => {
    if (!slug) return
    enterWorkspace(slug)
    void loadConversations(slug)
    void fetchProjects(slug)
  }, [slug, enterWorkspace, loadConversations, fetchProjects])
  React.useEffect(() => { void fetchAiStatus() }, [fetchAiStatus])
  useNotificationsSync(slug)
  useMissionsSync(slug)
}

/** Ctrl+K (⌘K) ouvre la recherche, depuis n'importe où dans la fenêtre. */
function useSearchShortcut() {
  const setSearchOpen = useWindowStore((s) => s.setSearchOpen)
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen(!useWindowStore.getState().searchOpen)
      }
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [setSearchOpen])
}

/**
 * La fenêtre (R119, séance n°18) : `[barre de gauche] [conversation] [volet] [zone de droite]`, sous une ligne de 44 px.
 * La conversation avec Cortex vit ici, la même d'un écran à l'autre ; le volet est la page de la route (`children`), à
 * côté d'elle, une poignée entre les deux ; l'accueil de l'espace n'a pas de volet, la conversation y est seule,
 * centrée. Quand la place manque pour les deux (en pleine largeur, sous `lg`, ou à moins de 480 px de volet et 360 px de
 * conversation), le volet prend toute la place et la conversation se replie dans son compositeur, en bas, d'où sa
 * réponse se déplie au-dessus (le motif du 02/11/2026).
 */
export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const route = paneOf(pathname)
  const wide = useMinWidth(SIDE_BY_SIDE)
  const roomy = useMinWidth(ROOMY)
  const paneFull = useWindowStore((s) => s.paneFull)
  const paneWidth = useWindowStore((s) => s.paneWidth)
  const setPaneWidth = useWindowStore((s) => s.setPaneWidth)
  const setRightOpen = useWindowStore((s) => s.setRightOpen)
  const searchOpen = useWindowStore((s) => s.searchOpen)
  const setSearchOpen = useWindowStore((s) => s.setSearchOpen)
  const setOpen = useCortexStore((s) => s.setOpen)
  const splitRef = React.useRef<HTMLDivElement>(null)
  const space = useElementWidth(splitRef)
  // Pendant le geste sur la poignée, la largeur suit le pointeur ; elle se retient à la fin.
  const [dragged, setDragged] = React.useState<number | null>(null)
  const split = paneSplit(space, dragged ?? paneWidth)

  useWindowData(slug)
  useSearchShortcut()

  // Le volet prend toute la largeur : la conversation se replie dans le compositeur.
  const folded = route !== null && (paneFull || !wide || split.narrow)
  // Dans sa colonne, la conversation est toujours dépliée ; repliée, elle attend la personne (Entrée, ou son bouton).
  React.useEffect(() => { setOpen(!folded) }, [folded, setOpen])
  // Sous 1 600 px, un volet qui s'ouvre replie la zone de droite ; un clic la rouvre, jusqu'au prochain volet.
  const crowded = route !== null && !roomy
  React.useEffect(() => { if (crowded) setRightOpen(false) }, [crowded, setRightOpen])

  // La conversation ne change pas avec la largeur du volet : elle ne se redessine pas pendant le geste sur la poignée.
  const conversation = React.useMemo(() => <Conversation />, [])

  return (
    <SidebarProvider className="h-full">
      {/* App desktop, façon Claude Desktop : le contenu est une carte arrondie dans le cadre de la barre de gauche. */}
      {IS_DESKTOP && <div className="desktop-top-drag" aria-hidden="true" />}
      {/* Mise à jour de l'app : avancement du téléchargement, puis « Restart now », dans un toast qui reste. */}
      {IS_DESKTOP && <DesktopUpdateToast />}
      <AppSidebar />
      <SidebarInset className={cn("overflow-hidden", IS_DESKTOP && "desktop-content md:border md:border-border/70")}>
        <TitleLine />
        {/* Invitations reçues en attente d'approbation : un seul fetch par session, persistante à la navigation. Ni
            l'une ni l'autre dans l'app desktop : pas d'invitations, et le compte se supprime en ligne. */}
        {!IS_DESKTOP && <PendingInvitationsBanner />}
        {/* Bandeau de restauration en haut, dans le flux : il pousse le contenu au lieu de le masquer. */}
        {!IS_DESKTOP && <AccountDeletionBanner />}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* La place de la conversation et du volet, mesurée : la zone de droite n'en fait pas partie. */}
          <div ref={splitRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {!folded && conversation}
            {route && !folded && (
              <PaneHandle
                width={split.width}
                max={split.max}
                onDrag={setDragged}
                onCommit={(width) => { setDragged(null); setPaneWidth(width) }}
                onReset={() => { setDragged(null); setPaneWidth(null) }}
              />
            )}
            {route ? (
              <Pane
                route={route}
                full={folded}
                wide={wide}
                width={folded ? null : split.width}
                composer={folded ? <CommandBar /> : undefined}
              >
                {children}
              </Pane>
            ) : (
              // L'accueil de l'espace ne rend rien : seule la conversation s'y montre. La page reste montée, cachée : son
              // layout choisit l'espace de la route.
              <div hidden>{children}</div>
            )}
          </div>
          <RightPanel />
        </div>
      </SidebarInset>

      {/* La recherche (Ctrl+K), hors de la barre de gauche : sur un téléphone, celle-ci est un tiroir qui se ferme. */}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      {/* Modals globaux, ouvrables depuis n'importe quel CTA */}
      <SettingsModal />
      <CreateProjectModal />

      {/* Tour produit (coach-marks), rendu conditionnel via son store ; cible les data-tour de la fenêtre */}
      <ProductTour />
    </SidebarProvider>
  )
}
