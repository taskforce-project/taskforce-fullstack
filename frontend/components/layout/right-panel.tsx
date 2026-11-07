"use client"

import { useEffect } from "react"
import { useParams, usePathname } from "next/navigation"

import { catalogForThisApp } from "@/components/integrations/integrations-catalog"
import { PANEL_ITEM, PanelRow } from "@/components/layout/panel-row"
import { ChangesRow, MissionsRow, ResultsRow } from "@/components/layout/work-rows"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useMinWidth } from "@/hooks/use-min-width"
import { formatTokens } from "@/lib/cortex/context-gauge"
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
import { connectorLines } from "@/lib/window/connectors"
import { contextSentence, windowShare } from "@/lib/window/context"
import { cortexModel, modelPlace, projectInView } from "@/lib/window/environment"

/** La conversation en cours, telle que la liste de l'espace la résume (son projet compris). */
function useConversation() {
  const conversations = useCortexStore((s) => s.conversations)
  const conversationId = useCortexStore((s) => s.conversationId)
  return conversations.find((c) => c.id === conversationId)
}

/** Environment : l'espace, le projet en vue, son dépôt, et où tourne le modèle. */
function EnvironmentRow() {
  const pathname = usePathname()
  const t = usePreferencesStore((s) => s.t.window)
  const workspace = useWorkspaceStore((s) => s.activeWorkspace)
  const projects = useProjectStore((s) => s.projects)
  const status = useAiStatusStore((s) => s.status)
  const conversation = useConversation()
  const project = projectInView(pathname, conversation, projects)
  const place = modelPlace(status, IS_DESKTOP)
  const model = cortexModel(status) ?? ""
  const where = { here: t.thisComputer, taskforce: t.taskforce, provider: t.provider, none: t.noModel }[place]
  const modelLine = {
    here: fillText(t.modelHere, { model }),
    taskforce: fillText(t.modelTaskforce, { model }),
    provider: fillText(t.modelProvider, { model }),
    none: t.noModel,
  }[place]

  return (
    <PanelRow row="environment" value={where}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-2 text-xs">
        <dt className="text-muted-foreground">{t.workspace}</dt>
        <dd className="truncate text-foreground">{workspace?.name}</dd>
        {project && (
          <>
            <dt className="text-muted-foreground">{t.project}</dt>
            <dd className="truncate text-foreground">
              {project.name} <span className="text-muted-foreground">{project.identifier}</span>
            </dd>
          </>
        )}
        {project?.repoFullName && (
          <>
            <dt className="text-muted-foreground">{t.repository}</dt>
            <dd className="truncate text-foreground">{project.repoFullName}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t.model}</dt>
        <dd className="truncate text-foreground" title={modelLine}>{modelLine}</dd>
      </dl>
    </PanelRow>
  )
}

/** Context : ce que Cortex voit (le volet, l'issue ouverte, R114) et la place de sa dernière réponse, en une phrase. */
function ContextRow() {
  const pathname = usePathname()
  const t = usePreferencesStore((s) => s.t.window)
  const openIssue = useScreenStore((s) => s.openIssue)
  const projects = useProjectStore((s) => s.projects)
  const issues = useIssueStore((s) => s.issues)
  const activeIssue = useIssueStore((s) => s.activeIssue)
  // La jauge de contexte (R122, sous le compositeur) : le prompt de la dernière demande contre sa fenêtre.
  const context = useCortexStore((s) => s.context)
  const status = useAiStatusStore((s) => s.status)

  const screen = screenFrom(pathname, openIssue)
  const project = screen ? projects.find((p) => p.id === screen.projectId) : undefined
  const issueId = screen?.issueId ?? null
  const issue = issueId === null ? undefined : [activeIssue, ...issues].find((i) => i?.id === issueId)
  const share = windowShare(context)
  const sentence = contextSentence(
    {
      project: screen ? (project?.name ?? t.project) : null,
      issue: issueId === null ? null : (issue?.identifier ?? `#${issueId}`),
      context,
      model: cortexModel(status),
    },
    t.context,
  )
  const value = share !== null ? `${share}%` : context ? formatTokens(context.tokens) : undefined

  return (
    <PanelRow row="context" value={value}>
      <p className="px-2 text-xs leading-relaxed text-foreground">{sentence}</p>
    </PanelRow>
  )
}

/** Connectors : les intégrations connectées, celles à reconnecter d'abord ; un clic mène aux réglages. */
function ConnectorsRow() {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.window)
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
  const reconnect = lines.filter((line) => line.reconnect).length
  const value = reconnect > 0 ? fillText(t.reconnectCount, { count: reconnect }) : catalog ? lines.length : undefined
  const settings = () => openSettings("integrations")

  return (
    <PanelRow row="connectors" value={value}>
      {lines.length === 0 ? (
        <button type="button" onClick={settings} className={`${PANEL_ITEM} text-muted-foreground`}>
          {t.noConnectors}
        </button>
      ) : (
        <ul className="flex flex-col">
          {lines.map((line) => (
            <li key={line.key}>
              <button type="button" onClick={settings} className={PANEL_ITEM}>
                <span className="min-w-0 flex-1 truncate text-foreground">{line.name}</span>
                <span className={line.reconnect ? "text-ink-yellow" : "text-muted-foreground"}>
                  {line.reconnect ? t.toReconnect : t.connected}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </PanelRow>
  )
}

function Rows() {
  return (
    <>
      <EnvironmentRow />
      <ContextRow />
      <ConnectorsRow />
      <ResultsRow />
      <ChangesRow />
      <MissionsRow />
    </>
  )
}

/**
 * La zone de droite de la fenêtre (R122, séance n°18) : ce qui entoure la conversation, en six lignes repliées par
 * défaut, chacune avec son nombre. 320 px ; elle s'ouvre et se replie depuis la ligne du haut, et se replie seule quand
 * un volet s'ouvre sous 1 600 px de large. Elle ne montre que le travail de la personne, chaque ligne menant à son
 * objet (R57). Sous `lg`, c'est un tiroir, qui s'ouvre depuis le même bouton et se ferme au choix d'une ligne.
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
