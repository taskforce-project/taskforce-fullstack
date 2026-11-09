"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Activity, AtSign, Bug, CalendarRange, CircleDot, FileText, FolderKanban, Inbox, LayoutDashboard, ListChecks, MessageSquare,
  MessagesSquare, Monitor, Moon, Plus, Repeat, Settings, ShieldAlert, Sparkles, Sun, TrendingUp, User, Users, type LucideIcon,
} from "lucide-react"
import { useTheme } from "next-themes"

import { CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { UserAvatar } from "@/components/ui/user-avatar"
import { fillText } from "@/lib/delivery/result-card"
import { IS_DESKTOP } from "@/lib/desktop"
import { useModKeyLabel } from "@/lib/hooks/use-mod-key"
import { usePaletteSearch } from "@/lib/hooks/use-palette-search"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useCreateProjectStore } from "@/lib/store/create-project-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { cn } from "@/lib/utils"
import { withConversation } from "@/lib/window/address"
import { commentsApart, pick } from "@/lib/window/palette"
import { homePath, PROGRESS } from "@/lib/window/pane"

/** Les bugs et idées se signalent sur le dépôt du projet (open source), pas dans l'instance. */
const REPORT_ISSUE_URL = "https://github.com/taskforce-project/taskforce-fullstack/issues/new/choose"

type ScreenKey =
  | "waitingForYou" | "alerts" | "mentions" | "myWork" | "dashboard" | "projects" | "roadmap" | "cycles" | "members"
  | "analytics" | "progress"

/**
 * Les écrans qui ont quitté le premier regard (R124, la règle de Norman), et ceux de la barre de gauche : chacun s'ouvre
 * dans le volet, la conversation gardée.
 */
