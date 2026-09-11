"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import {
  Brain, Plus, Trash2, Save, X, FileText, Search, Sparkles, Network, Link2,
  ChevronRight, Tag as TagIcon, PanelLeftClose, PanelLeftOpen, Eye, EyeOff,
} from "lucide-react"

import { useBrainStore } from "@/lib/store/brain-store"
import { useProjectStore } from "@/lib/store/project-store"
import dynamic from "next/dynamic"

const BrainGraph = dynamic(
  () => import("@/components/brain/brain-graph").then((m) => m.BrainGraph),
  { ssr: false, loading: () => <div className="h-full w-full bg-muted/20" /> },
)
import { MarkdownEditor } from "@/components/brain/markdown-editor"
import { PageTree } from "@/components/brain/page-tree"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { DeleteConfirmDialog } from "@/components/dialogs/delete-confirm-dialog"
import { uploadBrainFile, type KnowledgeNode } from "@/lib/api/brain-service"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/api/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// Listes d'enums miroir du backend (NodeType / NodeDomain).
const NODE_TYPES = [
  "ADR", "DECISION", "RUNBOOK", "SOP", "FINDING", "CHANGELOG",
  "DOC", "SPEC", "NOTE", "README", "TEMPLATE", "ACTION_OODA",
] as const

const DOMAINS: { value: string; code: string; label: string }[] = [
  { value: "PROJET", code: "01", label: "Project" },
  { value: "PRODUIT", code: "02", label: "Product" },
  { value: "ARCHITECTURE", code: "03", label: "Architecture" },
  { value: "ENGINEERING", code: "04", label: "Engineering" },
  { value: "API", code: "05", label: "API" },
  { value: "INFRA", code: "06", label: "Infrastructure" },
  { value: "SECURITE", code: "07", label: "Security" },
  { value: "OPERATIONS", code: "08", label: "Operations" },
  { value: "AUDITS", code: "09", label: "Audits" },
  { value: "RUNBOOKS", code: "10", label: "Runbooks" },
  { value: "PCA_PRA", code: "11", label: "BCP / DRP" },
  { value: "DECISIONS", code: "12", label: "Decisions" },
  { value: "ROADMAP", code: "13", label: "Roadmap" },
  { value: "DESIGN", code: "14", label: "Design" },
  { value: "UTILISATEUR", code: "15", label: "User" },
  { value: "HISTORIQUE", code: "16", label: "History" },
  { value: "ARCHIVE", code: "20", label: "Archive" },
]

const domainLabel = (value: string) => DOMAINS.find((d) => d.value === value)?.label ?? value

