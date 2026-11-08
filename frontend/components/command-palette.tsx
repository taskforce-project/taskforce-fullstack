"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Activity, ArrowRight, Bug, CalendarRange, CircleDot, FolderKanban, Inbox, LayoutDashboard, ListChecks, MessageSquare,
  Monitor, Moon, Plus, Repeat, Settings, Sparkles, Sun, TrendingUp, User, Users, type LucideIcon,
} from "lucide-react"
import { useTheme } from "next-themes"

import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command"
import { fillText } from "@/lib/delivery/result-card"
import { IS_DESKTOP } from "@/lib/desktop"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { SEARCH_DELAY_MS } from "@/lib/hooks/use-pick-options"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useCreateProjectStore } from "@/lib/store/create-project-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { searchKey, useSearchStore } from "@/lib/store/search-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { withConversation } from "@/lib/window/address"
import { homePath, PROGRESS } from "@/lib/window/pane"

/** Les bugs et idées se signalent sur le dépôt du projet (open source), pas dans l'instance. */
const REPORT_ISSUE_URL = "https://github.com/taskforce-project/taskforce-fullstack/issues/new/choose"

type ScreenKey =
  | "waitingForYou" | "myWork" | "dashboard" | "projects" | "roadmap" | "cycles" | "members" | "analytics" | "progress"

/**
 * Les écrans qui ont quitté le premier regard (R124, la règle de Norman), et ceux de la barre de gauche : chacun s'ouvre
 * dans le volet, la conversation gardée.
 */
const SCREENS: readonly { key: ScreenKey; path: string; icon: LucideIcon }[] = [
  { key: "waitingForYou", path: "/inbox", icon: Inbox },
  { key: "myWork", path: "/my-work", icon: ListChecks },
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "projects", path: "/projects", icon: FolderKanban },
  { key: "roadmap", path: "/roadmap", icon: CalendarRange },
  { key: "cycles", path: "/cycles", icon: Repeat },
  // App desktop : pas de membres, on y travaille seul avec ses agents.
  ...(IS_DESKTOP ? [] : [{ key: "members" as const, path: "/members", icon: Users }]),
  { key: "analytics", path: "/analytics", icon: Activity },
  // Ce que Cortex sait et comment il progresse (R125) : le volet « Progress ».
  { key: "progress", path: `/${PROGRESS}`, icon: TrendingUp },
]

const ITEM = "group gap-3"
const ICON = "size-4 shrink-0 text-muted-foreground"

/** La flèche de la ligne active, à droite. */
function Go() {
  return <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-data-[selected=true]:opacity-100 motion-reduce:transition-none" />
}

/**
 * La recherche de la fenêtre (Ctrl+K ; R121, R124) : les issues par leur clé ou leur titre (la recherche de l'espace),
 * les projets, les conversations, puis les écrans qui ont quitté le premier regard (Dashboard, My work, Members, Roadmap
 * et les autres) et quelques gestes. Chaque écran et chaque issue s'ouvrent dans le volet, la conversation gardée ; une
 * conversation s'ouvre au centre. « Ask Cortex » remplit le compositeur : rien ne part sans envoi (R76).
 */