const SCREENS: readonly { key: ScreenKey; path: string; icon: LucideIcon }[] = [
  { key: "waitingForYou", path: "/inbox", icon: Inbox },
  // Les anciens onglets du volet (R141) : leur liste seule, à leur adresse.
  { key: "alerts", path: "/inbox/alerts", icon: ShieldAlert },
  { key: "mentions", path: "/inbox/mentions", icon: AtSign },
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

/** Les lignes par section au plus : le reste se trouve en tapant un mot de plus. */
const SECTION_ROWS = 5
/** Sans texte tapé, les premières conversations et les projets : de quoi reprendre, sans noyer le reste. */
const FIRST_LOOK_ROWS = 5

const ICON = "size-4 shrink-0 text-muted-foreground"

/** Ce que dit une ligne : son nom, puis ce qui la précise, en gris. */
function Words({ name, detail }: Readonly<{ name: ReactNode; detail?: ReactNode }>) {
  return (
    <>
      <span className="min-w-0 max-w-[60%] shrink-0 truncate">{name}</span>
      {detail && <span className="min-w-0 flex-1 truncate text-muted-foreground">{detail}</span>}
    </>
  )
}

interface Row {
  /** Unique dans la palette : cmdk s'en sert pour la ligne choisie. */
  value: string
  icon: ReactNode
  body: ReactNode
  run: () => void
}

interface Section {
  heading: string
  rows: Row[]
}

const glyph = (Icon: LucideIcon, className = ICON) => <Icon className={className} aria-hidden="true" />

/** Une touche du pied de la palette. */
function Key({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[11px] leading-none text-muted-foreground">
      {children}
    </kbd>
  )
}

/**
 * La palette de la fenêtre (Ctrl+K ; R121, R124, R141), à la manière de Raycast : 640 px, un champ de 48 px, des sections,
 * la première ligne choisie, les flèches et Entrée. Elle cherche les issues par leur clé, leur titre et leurs commentaires,
 * les projets, les personnes, les notes par leurs mots, les conversations, les écrans et les gestes. Chaque résultat
 * s'ouvre dans le volet, la conversation gardée ; une conversation s'ouvre au centre. « Ask Cortex » remplit le
 * compositeur : rien ne part sans envoi (R76). La liste ne change que quand le serveur a répondu, sa hauteur est fixe :
 * rien ne saute, et aucun indicateur ne clignote.
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
  const members = useWorkspaceStore((s) => s.members)
  const fetchMembers = useWorkspaceStore((s) => s.fetchMembers)
  const { openIssue, openBoard } = usePaneNavigation()
  const { setTheme } = useTheme()
  const mod = useModKeyLabel()
  const search = usePaletteSearch(slug, open)
  const { typed, shown, issues, comments, notes, change } = search

  const root = useRef<HTMLDivElement>(null)
  // Entrée pressée avant la réponse : la ligne attendue est la première des résultats à venir, pas celle d'avant.
  const enterWaits = useRef(false)
  const membersAskedFor = useRef<string | null>(null)

  // Les personnes ne se chargent qu'une fois par espace, à la première ouverture. App desktop : on y travaille seul avec
  // ses agents.
  useEffect(() => {
    if (!open || IS_DESKTOP || members.length > 0 || membersAskedFor.current === slug) return
    membersAskedFor.current = slug
    void fetchMembers()
  }, [open, slug, members.length, fetchMembers])

  const close = useCallback(() => {
    onOpenChange(false)
    change("")
  }, [onOpenChange, change])

  const sections = useMemo<Section[]>(() => {
    const run = (action: () => void) => () => {
      action()
      close()
    }
    const focusComposer = () => {
      setChatOpen(true)
      requestAnimationFrame(() => document.getElementById("command-bar-input")?.focus())
    }
    /** Un écran dans le volet, la conversation de la fenêtre gardée (`?c=`). */
    const go = (path: string) => run(() => {
      if (slug) router.push(withConversation(`${homePath(slug)}${path}`, globalThis.location?.search ?? ""), { scroll: false })
    })

    const q = shown
    const issueRows: Row[] = [
      ...(q ? issues : issues.slice(0, FIRST_LOOK_ROWS)).map((hit): Row => ({
        value: `issue-${hit.id}`,
        icon: glyph(CircleDot),
        body: <Words name={<span className="font-medium">{hit.key}</span>} detail={hit.title} />,
        run: run(() => openIssue({ projectId: hit.projectId, issueId: hit.id })),
      })),
      // Ce qu'on a écrit dessous : l'icône du commentaire, et ses mots à la place du titre.
      ...commentsApart(comments, issues).map((hit): Row => ({
        value: `comment-${hit.issueId}`,
        icon: glyph(MessageSquare),
        body: <Words name={<span className="font-medium">{hit.key}</span>} detail={hit.excerpt} />,
        run: run(() => openIssue({ projectId: hit.projectId, issueId: hit.issueId })),
      })),
    ]

    const projectRows = pick(projects.filter((p) => p.status !== "ARCHIVED"), q, (p) => `${p.name} ${p.identifier ?? ""}`, q ? SECTION_ROWS : FIRST_LOOK_ROWS)
      .map((project): Row => ({
        value: `project-${project.id}`,
        icon: glyph(FolderKanban),
        body: <Words name={project.name} />,
        run: run(() => openBoard(project.id)),
      }))

    const peopleRows = q && !IS_DESKTOP
      ? pick(members, q, (m) => `${m.displayName ?? ""} ${m.email}`, SECTION_ROWS).map((member): Row => ({
          value: `person-${member.id}`,
          icon: <UserAvatar email={member.email} avatarUrl={member.avatarUrl} name={member.displayName ?? member.email} className="size-4 shrink-0" fallbackClassName="text-[8px] font-semibold" />,
          body: <Words name={member.displayName ?? member.email} detail={member.displayName ? member.email : null} />,
          run: go(`/members/${member.id}`),
        }))
      : []

    const noteRows = notes.map((note): Row => ({
      value: `note-${note.id}`,
      icon: glyph(FileText),
      body: <Words name={note.title} detail={note.excerpt} />,
      run: go(`/notes/${note.id}`),
    }))

    const conversationRows = pick(conversations, q, (c) => c.title, q ? SECTION_ROWS : FIRST_LOOK_ROWS)
      .map((conversation): Row => ({
        value: `conversation-${conversation.id}`,
        icon: glyph(MessagesSquare),
        body: <Words name={conversation.title} />,
        run: run(() => {
          void openConversation(slug, conversation.id)
          focusComposer()
        }),
      }))

    const screenRows = pick(SCREENS, q, ({ key }) => w[key], SCREENS.length).map(({ key, path, icon }): Row => ({
      value: `screen-${key}`,
      icon: glyph(icon),
      body: <Words name={w[key]} />,
      run: go(path),
    }))

    const gestures = [
      { value: "new-conversation", name: t.newConversation, icon: Plus, run: run(() => { newConversation(); focusComposer() }) },
      { value: "create-project", name: t.createProject, icon: Plus, run: run(openCreateProject) },
      { value: "settings", name: t.settings, icon: Settings, run: run(() => openSettings()) },
      { value: "profile", name: t.profile, icon: User, run: run(() => openSettings("profile")) },
      { value: "report", name: t.reportIssue, icon: Bug, run: run(() => { window.open(REPORT_ISSUE_URL, "_blank", "noopener,noreferrer") }) },
      { value: "light", name: t.light, icon: Sun, run: run(() => setTheme("light")) },
      { value: "dark", name: t.dark, icon: Moon, run: run(() => setTheme("dark")) },
      { value: "system", name: t.system, icon: Monitor, run: run(() => setTheme("system")) },
    ]
    const actionRows: Row[] = [
      ...(q ? [{
        value: "ask-cortex",
        icon: glyph(Sparkles, "size-4 shrink-0 text-primary"),
        body: <Words name={fillText(t.askCortex, { query: q })} />,
        run: run(() => {
          setDraft(q)
          focusComposer()
        }),
      }] : []),
      ...pick(gestures, q, (gesture) => gesture.name, gestures.length).map((gesture): Row => ({
        value: gesture.value,
        icon: glyph(gesture.icon),
        body: <Words name={gesture.name} />,
        run: gesture.run,
      })),
    ]

    const found: Section[] = [
      { heading: t.issues, rows: issueRows },
      { heading: t.projects, rows: projectRows },
      { heading: t.people, rows: peopleRows },
      { heading: t.notes, rows: noteRows },
      { heading: t.conversations, rows: conversationRows },
      { heading: t.screens, rows: screenRows },
      { heading: t.actions, rows: actionRows },
    ].filter((section) => section.rows.length > 0)

    // Rien ne répond : la palette le dit, et propose de demander à Cortex, choisi d'emblée.
    return found.length === 1 && found[0].rows.length === 1 && found[0].rows[0].value === "ask-cortex"
      ? [{ heading: fillText(t.noResults, { query: q }), rows: found[0].rows }]
      : found
  }, [
    shown, issues, comments, notes, projects, members, conversations, slug, t, w, router, openIssue, openBoard, openConversation,
    newConversation, setDraft, setChatOpen, openCreateProject, openSettings, setTheme, close,
  ])

  const firstRow = sections[0]?.rows[0]

  useEffect(() => {
    if (!enterWaits.current || typed !== shown) return
    enterWaits.current = false
    // Le champ vidé entre-temps (la palette fermée) : plus personne n'attend cette ligne.
    if (typed) firstRow?.run()
  }, [typed, shown, firstRow])

  // À chaque nouvelle liste, la première ligne : cmdk ne l'expose pas, on lui envoie sa propre touche, qui tient aussi à
  // jour l'élément actif pour les lecteurs d'écran et le défilement.
  useLayoutEffect(() => {
    root.current?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }))
  }, [shown])

  const askCortex = () => {
    if (typed) setDraft(typed)
    setChatOpen(true)
    requestAnimationFrame(() => document.getElementById("command-bar-input")?.focus())
    close()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault()
      askCortex()
    } else if (typed !== shown) {
      event.preventDefault()
      enterWaits.current = true
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => { if (next) onOpenChange(true); else close() }}
      title={t.title}
      description={t.placeholder}
      showCloseButton={false}
      commandProps={{ ref: root, shouldFilter: false, loop: true, onKeyDown }}
      className="top-[12vh] translate-y-0 gap-0 rounded-xl shadow-2xl sm:max-w-[640px]"
    >
      <CommandInput
        placeholder={t.placeholder}
        value={search.query}
        onValueChange={(next) => {
          enterWaits.current = false
          change(next)
        }}
      />
      {/* Hauteur fixe, gouttière réservée : les résultats qui arrivent ne bougent ni la fenêtre ni les lignes. */}
      <CommandList className="h-90 max-h-[60vh] py-1 [scrollbar-gutter:stable]">
        {search.failed && <p className="px-4 py-2 text-xs text-muted-foreground">{t.failed}</p>}
        {sections.map((section) => (
          <CommandGroup key={section.heading} heading={section.heading}>
            {section.rows.map((row) => (
              <CommandItem key={row.value} value={row.value} onSelect={row.run} className="gap-2">
                {row.icon}
                {row.body}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>

      {/* Les rappels du clavier. */}
      <div className="flex h-9 shrink-0 items-center gap-4 border-t border-border px-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Key>↑</Key><Key>↓</Key>{t.navigate}</span>
        <span className="flex items-center gap-1.5"><Key>↵</Key>{t.open}</span>
        <span className="flex items-center gap-1.5"><Key>{mod} ↵</Key>{t.ask}</span>
        {/* Pas d'indicateur sous la demi-seconde : il n'apparaît que si la réponse se fait attendre. */}
        <span className={cn("ml-auto transition-opacity", typed !== shown ? "opacity-100 delay-500 duration-150" : "opacity-0 duration-0")}>{t.searching}</span>
        <span className="flex items-center gap-1.5"><Key>esc</Key>{t.close}</span>
      </div>
    </CommandDialog>
  )
}
