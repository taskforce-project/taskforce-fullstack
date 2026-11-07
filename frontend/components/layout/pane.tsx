"use client"

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import { useParams, usePathname, useRouter } from "next/navigation"
import { Maximize2, Minimize2, X } from "lucide-react"

import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useWindowStore } from "@/lib/store/window-store"
import { cn } from "@/lib/utils"
import { homePath, paneTitle, type PaneRoute } from "@/lib/window/pane"

const ICON_BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"

/** À côté de la conversation, le volet prend la moitié de la place à droite de la barre de gauche, 480 px au moins. */
const BESIDE: CSSProperties = { flex: "0 1 max(480px, 50%)" }

/**
 * Le volet de la fenêtre (R119, R120) : la page de la route, entière, avec tous ses gestes, à côté de la conversation.
 * Son en-tête porte son titre, la pleine largeur et la fermeture, qui mène à l'accueil de l'espace. En pleine largeur
 * (ou sous `lg`), la conversation se replie dans son compositeur, en bas du volet. L'emplacement reste générique : la
 * page de la route aujourd'hui, d'autres vues ensuite.
 */
export function Pane({ route, full, wide, children, composer }: Readonly<{
  route: PaneRoute
  /** Le volet prend toute la largeur : la personne l'a voulu, ou la fenêtre est étroite. */
  full: boolean
  /** La fenêtre peut montrer le volet à côté de la conversation (`lg`) : le bouton de la pleine largeur s'y montre. */
  wide: boolean
  children: ReactNode
  /** La conversation repliée dans son compositeur, en bas du volet. */
  composer?: ReactNode
}>) {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.window)
  const projects = useProjectStore((s) => s.projects)
  const paneFull = useWindowStore((s) => s.paneFull)
  const togglePaneFull = useWindowStore((s) => s.togglePaneFull)
  const contentRef = useRef<HTMLDivElement>(null)
  const title = paneTitle(route, projects, t.screens)
  const fullLabel = paneFull ? t.sideBySide : t.fullWidth

  // Un autre écran s'ouvre en haut, sans animation : le volet reste, sa page change.
  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0 })
  }, [pathname])

  return (
    <section
      aria-label={title}
      data-width={full ? "full" : "beside"}
      className={cn("relative flex min-h-0 min-w-0 flex-col", full ? "flex-1" : "border-l border-border")}
      style={full ? undefined : BESIDE}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border pl-4 pr-2">
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{title}</h2>
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
        <button
          type="button"
          onClick={() => router.push(homePath(slug))}
          aria-label={t.closePane}
          title={t.closePane}
          className={ICON_BUTTON}
        >
          <X className="size-4" />
        </button>
      </div>
      <div ref={contentRef} className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8">
        {children}
      </div>
      {composer}
    </section>
  )
}