export default function BrainPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""

  const {
    overview, loading, error, selectedNodeId, fetchOverview, selectNode, removeNode,
    searchResults, searching, search, clearSearch,
  } = useBrainStore()
  const projects = useProjectStore((s) => s.projects)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)

  const [createOpen, setCreateOpen] = useState(false)
  const [queryText, setQueryText] = useState("")
  const [view, setView] = useState<"editor" | "graph">("editor")
  const [activeTag, setActiveTag] = useState<string | null>(null)
  // Preselection du dialog de creation : domaine + page parente (arbre facon Notion).
  const [createPreset, setCreatePreset] = useState<{ domain?: string; parentId?: number | null }>({})
  const [showTags, setShowTags] = useState(true)
  const [explorerOpen, setExplorerOpen] = useState(true)
  const [showSystem, setShowSystem] = useState(false)

  const runSearch = () => search(slug, queryText)
  const onClearSearch = () => {
    setQueryText("")
    clearSearch()
  }

  useEffect(() => {
    if (slug) fetchOverview(slug)
  }, [slug, fetchOverview])

  // Deep-link depuis la palette Cmd+K (`/brain?node=<id>`) : ouvre la page puis nettoie l'URL
  // (sinon le param rejouerait a chaque render). Meme motif que le deep-link d'issue sur le board.
  useEffect(() => {
    const raw = searchParams.get("node")
    if (!raw) return
    const id = Number(raw)
    if (Number.isFinite(id)) { selectNode(id); setView("editor") }
    const url = new URL(window.location.href)
    url.searchParams.delete("node")
    router.replace(url.pathname + url.search, { scroll: false })
  }, [searchParams, selectNode, router])

  // Les projets nomment et colorent les régions du graphe (metadata.projects → région).
  useEffect(() => {
    if (slug) void fetchProjects(slug)
  }, [slug, fetchProjects])

  // Nodes visibles : le noyau (system : règles/AGENTS) est masqué sauf si l'utilisateur l'affiche.
  const visibleNodes = useMemo(() => {
    const ns = overview?.nodes ?? []
    return showSystem ? ns : ns.filter((n) => !n.system)
  }, [overview, showSystem])

  // Tags du workspace avec compteur (clic = filtre l'explorateur).
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of visibleNodes) for (const t of n.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [visibleNodes])

  // Filtre par tag actif (pour l'arborescence).
  const filteredNodes = useMemo(() => {
    return activeTag ? visibleNodes.filter((n) => (n.tags ?? []).includes(activeTag)) : visibleNodes
  }, [visibleNodes, activeTag])

  const selected = overview?.nodes.find((n) => n.id === selectedNodeId) ?? null

  const toggleTag = (t: string) => setActiveTag((cur) => (cur === t ? null : t))
  // Nouvelle page depuis l'arbre : sous un domaine (parentId null) ou sous une page (parentId).
  const handleNewPage = (domain: string, parentId: number | null) => {
    setCreatePreset({ domain, parentId })
    setCreateOpen(true)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setExplorerOpen((v) => !v)} aria-label="Show/hide explorer"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            {explorerOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </button>
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Brain className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-none">Brain OS</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {overview?.totalNodes ?? 0} nodes
              {overview?.templateType ? ` · template ${overview.templateType}` : ""}
              {overview?.versionLabel ? ` · ${overview.versionLabel}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border p-0.5">
            <button
              onClick={() => setView("editor")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                view === "editor" ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="size-3.5" /> Editor
            </button>
            <button
              onClick={() => setView("graph")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                view === "graph" ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Network className="size-3.5" /> Graph
            </button>
          </div>
          <Button size="sm" onClick={() => { setCreatePreset({}); setCreateOpen(true) }}>
            <Plus className="size-4" /> New page
          </Button>
        </div>
      </div>

      {error && (
        <div className="m-6 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Something went wrong with Brain OS. Please try again.
        </div>
      )}

      {/* Body : 2 panneaux façon Obsidian - explorateur (animé) | éditeur central */}
      <div className="flex min-h-0 flex-1">
        {/* ── Explorateur (gauche, collapsible animé) : recherche + dossiers + tags ── */}
        <aside className={`min-h-0 shrink-0 overflow-hidden border-r transition-[width] duration-300 ease-in-out ${explorerOpen ? "w-[260px]" : "w-0 border-r-0"}`}>
          <div className="flex h-full w-[260px] flex-col">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch()
                  if (e.key === "Escape") onClearSearch()
                }}
                placeholder="Search…"
                className="pl-8 pr-8"
              />
              {(queryText || searchResults) && (
                <button onClick={onClearSearch} aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-2">
              {searchResults ? (
                /* Résultats de recherche (à plat) */
                <div>
                  <div className="mb-1 flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="size-3" />
                    {searching ? "Searching…" : `${searchResults.length} result(s)`}
                  </div>
                  {searchResults.map((hit) => (
                    <button key={hit.node.id} onClick={() => { selectNode(hit.node.id); setView("editor") }}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                        selectedNodeId === hit.node.id ? "bg-accent font-medium" : ""
                      }`}>
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{hit.node.title}</span>
                      <span className="shrink-0 rounded bg-muted px-1 text-[10px] tabular-nums text-muted-foreground">
                        {(hit.score * 100).toFixed(0)}%
                      </span>
                    </button>
                  ))}
                  {!searching && searchResults.length === 0 && (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">No results.</p>
                  )}
                </div>
              ) : loading && !overview ? (
                <div className="space-y-1.5 p-1">
                  {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
                </div>
              ) : (
                <>
                  {activeTag && (
                    <button onClick={() => setActiveTag(null)}
                      className="mb-1 flex w-full items-center gap-1 px-2 py-1 text-xs text-primary hover:underline">
                      <X className="size-3" /> Filter #{activeTag}
                    </button>
                  )}
                  {/* Arbre de pages facon Notion : domaines = racines, pages nichees via parentNodeId */}
                  <PageTree
                    nodes={filteredNodes}
                    domains={DOMAINS}
                    selectedNodeId={selectedNodeId}
                    activeTag={activeTag}
                    onSelect={(id) => { selectNode(id); setView("editor") }}
                    onNewPage={handleNewPage}
                  />

                  {/* Tags : cliquer pour filtrer l'explorateur */}
                  {tagCounts.length > 0 && (
                    <div className="mt-3 border-t pt-2">
                      <button onClick={() => setShowTags((v) => !v)}
                        className="flex w-full items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                        <ChevronRight className={`size-3 transition-transform ${showTags ? "rotate-90" : ""}`} />
                        <TagIcon className="size-3" /> Tags
                      </button>
                      {showTags && (
                        <div className="flex flex-wrap gap-1 px-2 pt-1">
                          {tagCounts.map(([t, c]) => (
                            <button key={t} onClick={() => toggleTag(t)}
                              className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                                activeTag === t ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"
                              }`}>
                              #{t} <span className="opacity-60">{c}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Noyau système (hub règles / AGENTS) - caché par défaut (expertise) */}
                  <div className="mt-3 border-t pt-2">
                    <button onClick={() => setShowSystem((v) => !v)}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                      {showSystem ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      {showSystem ? "Hide the core" : "Show the core (agent rules)"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
          </div>
        </aside>

        {/* ── Éditeur central (ou graphe plein) ── */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view === "graph" ? (
            <BrainGraph
              nodes={visibleNodes}
              edges={overview?.edges ?? []}
              projects={projects}
              selectedNodeId={selectedNodeId}
              onSelect={(id) => { selectNode(id); setView("editor") }}
              activeTag={activeTag}
              onSelectTag={(t) => setActiveTag((cur) => (cur === t ? null : t))}
            />
          ) : selected ? (
            <NodeDetail
              key={selected.id}
              slug={slug}
              node={selected}
              onDelete={async () => {
                // removeNode THROW ; la confirmation avale la promesse (void) -> on notifie ici.
                try {
                  await removeNode(slug, selected.id)
                  toast.success("Node deleted")
                } catch (e) {
                  toast.error(getErrorMessage(e))
                }
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Brain className="size-7" />
              </div>
              {(overview?.totalNodes ?? 0) === 0 ? (
                <div className="max-w-sm space-y-2">
                  <p className="text-base font-semibold">Your Brain is ready</p>
                  <p className="text-sm text-muted-foreground">
                    The folders on the left are the base architecture. Notes are created and organized
                    automatically as your projects progress - or add one manually.
                  </p>
                </div>
              ) : (
                <p className="max-w-sm text-sm text-muted-foreground">
                  Select a note in the explorer to read or edit it.
                </p>
              )}
              <div className="flex gap-5 rounded-xl border bg-muted/20 px-5 py-3">
                {[
                  { k: "Notes", v: overview?.totalNodes ?? 0 },
                  { k: "Links", v: overview?.edges?.length ?? 0 },
                  { k: "Tags", v: tagCounts.length },
                  { k: "Domains", v: Object.keys(overview?.nodesByDomain ?? {}).length },
                ].map((s) => (
                  <div key={s.k} className="min-w-12 text-center">
                    <div className="text-lg font-semibold tabular-nums">{s.v}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.k}</div>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => { setCreatePreset({}); setCreateOpen(true) }}>
                <Plus className="size-4" /> New page
              </Button>
            </div>
          )}
        </main>
      </div>

      {createOpen && (
        <CreateNodeDialog
          key={`${createPreset.domain ?? ""}:${createPreset.parentId ?? ""}`}
          open={createOpen}
          onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreatePreset({}) }}
          slug={slug}
          presetDomain={createPreset.domain}
          presetParentId={createPreset.parentId ?? null}
          parentTitle={createPreset.parentId != null
            ? (overview?.nodes.find((n) => n.id === createPreset.parentId)?.title ?? null)
            : null}
        />
      )}
    </div>
  )
}

// ─── Détail / édition d'un node ───────────────────────────────────────────────

// ─── Niveau "planète" : la note ouverte, ses tags en lunes (orbite). ──────────
const MOON_PALETTE = ["#e0a93b", "#2bb3a3", "#d8588a", "#3fae57", "#3f86e8", "#e05858", "#8d72e0", "#d27c34"]
function moonColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return MOON_PALETTE[h % MOON_PALETTE.length]
}

function PlanetHeader({ node }: { node: KnowledgeNode }) {
  const tags = node.tags ?? []
  const cx = 200, cy = 105, orbit = 74
  const planetColor = node.refType === "PROJECT" && node.refId != null ? moonColor(`p${node.refId}`) : "#6366f1"
  return (
    <div className="mb-5 flex justify-center">
      <svg viewBox="0 0 400 210" className="h-48 w-full max-w-md text-foreground">
        <defs>
          <radialGradient id="planet-glow">
            <stop offset="0%" stopColor={planetColor} stopOpacity="0.5" />
            <stop offset="100%" stopColor={planetColor} stopOpacity="0" />
          </radialGradient>
        </defs>
        {tags.length > 0 && (
          <circle cx={cx} cy={cy} r={orbit} fill="none" stroke="currentColor" strokeOpacity="0.22"
            strokeWidth="1" strokeDasharray="2 6"
            className="animate-[spin_30s_linear_infinite]" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
        )}
        <circle cx={cx} cy={cy} r={48} fill="url(#planet-glow)" className="animate-pulse" />
        <circle cx={cx} cy={cy} r={27} fill={planetColor} />
        <circle cx={cx - 9} cy={cy - 9} r={10} fill="#ffffff" opacity="0.18" />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="700">{node.type}</text>
        {tags.map((t, i) => {
          const a = -Math.PI / 2 + (i / tags.length) * Math.PI * 2
          const mx = cx + Math.cos(a) * orbit, my = cy + Math.sin(a) * orbit
          return (
            <g key={t}>
              <circle cx={mx} cy={my} r={6} fill={moonColor(t)} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
              <text x={mx} y={my - 11} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.75">#{t}</text>
            </g>
          )
        })}
        {tags.length === 0 && (
          <text x={cx} y={cy + 56} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.5">
            no moons - add #tags to link this planet
          </text>
        )}
      </svg>
    </div>
  )
}

function NodeDetail({
  slug,
  node,
  onDelete,
}: {
  slug: string
  node: KnowledgeNode
  onDelete: () => Promise<void>
}) {
  const editNode = useBrainStore((s) => s.editNode)
  const nodes = useBrainStore((s) => s.overview?.nodes ?? [])
  const selectNode = useBrainStore((s) => s.selectNode)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(node.title)
  const [content, setContent] = useState(node.content ?? "")
  const [tags, setTags] = useState<string[]>(node.tags ?? [])
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await editNode(slug, node.id, { title, content, tags })
      toast.success("Node saved")
      setEditing(false)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // Renommage inline du titre (facon Notion) : editable directement en lecture, sans passer par le
  // mode edition complet. Sauve seulement si change + non vide ; Echap annule.
  const commitRename = async () => {
    const t = title.trim()
    if (!t || t === node.title) { setTitle(node.title); return }
    try {
      await editNode(slug, node.id, { title: t })
      toast.success("Page renamed")
    } catch (e) {
      toast.error(getErrorMessage(e))
      setTitle(node.title)
    }
  }

  // Navigation [[wikilink]] → ouvre la note correspondante.
  const openWikiLink = (linkTitle: string) => {
    const target = nodes.find((n) => n.title.toLowerCase() === linkTitle.toLowerCase())
    if (target) selectNode(target.id)
  }

  // Fil d'Ariane : chaine des pages parentes (arbre facon Notion), de la racine jusqu'au parent direct.
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const ancestors = useMemo(() => {
    const chain: KnowledgeNode[] = []
    let cur = node.parentNodeId != null ? nodeById.get(node.parentNodeId) : undefined
    let guard = 0
    while (cur && guard++ < 1000) {
      chain.unshift(cur)
      cur = cur.parentNodeId != null ? nodeById.get(cur.parentNodeId) : undefined
    }
    return chain
  }, [node, nodeById])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-6 py-3">
        <Badge variant="secondary">{node.type}</Badge>
        <Badge variant="outline">{domainLabel(node.domain)}</Badge>
        {node.refType && (
          <Badge variant="outline" className="text-xs">
            {node.refType} #{node.refId}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                <X className="size-4" /> Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                <Save className="size-4" /> Save
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <DeleteConfirmDialog
                title="Delete this note?"
                description={`"${node.title}" will be permanently deleted, along with its links. This action cannot be undone.`}
                confirmLabel="Delete"
                onConfirm={() => { void onDelete() }}
              >
                <Button size="sm" variant="ghost" className="text-destructive">
                  <Trash2 className="size-4" />
                </Button>
              </DeleteConfirmDialog>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-6">
          {editing ? (
            <div className="space-y-3">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-semibold" />
              <MarkdownEditor
                value={content}
                onChange={setContent}
                tags={tags}
                onTagsChange={setTags}
                onUploadFile={async (file) => {
                  const r = await uploadBrainFile(slug, file)
                  return { url: r.url, filename: r.filename, image: r.image }
                }}
              />
            </div>
          ) : (
            <>
              {ancestors.length > 0 && (
                <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {ancestors.map((a) => (
                    <span key={a.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => selectNode(a.id)}
                        className="max-w-[12rem] truncate transition-colors hover:text-foreground hover:underline"
                      >
                        {a.title}
                      </button>
                      <ChevronRight className="size-3 shrink-0 opacity-50" />
                    </span>
                  ))}
                  <span className="truncate font-medium text-foreground/70">{node.title}</span>
                </nav>
              )}
              <PlanetHeader node={node} />
              {/* Titre editable inline (Notion) : clic -> on tape -> Entree/blur sauve, Echap annule. */}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur() }
                  if (e.key === "Escape") { setTitle(node.title); e.currentTarget.blur() }
                }}
                aria-label="Page title"
                className="mb-3 w-full rounded-md bg-transparent text-2xl font-semibold tracking-tight outline-none transition-colors hover:bg-muted/40 focus:bg-transparent"
              />
              {node.tags && node.tags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {node.tags.map((t) => (
                    <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">#{t}</span>
                  ))}
                </div>
              )}
              {node.content ? (
                <Markdown content={node.content} onWikiLink={openWikiLink} className="space-y-3 text-sm leading-relaxed text-foreground/90" />
              ) : (
                <p className="text-sm italic text-muted-foreground">Empty node.</p>
              )}
              <p className="mt-8 text-xs text-muted-foreground">
                Updated {new Date(node.updatedAt).toLocaleString()} · tip:{" "}
                <code className="rounded bg-muted px-1">[[Note title]]</code> to link,{" "}
                <code className="rounded bg-muted px-1">#tag</code> to categorize.
              </p>
              <RelationsPanel node={node} />
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─── Relations d'un node (graphe) ─────────────────────────────────────────────

function RelationsPanel({ node }: { node: KnowledgeNode }) {
  const overview = useBrainStore((s) => s.overview)
  const selectNode = useBrainStore((s) => s.selectNode)

  const edges = overview?.edges ?? []
  const nodes = overview?.nodes ?? []
  const nodeById = (id: number) => nodes.find((n) => n.id === id)
  const related = edges.filter((e) => e.fromNodeId === node.id || e.toNodeId === node.id)

  return (
    <div className="mt-8 border-t pt-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Link2 className="size-4" /> Relations {related.length > 0 && `(${related.length})`}
      </h3>
      {related.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No links. Relations form automatically through{" "}
          <span className="font-medium text-primary">#tags</span> and{" "}
          <code className="rounded bg-muted px-1">[[wikilinks]]</code> in the content.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {related.map((e) => {
            const outgoing = e.fromNodeId === node.id
            const other = nodeById(outgoing ? e.toNodeId : e.fromNodeId)
            return (
              <li key={e.id}>
                <button onClick={() => other && selectNode(other.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm transition-colors hover:bg-accent">
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {outgoing ? "→" : "←"} {e.relationType}{e.auto ? " · auto" : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{other?.title ?? `#${outgoing ? e.toNodeId : e.fromNodeId}`}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Dialog de création ───────────────────────────────────────────────────────

function CreateNodeDialog({
  open,
  onOpenChange,
  slug,
  presetDomain,
  presetParentId = null,
  parentTitle = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  /** Domaine pre-selectionne (racine cliquee ou domaine herite du parent). */
  presetDomain?: string
  /** Page parente si on cree une sous-page (arbre facon Notion). */
  presetParentId?: number | null
  parentTitle?: string | null
}) {
  const addNode = useBrainStore((s) => s.addNode)
  const [type, setType] = useState<string>("NOTE")
  const [domain, setDomain] = useState<string>(presetDomain ?? "PROJET")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setType("NOTE")
    setDomain(presetDomain ?? "PROJET")
    setTitle("")
    setContent("")
  }

  const submit = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await addNode(slug, {
        type, domain, title: title.trim(), content,
        parentNodeId: presetParentId ?? undefined,
      })
      toast.success(presetParentId != null ? "Sub-page created" : "Page created")
      reset()
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{presetParentId != null ? "New sub-page" : "New page"}</DialogTitle>
        </DialogHeader>
        {parentTitle && (
          <p className="-mt-1 text-xs text-muted-foreground">
            Sub-page of <span className="font-medium text-foreground">{parentTitle}</span>
          </p>
        )}
        <div className="mt-2 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NODE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Domain</label>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOMAINS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.code} · {d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. ADR-002 - Cache choice" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Content (markdown)</label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} className="font-mono text-sm" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !title.trim()}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
