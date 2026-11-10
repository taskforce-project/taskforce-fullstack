"use client"

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import { useParams, usePathname } from "next/navigation"
import { ArrowLeft, Maximize2, Minimize2, X } from "lucide-react"

import { IssuePane } from "@/components/layout/issue-pane"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useWindowStore } from "@/lib/store/window-store"
import { cn } from "@/lib/utils"
import { screenUnder, type IssueTarget } from "@/lib/window/address"
import { paneTitle, type PaneRoute } from "@/lib/window/pane"

const ICON_BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"

/** À côté de la conversation, avant toute mesure : la moitié de la place à droite de la barre de gauche, 480 px au moins. */
const BESIDE: CSSProperties = { flex: "0 1 max(480px, 50%)" }

/**
 * Le volet de la fenêtre (R119, R120) : la page de la route, entière, avec tous ses gestes, à côté de la conversation.
 * Son en-tête porte son titre, la pleine largeur et la fermeture, qui mène à l'accueil de l'espace ; sur un écran étroit,
 * il couvre la conversation et une flèche y ramène. Une issue s'y ouvre par-dessus l'écran qui la liste (`?issue=`),
 * avec son retour : l'écran reste monté dessous, caché, et se retrouve tel qu'il était. En pleine largeur (ou sous
 * `lg`), la conversation se replie dans son compositeur, en bas du volet.
 */
export function Pane({ route, full, wide, width, issue, children, composer }: Readonly<{
  route: PaneRoute
  /** Le volet prend toute la largeur : la personne l'a voulu, ou la fenêtre est étroite. */
  full: boolean
  /** La fenêtre peut montrer le volet à côté de la conversation (`lg`) : le bouton de la pleine largeur s'y montre. */
  wide: boolean
  /** À côté de la conversation, la largeur réglée à la poignée (px) ; sans mesure, la moitié de la place. */
  width?: number | null
  /** L'issue que l'adresse ouvre par-dessus l'écran du volet. */
  issue?: IssueTarget | null
  children: ReactNode
  /** La conversation repliée dans son compositeur, en bas du volet. */
  composer?: ReactNode
}>) {
  const params = useParams()
  const pathname = usePathname()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.window)
  const projects = useProjectStore((s) => s.projects)
  const paneFull = useWindowStore((s) => s.paneFull)
  const togglePaneFull = useWindowStore((s) => s.togglePaneFull)
  const { closeIssue, closePane } = usePaneNavigation()
  const contentRef = useRef<HTMLDivElement>(null)
  const title = paneTitle(route, projects, t.screens)
  const fullLabel = paneFull ? t.sideBySide : t.fullWidth
  const under = screenUnder(pathname)
  const underLabel = (t.under as Readonly<Record<string, string>>)[under] ?? title
  const covered = issue !== null && issue !== undefined

  // Un autre écran s'ouvre en haut, sans animation : le volet reste, sa page change. Une issue qui s'ouvre ou se ferme
  // ne change pas le chemin : l'écran d'en dessous garde son défilement.
  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0 })
  }, [pathname])

  const actions = (
    <>
      {wide && (
        <button
          type="button"
          onClick={togglePaneFull}
          aria-pressed={paneFull}
          aria-label={fullLabel}
          title={fullLabel}
          className={ICON_BUTTON}
        >
          {paneFull ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      )}
      {wide && (
        <button type="button" onClick={closePane} aria-label={t.closePane} title={t.closePane} className={ICON_BUTTON}>
          <X className="size-4" />
        </button>
      )}
    </>
  )

  return (
    <section
      aria-label={title}
      data-width={full ? "full" : "beside"}
      className="relative flex min-h-0 min-w-0 flex-col"
      style={full ? { flex: "1 1 0%" } : width ? { flex: `0 0 ${width}px` } : BESIDE}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className={cn("flex h-10 shrink-0 items-center gap-1 border-b border-border pr-2", wide ? "pl-4" : "pl-2", covered && "invisible")}
          aria-hidden={covered || undefined}
          inert={covered}
        >
          {/* Sur un écran étroit, le volet couvre la conversation : la flèche y ramène. */}
          {!wide && (
            <button
              type="button"
              onClick={closePane}
              aria-label={t.backToConversation}
              title={t.backToConversation}
              className={ICON_BUTTON}
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <h2 className="min-w-0 flex-1 truncate px-1 text-[13px] font-medium text-foreground">{title}</h2>
          {!covered && actions}
        </div>
        <div
          ref={contentRef}
          className={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8", covered && "invisible")}
          aria-hidden={covered || undefined}
          inert={covered}
        >
          {children}
        </div>
        {covered && (
          <div className="absolute inset-0 z-10 flex min-h-0 flex-col bg-background">
            <IssuePane slug={slug} target={issue} under={underLabel} actions={actions} onBack={closeIssue} />
          </div>
        )}
      </div>
      {composer}
    </section>
  )
}
