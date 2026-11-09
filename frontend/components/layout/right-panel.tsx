"use client"

import { useEffect } from "react"
import { useParams, usePathname } from "next/navigation"

import { catalogForThisApp } from "@/components/integrations/integrations-catalog"
import { PANEL_ITEM, PanelRow } from "@/components/layout/panel-row"
import { ChangesRow, MissionsRow } from "@/components/layout/work-rows"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useMinWidth } from "@/hooks/use-min-width"
import { toneOf } from "@/lib/cortex/context-gauge"
import { screenFrom } from "@/lib/cortex/screen"
import { fillText } from "@/lib/delivery/result-card"
import { IS_DESKTOP } from "@/lib/desktop"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useDesktopToolsStore } from "@/lib/store/desktop-tools-store"
import { useIntegrationStore } from "@/lib/store/integration-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useScreenStore } from "@/lib/store/screen-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useWindowStore } from "@/lib/store/window-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { cn } from "@/lib/utils"
import { connectorLines, connectorsSummary } from "@/lib/window/connectors"
import { contextRaw, contextRead, contextRoom, contextSees, windowShare } from "@/lib/window/context"
import { cortexModel, modelPlace, projectInView } from "@/lib/window/environment"

/** La conversation en cours, telle que la liste de l'espace la résume (son projet compris). */
function useConversation() {
  const conversations = useCortexStore((s) => s.conversations)
  const conversationId = useCortexStore((s) => s.conversationId)
  return conversations.find((c) => c.id === conversationId)
}

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** Environment : d'un regard, où Cortex travaille et où tourne son modèle ; le détail ne répète ni l'un ni l'autre. */
function EnvironmentRow() {
  const pathname = usePathname()
  const w = usePreferencesStore((s) => s.t.window)
  const t = usePreferencesStore((s) => s.t.rail)
  const workspace = useWorkspaceStore((s) => s.activeWorkspace)
  const projects = useProjectStore((s) => s.projects)
  const status = useAiStatusStore((s) => s.status)
  const conversation = useConversation()
  const project = projectInView(pathname, conversation, projects)
  const how = t.places[modelPlace(status, IS_DESKTOP)]
  const where = project?.name ?? workspace?.name
  const model = cortexModel(status)
  const details = [
    project && workspace ? { label: w.workspace, value: workspace.name } : null,
    project?.repoFullName ? { label: w.repository, value: project.repoFullName } : null,
    model ? { label: w.model, value: model } : null,
  ].filter((line) => line !== null)

  return (
    <PanelRow row="environment" summary={where ? fillText(t.where, { where, how }) : capitalized(how)}>
      {details.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-2 py-0.5 text-xs">
          {details.map((line) => (
            <div key={line.label} className="contents">
              <dt className="text-muted-foreground">{line.label}</dt>
              <dd className="truncate text-foreground" title={line.value}>{line.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </PanelRow>
  )
}

const FILL = { blue: "bg-primary", amber: "bg-shape-yellow", rose: "bg-shape-red" } as const

/**
 * Context : d'un regard, ce que Cortex voit (le volet, l'issue ouverte, R114) et, à droite, la place prise ; un clic plus
 * loin, ce que ce chiffre veut dire et ce que la dernière réponse a lu.
 */
function ContextRow() {
  const pathname = usePathname()
  const w = usePreferencesStore((s) => s.t.window)
  const t = usePreferencesStore((s) => s.t.rail.context)
  const openIssue = useScreenStore((s) => s.openIssue)
  const projects = useProjectStore((s) => s.projects)
  const issues = useIssueStore((s) => s.issues)
  const activeIssue = useIssueStore((s) => s.activeIssue)
  // La jauge de contexte (R122, sous le compositeur) : le prompt de la dernière demande contre sa fenêtre.
  const context = useCortexStore((s) => s.context)
  const lastRead = useCortexStore((s) => s.turns.findLast((turn) => turn.answer)?.answer?.read)
  const status = useAiStatusStore((s) => s.status)

  const screen = screenFrom(pathname, openIssue)
  const project = screen ? projects.find((p) => p.id === screen.projectId) : undefined
  const issueId = screen?.issueId ?? null
  const issue = issueId === null ? undefined : [activeIssue, ...issues].find((i) => i?.id === issueId)
  const sees = contextSees(
    { project: screen ? (project?.name ?? w.project) : null, issue: issueId === null ? null : (issue?.identifier ?? `#${issueId}`) },
    t,
  )
  const share = windowShare(context)
  const room = contextRoom(context, cortexModel(status), t)
  const read = contextRead(lastRead, t)

  return (
    <PanelRow row="context" summary={sees} value={share !== null ? `${share}%` : undefined}>
      <div className="flex flex-col gap-1.5 px-2 py-0.5 text-xs">
        {share !== null && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className={cn("h-full rounded-full", FILL[toneOf(share)])} style={{ width: `${share}%` }} />
          </div>
        )}
        <p className="leading-relaxed text-foreground" title={contextRaw(context)}>{room}</p>
        {read && <p className="leading-relaxed text-muted-foreground">{read}</p>}
      </div>
    </PanelRow>
  )
}

/** Connectors : d'un regard, ceux à reconnecter d'abord, sinon ce qui est branché ; un clic mène aux réglages. */
function ConnectorsRow() {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.rail.connectors)
  const integrationTexts = usePreferencesStore((s) => s.t.integrations)
  const connectors = useIntegrationStore((s) => s.connectors)
  const fetchConnectors = useIntegrationStore((s) => s.fetchConnectors)
  const desktopGitHub = useDesktopToolsStore((s) => s.status?.github ?? null)
  const refreshDesktopTools = useDesktopToolsStore((s) => s.refresh)
  const openSettings = useSettingsStore((s) => s.openSettings)

  useEffect(() => {
    if (slug) void fetchConnectors(slug)
  }, [slug, fetchConnectors])
  // App desktop : GitHub est connecté quand le GitHub CLI de la personne l'est, comme dans le catalogue.
  useEffect(() => {
    if (IS_DESKTOP && useDesktopToolsStore.getState().status === null) void refreshDesktopTools()
  }, [refreshDesktopTools])

  const catalog = connectors ? catalogForThisApp(connectors.catalog, integrationTexts, IS_DESKTOP, desktopGitHub) : null
  const lines = catalog && connectors ? connectorLines(catalog, connectors.servers) : []
  const settings = () => openSettings("integrations")

  // Le temps du chargement, la hauteur de la phrase reste réservée : les cartes du dessous ne sautent pas.
  return (
    <PanelRow row="connectors" summary={catalog ? connectorsSummary(lines, t) : " "}>
      {catalog && (
        lines.length === 0 ? (
          <button type="button" onClick={settings} className={cn(PANEL_ITEM, "text-muted-foreground")}>
            {t.connect}
          </button>
        ) : (
          <ul className="flex flex-col">
            {lines.map((line) => (
              <li key={line.key}>
                <button type="button" onClick={settings} className={PANEL_ITEM}>
                  <span className="min-w-0 flex-1 truncate text-foreground">{line.name}</span>
                  {line.reconnect && <span className="text-ink-yellow">{t.reconnect}</span>}
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </PanelRow>
  )
}

function Rows() {
  return (
    <div className="flex flex-col gap-2 p-2">
      <EnvironmentRow />
      <ContextRow />
      <ConnectorsRow />
      <MissionsRow />
      <ChangesRow />
    </div>
  )
}

/**
 * La zone de droite de la fenêtre (R122, R141) : ce qui entoure la conversation, en cartes, à la manière du rail d'une
 * session de Claude. Où Cortex travaille, ce qu'il voit, ce qui est branché, puis le travail de fond et ce que la
 * conversation a changé, qui n'apparaissent que quand ils existent : ils s'ajoutent en bas, rien ne saute. 320 px ; elle
 * s'ouvre et se replie depuis la ligne du haut, et se replie seule quand un volet s'ouvre sous 1 600 px de large. Elle ne
 * montre que le travail de la personne, chaque ligne menant à son objet (R57). Sous `lg`, c'est un tiroir, qui s'ouvre
 * depuis le même bouton et se ferme au choix d'une ligne.
 */
export function RightPanel() {
  const wide = useMinWidth(1024)
  const open = useWindowStore((s) => s.rightOpen)
  const drawer = useWindowStore((s) => s.rightDrawer)
  const setDrawer = useWindowStore((s) => s.setRightDrawer)
  const label = usePreferencesStore((s) => s.t.window.rightPanel)

  if (!wide) {
    return (
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="right" className="w-80 gap-0 p-0 sm:max-w-80">
          <SheetTitle className="sr-only">{label}</SheetTitle>
          <SheetDescription className="sr-only">{label}</SheetDescription>
          {/* Un lien choisi ouvre son volet, qui couvre l'écran : le tiroir se ferme. */}
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-11"
            onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setDrawer(false) }}
          >
            <Rows />
          </div>
        </SheetContent>
      </Sheet>
    )
  }
  if (!open) return null
  return (
    <aside aria-label={label} className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-border lg:flex">
      <Rows />
    </aside>
  )
}
