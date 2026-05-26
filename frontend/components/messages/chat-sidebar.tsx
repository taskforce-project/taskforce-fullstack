"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, FolderKanban, MessageSquarePlus, Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { GENERAL_CHANNELS, DM_CHANNELS, PROJECT_GROUPS, totalUnread } from "./data"
import { SectionHeader } from "./section-header"
import { ChannelRow } from "./channel-row"
import type { Channel } from "./types"
import type { ChannelSummary } from "@/lib/api/message-service"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: convertir ChannelSummary (API) → Channel (UI interne)
// ─────────────────────────────────────────────────────────────────────────────

function toUiChannel(c: ChannelSummary): Channel {
  const kindMap: Record<string, Channel["kind"]> = {
    CHANNEL:         "channel",
    DM:              "dm",
    GROUP_DM:        "group-dm",
    PROJECT_CHANNEL: "project-channel",
  }
  return {
    id:          c.id.toString(),
    kind:        kindMap[c.kind] ?? "channel",
    name:        c.name ?? `channel-${c.id}`,
    description: c.description ?? undefined,
    projectId:   c.projectId?.toString() ?? undefined,
  }
}

interface ProjectGroup {
  id:       string
  name:     string
  channels: Channel[]
}

function buildSections(apiChannels: ChannelSummary[]) {
  const general:  Channel[]      = []
  const dms:      Channel[]      = []
  const byProject = new Map<string, ProjectGroup>()

  for (const c of apiChannels) {
    const ch = toUiChannel(c)
    if (c.kind === "CHANNEL") {
      general.push(ch)
    } else if (c.kind === "DM" || c.kind === "GROUP_DM") {
      dms.push(ch)
    } else if (c.kind === "PROJECT_CHANNEL" && c.projectId) {
      const key = c.projectId.toString()
      if (!byProject.has(key)) {
        byProject.set(key, { id: key, name: c.projectName ?? `Project ${key}`, channels: [] })
      }
      byProject.get(key)!.channels.push(ch)
    }
  }
  return { general, dms, projects: [...byProject.values()] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface ChatSidebarProps {
  readonly activeId:    string
  readonly onSelect:    (id: string) => void
  /** Canaux réels depuis l'API — si fournis, remplacent les données mock */
  readonly apiChannels?: ChannelSummary[]
}

export function ChatSidebar({ activeId, onSelect, apiChannels }: ChatSidebarProps) {
  const [channelsOpen, setChannelsOpen] = useState(true)
  const [dmsOpen,      setDmsOpen]      = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set(["tf-app"]))
  const [search,       setSearch]       = useState("")

  function toggleProject(id: string) {
    setOpenProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const query = search.toLowerCase()

  // Utiliser les données API si disponibles, sinon fallback sur les mocks
  const { general: rawGeneral, dms: rawDms, projects: rawProjects } = apiChannels
    ? buildSections(apiChannels)
    : { general: GENERAL_CHANNELS, dms: DM_CHANNELS, projects: PROJECT_GROUPS }

  const filteredGeneral  = rawGeneral.filter((c) => c.name.toLowerCase().includes(query))
  const filteredDms      = rawDms.filter((c) => c.name.toLowerCase().includes(query))
  const filteredProjects = rawProjects
    .map((pg) => ({ ...pg, channels: pg.channels.filter((c) => c.name.toLowerCase().includes(query)) }))
    .filter((pg) => pg.channels.length > 0)

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-sidebar overflow-hidden">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-border">
        <span className="font-semibold text-sm text-foreground">Messages</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toast.info("New message")}>
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 h-8">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-5">

        {/* General channels */}
        <div>
          <SectionHeader
            label="Channels"
            open={channelsOpen}
            onToggle={() => setChannelsOpen((v) => !v)}
            unread={totalUnread(filteredGeneral)}
            action={
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => toast.info("New channel")}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            }
          />
          {channelsOpen && filteredGeneral.map((c) => (
            <ChannelRow key={c.id} channel={c} active={activeId === c.id} onClick={() => onSelect(c.id)} />
          ))}
        </div>

        {/* Direct messages */}
        <div>
          <SectionHeader
            label="Direct Messages"
            open={dmsOpen}
            onToggle={() => setDmsOpen((v) => !v)}
            unread={totalUnread(filteredDms)}
            action={
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => toast.info("New DM")}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            }
          />
          {dmsOpen && filteredDms.map((c) => (
            <ChannelRow key={c.id} channel={c} active={activeId === c.id} onClick={() => onSelect(c.id)} />
          ))}
        </div>

        {/* Projects */}
        <div>
          <SectionHeader
            label="Projects"
            open={projectsOpen}
            onToggle={() => setProjectsOpen((v) => !v)}
          />
          {projectsOpen && filteredProjects.map((pg) => (
            <div key={pg.id} className="mb-1">
              <button
                onClick={() => toggleProject(pg.id)}
                className={cn(
                  "flex w-full items-center gap-1.5 px-2 py-1.5 text-xs rounded-md hover:bg-sidebar-accent/50 transition-colors",
                  "text-muted-foreground hover:text-foreground"
                )}
              >
                {openProjects.has(pg.id)
                  ? <ChevronDown  className="h-3 w-3 shrink-0" />
                  : <ChevronRight className="h-3 w-3 shrink-0" />
                }
                <FolderKanban className="h-3 w-3 shrink-0" />
                <span className="truncate font-medium">{pg.name}</span>
              </button>
              {openProjects.has(pg.id) && (
                <div className="ml-3">
                  {pg.channels.map((c) => (
                    <ChannelRow key={c.id} channel={c} active={activeId === c.id} onClick={() => onSelect(c.id)} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

  const [channelsOpen, setChannelsOpen] = useState(true)
  const [dmsOpen,      setDmsOpen]      = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set(["tf-app"]))
  const [search,       setSearch]       = useState("")

  function toggleProject(id: string) {
    setOpenProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const query            = search.toLowerCase()
  const filteredGeneral  = GENERAL_CHANNELS.filter((c) => c.name.includes(query))
  const filteredDms      = DM_CHANNELS.filter((c) => c.name.toLowerCase().includes(query))
  const filteredProjects = PROJECT_GROUPS
    .map((pg) => ({ ...pg, channels: pg.channels.filter((c) => c.name.includes(query)) }))
    .filter((pg) => pg.channels.length > 0)

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-sidebar overflow-hidden">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-border">
        <span className="font-semibold text-sm text-foreground">Messages</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toast.info("New message")}>
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 h-8">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-5">

        {/* General channels */}
        <div>
          <SectionHeader
            label="Channels"
            open={channelsOpen}
            onToggle={() => setChannelsOpen((v) => !v)}
            unread={totalUnread(filteredGeneral)}
            action={
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => toast.info("New channel")}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            }
          />
          {channelsOpen && filteredGeneral.map((c) => (
            <ChannelRow key={c.id} channel={c} active={activeId === c.id} onClick={() => onSelect(c.id)} />
          ))}
        </div>

        {/* Direct messages */}
        <div>
          <SectionHeader
            label="Direct Messages"
            open={dmsOpen}
            onToggle={() => setDmsOpen((v) => !v)}
            unread={totalUnread(filteredDms)}
            action={
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => toast.info("New DM")}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            }
          />
          {dmsOpen && filteredDms.map((c) => (
            <ChannelRow key={c.id} channel={c} active={activeId === c.id} onClick={() => onSelect(c.id)} />
          ))}
        </div>

        {/* Projects */}
        <div>
          <SectionHeader
            label="Projects"
            open={projectsOpen}
            onToggle={() => setProjectsOpen((v) => !v)}
          />
          {projectsOpen && filteredProjects.map((pg) => (
            <div key={pg.id} className="mb-1">
              <button
                onClick={() => toggleProject(pg.id)}
                className={cn(
                  "flex w-full items-center gap-1.5 px-2 py-1.5 text-xs rounded-md hover:bg-sidebar-accent/50 transition-colors",
                  "text-muted-foreground hover:text-foreground"
                )}
              >
                {openProjects.has(pg.id)
                  ? <ChevronDown  className="h-3 w-3 shrink-0" />
                  : <ChevronRight className="h-3 w-3 shrink-0" />
                }
                <FolderKanban className="h-3 w-3 shrink-0" />
                <span className="truncate font-medium">{pg.name}</span>
              </button>
              {openProjects.has(pg.id) && (
                <div className="ml-3">
                  {pg.channels.map((c) => (
                    <ChannelRow key={c.id} channel={c} active={activeId === c.id} onClick={() => onSelect(c.id)} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
