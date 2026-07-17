"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import {
  Brain, Plus, Trash2, Save, X, FileText, Search, Sparkles, Network, Link2,
  ChevronRight, Folder, FolderOpen, Tag as TagIcon, PanelLeftClose, PanelLeftOpen, Eye, EyeOff,
} from "lucide-react"

import { useBrainStore } from "@/lib/store/brain-store"
import { useProjectStore } from "@/lib/store/project-store"
import dynamic from "next/dynamic"

const BrainGraph = dynamic(
  () => import("@/components/brain/brain-graph").then((m) => m.BrainGraph),
  { ssr: false, loading: () => <div className="h-full w-full bg-muted/20" /> },
)
import { MarkdownEditor } from "@/components/brain/markdown-editor"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { DeleteConfirmDialog } from "@/components/dialogs/delete-confirm-dialog"
import { uploadBrainFile, type KnowledgeNode } from "@/lib/api/brain-service"
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
  { value: "PROJET", code: "01", label: "Projet" },
  { value: "PRODUIT", code: "02", label: "Produit" },
  { value: "ARCHITECTURE", code: "03", label: "Architecture" },
  { value: "ENGINEERING", code: "04", label: "Engineering" },
  { value: "API", code: "05", label: "API" },
  { value: "INFRA", code: "06", label: "Infrastructure" },
  { value: "SECURITE", code: "07", label: "Sécurité" },
  { value: "OPERATIONS", code: "08", label: "Opérations" },
  { value: "AUDITS", code: "09", label: "Audits" },
  { value: "RUNBOOKS", code: "10", label: "Runbooks" },
  { value: "PCA_PRA", code: "11", label: "PCA / PRA" },
  { value: "DECISIONS", code: "12", label: "Décisions" },
  { value: "ROADMAP", code: "13", label: "Roadmap" },
  { value: "DESIGN", code: "14", label: "Design" },
  { value: "UTILISATEUR", code: "15", label: "Utilisateur" },
  { value: "HISTORIQUE", code: "16", label: "Historique" },
  { value: "ARCHIVE", code: "20", label: "Archive" },
]

const domainLabel = (value: string) => DOMAINS.find((d) => d.value === value)?.label ?? value