export function CommandPalette({ open, onOpenChange }: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const router = useRouter()
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.search)
  const w = usePreferencesStore((s) => s.t.window)
  const projects = useProjectStore((s) => s.projects)
  const conversations = useCortexStore((s) => s.conversations)
  const openConversation = useCortexStore((s) => s.openConversation)
  const newConversation = useCortexStore((s) => s.newConversation)
  const setDraft = useCortexStore((s) => s.setDraft)
  const setChatOpen = useCortexStore((s) => s.setOpen)
  const openCreateProject = useCreateProjectStore((s) => s.openCreateProject)
  const openSettings = useSettingsStore((s) => s.openSettings)
  const find = useSearchStore((s) => s.find)
  const { openIssue, openBoard } = usePaneNavigation()
  const { setTheme } = useTheme()
  const [query, setQuery] = useState("")
  const typed = query.trim()
  const hits = useSearchStore((s) => (typed ? s.hits[searchKey(slug, typed)] : undefined))
  const searching = useSearchStore((s) => (typed ? Boolean(s.pending[searchKey(slug, typed)]) : false))

  // Les issues se cherchent sur le serveur, après une courte pause : une recherche par mot, pas par touche.
  useEffect(() => {
    if (!open || !slug || !typed) return
    const id = setTimeout(() => { void find(slug, typed) }, SEARCH_DELAY_MS)
    return () => clearTimeout(id)
  }, [open, slug, typed, find])

  const close = () => {
    onOpenChange(false)
    setQuery("")
  }

  const focusComposer = () => {
    setChatOpen(true)
    requestAnimationFrame(() => document.getElementById("command-bar-input")?.focus())
  }

  /** Un écran dans le volet, la conversation de la fenêtre gardée (`?c=`). */
  const go = (path: string) => {
    if (slug) router.push(withConversation(`${homePath(slug)}${path}`, globalThis.location?.search ?? ""), { scroll: false })
    close()
  }

  const run = (action: () => void) => () => {
    action()
    close()
  }

  const liveProjects = projects.filter((project) => project.status !== "ARCHIVED")

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t.title}
      description={t.placeholder}
      showCloseButton={false}
      className="max-w-2xl overflow-hidden rounded-xl border shadow-2xl"
    >
      <CommandInput placeholder={t.placeholder} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{searching ? t.searching : t.none}</CommandEmpty>

        {typed && (hits?.length ?? 0) > 0 && (
          <CommandGroup heading={t.issues}>
            {hits?.map((hit) => (
              <CommandItem
                key={`issue-${hit.id}`}
                value={`issue ${hit.key} ${hit.title}`}
                // Le serveur a déjà trouvé l'issue (« ops 35 » pour OPS-35) : la palette ne la filtre pas une seconde fois.
                keywords={[typed]}
                onSelect={run(() => openIssue({ projectId: hit.projectId, issueId: hit.id }))}
                className={ITEM}
              >
                <CircleDot className={ICON} />
                <span className="shrink-0 font-medium">{hit.key}</span>
                <span className="min-w-0 truncate text-muted-foreground">{hit.title}</span>
                <Go />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {liveProjects.length > 0 && (
          <CommandGroup heading={t.projects}>
            {liveProjects.map((project) => (
              <CommandItem
                key={`project-${project.id}`}
                value={`project ${project.name} ${project.identifier ?? ""}`}
                onSelect={run(() => openBoard(project.id))}
                className={ITEM}
              >
                <FolderKanban className={ICON} />
                <span className="truncate">{project.name}</span>
                <Go />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {conversations.length > 0 && (
          <CommandGroup heading={t.conversations}>
            {conversations.slice(0, 20).map((conversation) => (
              <CommandItem
                key={`conversation-${conversation.id}`}
                value={`conversation ${conversation.id} ${conversation.title}`}
                onSelect={run(() => {
                  void openConversation(slug, conversation.id)
                  focusComposer()
                })}
                className={ITEM}
              >
                <MessageSquare className={ICON} />
                <span className="truncate">{conversation.title}</span>
                <Go />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading={t.screens}>
          {SCREENS.map(({ key, path, icon: Icon }) => (
            <CommandItem key={key} value={`screen ${w[key]}`} onSelect={() => go(path)} className={ITEM}>
              <Icon className={ICON} />
              <span>{w[key]}</span>
              <Go />
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading={t.actions}>
          {typed && (
            <CommandItem
              value={`ask cortex ${typed}`}
              keywords={[typed]}
              onSelect={run(() => {
                setDraft(typed)
                focusComposer()
              })}
              className={ITEM}
            >
              <Sparkles className="size-4 shrink-0 text-primary" />
              <span className="truncate">{fillText(t.askCortex, { query: typed })}</span>
              <Go />
            </CommandItem>
          )}
          <CommandItem value={t.newConversation} onSelect={run(() => { newConversation(); focusComposer() })} className={ITEM}>
            <Plus className={ICON} />
            <span>{t.newConversation}</span>
          </CommandItem>
          <CommandItem value={t.createProject} onSelect={run(openCreateProject)} className={ITEM}>
            <Plus className={ICON} />
            <span>{t.createProject}</span>
          </CommandItem>
          <CommandItem value={t.settings} onSelect={run(() => openSettings())} className={ITEM}>
            <Settings className={ICON} />
            <span>{t.settings}</span>
          </CommandItem>
          <CommandItem value={t.profile} onSelect={run(() => openSettings("profile"))} className={ITEM}>
            <User className={ICON} />
            <span>{t.profile}</span>
          </CommandItem>
          <CommandItem
            value={t.reportIssue}
            onSelect={run(() => { window.open(REPORT_ISSUE_URL, "_blank", "noopener,noreferrer") })}
            className={ITEM}
          >
            <Bug className={ICON} />
            <span>{t.reportIssue}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading={t.appearance}>
          <CommandItem value={t.light} onSelect={run(() => setTheme("light"))} className={ITEM}>
            <Sun className={ICON} />
            <span>{t.light}</span>
          </CommandItem>
          <CommandItem value={t.dark} onSelect={run(() => setTheme("dark"))} className={ITEM}>
            <Moon className={ICON} />
            <span>{t.dark}</span>
          </CommandItem>
          <CommandItem value={t.system} onSelect={run(() => setTheme("system"))} className={ITEM}>
            <Monitor className={ICON} />
            <span>{t.system}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>

      {/* Les rappels du clavier. */}
      <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <kbd className="inline-flex size-4 items-center justify-center rounded border border-border bg-muted text-xs">↑</kbd>
          <kbd className="inline-flex size-4 items-center justify-center rounded border border-border bg-muted text-xs">↓</kbd>
          {t.navigate}
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="inline-flex h-4 items-center justify-center rounded border border-border bg-muted px-1 text-xs">↵</kbd>
          {t.select}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <kbd className="inline-flex h-4 items-center justify-center rounded border border-border bg-muted px-1 text-xs">esc</kbd>
          {t.close}
        </span>
      </div>
    </CommandDialog>
  )
}