export default function BrainPage() {
  const params = useParams()
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
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())
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

  // Notes regroupées par domaine. Les dossiers vides restent visibles (squelette d'architecture) :
  // au démarrage le vault n'a pas de notes, juste les dossiers — l'agent le remplit ensuite.
  const nodesByDomain = useMemo(() => {
    const m = new Map<string, KnowledgeNode[]>()
    for (const n of filteredNodes) {
      const arr = m.get(n.domain) ?? []
      arr.push(n)
      m.set(n.domain, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.title.localeCompare(b.title))
    return m
  }, [filteredNodes])

  const selected = overview?.nodes.find((n) => n.id === selectedNodeId) ?? null

  const toggleTag = (t: string) => setActiveTag((cur) => (cur === t ? null : t))
  const toggleFolder = (d: string) =>
    setOpenFolders((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n })
  const folderOpen = (d: string) => openFolders.has(d) || selected?.domain === d || activeTag != null

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setExplorerOpen((v) => !v)} aria-label="Afficher/masquer l'explorateur"
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
              {overview?.templateType ? ` · gabarit ${overview.templateType}` : ""}
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
              <FileText className="size-3.5" /> Éditeur
            </button>
            <button
              onClick={() => setView("graph")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                view === "graph" ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Network className="size-3.5" /> Graphe
            </button>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Nouveau node
          </Button>
        </div>
      </div>

      {error && (
        <div className="m-6 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Body : 2 panneaux façon Obsidian — explorateur (animé) | éditeur central */}
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
                placeholder="Rechercher…"
                className="pl-8 pr-8"
              />
              {(queryText || searchResults) && (
                <button onClick={onClearSearch} aria-label="Effacer la recherche"
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
                    {searching ? "Recherche…" : `${searchResults.length} résultat(s)`}
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
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">Aucun résultat.</p>
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
                      <X className="size-3" /> Filtre #{activeTag}
                    </button>
                  )}
                  {/* Arborescence : tous les dossiers (domaines) visibles, même vides */}
                  {DOMAINS.filter((d) => !activeTag || (nodesByDomain.get(d.value)?.length ?? 0) > 0).map((d) => {
                    const items = nodesByDomain.get(d.value) ?? []
                    const hasItems = items.length > 0
                    const open = hasItems && folderOpen(d.value)
                    return (
                      <div key={d.value}>
                        <button onClick={() => hasItems && toggleFolder(d.value)}
                          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                          <ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""} ${hasItems ? "" : "opacity-0"}`} />
                          {open ? <FolderOpen className="size-3.5 shrink-0" /> : <Folder className={`size-3.5 shrink-0 ${hasItems ? "" : "opacity-40"}`} />}
                          <span className="min-w-0 flex-1 truncate">{d.code} · {d.label}</span>
                          <span className={`shrink-0 rounded px-1 text-[10px] ${hasItems ? "bg-muted" : "text-muted-foreground/40"}`}>{items.length}</span>
                        </button>
                        {open && (
                          <div className="ml-3 border-l pl-1">
                            {items.map((node) => (
                              <button key={node.id} onClick={() => { selectNode(node.id); setView("editor") }}
                                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent ${
                                  selectedNodeId === node.id ? "bg-accent font-medium text-foreground" : "text-foreground/80"
                                }`}>
                                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate">{node.title}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}

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

                  {/* Noyau système (hub règles / AGENTS) — caché par défaut (expertise) */}
                  <div className="mt-3 border-t pt-2">
                    <button onClick={() => setShowSystem((v) => !v)}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                      {showSystem ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      {showSystem ? "Masquer le noyau" : "Afficher le noyau (règles agent)"}
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
              onDelete={async () => removeNode(slug, selected.id)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Brain className="size-7" />
              </div>
              {(overview?.totalNodes ?? 0) === 0 ? (
                <div className="max-w-sm space-y-2">
                  <p className="text-base font-semibold">Votre Brain est prêt</p>
                  <p className="text-sm text-muted-foreground">
                    Les dossiers à gauche sont l&apos;architecture de base. Les notes se créent et se classent
                    automatiquement au fil de vos projets — ou ajoutez-en une à la main.
                  </p>
                </div>
              ) : (
                <p className="max-w-sm text-sm text-muted-foreground">
                  Sélectionnez une note dans l&apos;explorateur pour la lire ou l&apos;éditer.
                </p>
              )}
              <div className="flex gap-5 rounded-xl border bg-muted/20 px-5 py-3">
                {[
                  { k: "Notes", v: overview?.totalNodes ?? 0 },
                  { k: "Liens", v: overview?.edges?.length ?? 0 },
                  { k: "Tags", v: tagCounts.length },
                  { k: "Domaines", v: Object.keys(overview?.nodesByDomain ?? {}).length },
                ].map((s) => (
                  <div key={s.k} className="min-w-12 text-center">
                    <div className="text-lg font-semibold tabular-nums">{s.v}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.k}</div>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" /> Nouvelle note
              </Button>
            </div>
          )}
        </main>
      </div>

      <CreateNodeDialog open={createOpen} onOpenChange={setCreateOpen} slug={slug} />
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
            aucune lune — ajoute des #tags pour relier cette planète
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
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  // Navigation [[wikilink]] → ouvre la note correspondante.
  const openWikiLink = (linkTitle: string) => {
    const target = nodes.find((n) => n.title.toLowerCase() === linkTitle.toLowerCase())
    if (target) selectNode(target.id)
  }

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
                <X className="size-4" /> Annuler
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                <Save className="size-4" /> Enregistrer
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Éditer
              </Button>
              <DeleteConfirmDialog
                title="Supprimer cette note ?"
                description={`« ${node.title} » sera définitivement supprimée, ainsi que ses liens. Cette action est irréversible.`}
                confirmLabel="Supprimer"
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
              <PlanetHeader node={node} />
              <h2 className="mb-3 text-xl font-semibold">{node.title}</h2>
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
                <p className="text-sm italic text-muted-foreground">Node vide.</p>
              )}
              <p className="mt-8 text-xs text-muted-foreground">
                Mis à jour le {new Date(node.updatedAt).toLocaleString()} · astuce :{" "}
                <code className="rounded bg-muted px-1">[[Titre d&apos;une note]]</code> pour lier,{" "}
                <code className="rounded bg-muted px-1">#tag</code> pour classer.
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
          Aucun lien. Les relations se tissent automatiquement via les{" "}
          <span className="font-medium text-primary">#tags</span> et les{" "}
          <code className="rounded bg-muted px-1">[[wikilinks]]</code> du contenu.
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
}) {
  const addNode = useBrainStore((s) => s.addNode)
  const [type, setType] = useState<string>("NOTE")
  const [domain, setDomain] = useState<string>("PROJET")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setType("NOTE")
    setDomain("PROJET")
    setTitle("")
    setContent("")
  }

  const submit = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await addNode(slug, { type, domain, title: title.trim(), content })
      reset()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau node</DialogTitle>
        </DialogHeader>
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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Domaine</label>
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Titre</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. ADR-002 — Choix du cache" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Contenu (markdown)</label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} className="font-mono text-sm" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving || !title.trim()}>
            {saving ? "Création…" : "Créer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
