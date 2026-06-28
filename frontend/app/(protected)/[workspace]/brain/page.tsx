"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Brain, Plus, Trash2, Save, X, FileText, Search, Sparkles, Network, List, Link2, Unlink } from "lucide-react"

import { useBrainStore } from "@/lib/store/brain-store"
import { BrainGraph } from "@/components/brain/brain-graph"
import type { KnowledgeNode } from "@/lib/api/brain-service"
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

const EDGE_RELATIONS = [
  "RELATES_TO", "SUPERSEDES", "CAUSED_BY", "DECISION_OF", "DEPENDS_ON", "IMPLEMENTS", "REFERENCES",
] as const

const domainLabel = (value: string) => DOMAINS.find((d) => d.value === value)?.label ?? value

export default function BrainPage() {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""

  const {
    overview, loading, error, selectedNodeId, fetchOverview, selectNode, removeNode,
    searchResults, searching, search, clearSearch,
  } = useBrainStore()

  const [createOpen, setCreateOpen] = useState(false)
  const [queryText, setQueryText] = useState("")
  const [view, setView] = useState<"list" | "graph">("list")

  const runSearch = () => search(slug, queryText)
  const onClearSearch = () => {
    setQueryText("")
    clearSearch()
  }

  useEffect(() => {
    if (slug) fetchOverview(slug)
  }, [slug, fetchOverview])

  // Nodes groupés par domaine, triés par code de domaine puis titre.
  const grouped = useMemo(() => {
    const nodes = overview?.nodes ?? []
    const byDomain = new Map<string, KnowledgeNode[]>()
    for (const n of nodes) {
      const arr = byDomain.get(n.domain) ?? []
      arr.push(n)
      byDomain.set(n.domain, arr)
    }
    return Array.from(byDomain.entries())
      .map(([domain, items]) => ({
        domain,
        code: items[0]?.domainCode ?? "99",
        items: [...items].sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [overview])

  const selected = overview?.nodes.find((n) => n.id === selectedNodeId) ?? null

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
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
              onClick={() => setView("list")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                view === "list" ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="size-3.5" /> Liste
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

      {/* Body : navigateur (gauche) + détail (droite) */}
      <div className={`grid min-h-0 flex-1 ${view === "graph" ? "grid-cols-[1fr_360px]" : "grid-cols-[320px_1fr]"}`}>
        {view === "graph" ? (
          /* Vue graphe (SVG force-directed) */
          <div className="min-h-0 border-r">
            <BrainGraph
              nodes={overview?.nodes ?? []}
              edges={overview?.edges ?? []}
              selectedNodeId={selectedNodeId}
              onSelect={selectNode}
            />
          </div>
        ) : (
        /* Colonne gauche : recherche + nodes par domaine */
        <div className="flex min-h-0 flex-col border-r">
          {/* Barre de recherche sémantique */}
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
                placeholder="Recherche sémantique…"
                className="pl-8 pr-8"
              />
              {(queryText || searchResults) && (
                <button
                  onClick={onClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Effacer la recherche"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-3">
              {searchResults ? (
                /* Résultats de recherche classés par pertinence */
                <div>
                  <div className="mb-2 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="size-3" />
                    {searching ? "Recherche…" : `${searchResults.length} résultat(s)`}
                  </div>
                  <div className="space-y-0.5">
                    {searchResults.map((hit) => (
                      <button
                        key={hit.node.id}
                        onClick={() => selectNode(hit.node.id)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                          selectedNodeId === hit.node.id ? "bg-accent font-medium" : ""
                        }`}
                      >
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{hit.node.title}</span>
                        <span className="ml-auto shrink-0 rounded bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                          {(hit.score * 100).toFixed(0)}%
                        </span>
                      </button>
                    ))}
                    {!searching && searchResults.length === 0 && (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                        Aucun résultat. L&apos;assistant d&apos;embedding est peut-être indisponible.
                      </p>
                    )}
                  </div>
                </div>
              ) : loading && !overview ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.domain} className="mb-4">
                    <div className="mb-1 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span className="tabular-nums">{group.code}</span>
                      <span>{domainLabel(group.domain)}</span>
                      <span className="ml-auto rounded bg-muted px-1.5 text-[10px]">{group.items.length}</span>
                    </div>
                    <div className="space-y-0.5">
                      {group.items.map((node) => (
                        <button
                          key={node.id}
                          onClick={() => selectNode(node.id)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                            selectedNodeId === node.id ? "bg-accent font-medium" : ""
                          }`}
                        >
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{node.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
        )}

        {/* Colonne droite : détail du node sélectionné */}
        <div className="min-h-0">
          {selected ? (
            <NodeDetail
              key={selected.id}
              slug={slug}
              node={selected}
              onDelete={async () => removeNode(slug, selected.id)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Brain className="size-10 opacity-30" />
              <p className="text-sm">Sélectionne un node pour le lire ou l&apos;éditer</p>
            </div>
          )}
        </div>
      </div>

      <CreateNodeDialog open={createOpen} onOpenChange={setCreateOpen} slug={slug} />
    </div>
  )
}

// ─── Détail / édition d'un node ───────────────────────────────────────────────

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
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(node.title)
  const [content, setContent] = useState(node.content ?? "")
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await editNode(slug, node.id, { title, content })
      setEditing(false)
    } finally {
      setSaving(false)
    }
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
              <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-6">
          {editing ? (
            <div className="space-y-3">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-semibold" />
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={22}
                className="font-mono text-sm"
                placeholder="Contenu markdown…"
              />
            </div>
          ) : (
            <>
              <h2 className="mb-4 text-xl font-semibold">{node.title}</h2>
              {node.content ? (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/90">
                  {node.content}
                </pre>
              ) : (
                <p className="text-sm italic text-muted-foreground">Node vide.</p>
              )}
              <p className="mt-8 text-xs text-muted-foreground">
                Mis à jour le {new Date(node.updatedAt).toLocaleString()}
              </p>
              <RelationsPanel slug={slug} node={node} />
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─── Relations d'un node (graphe) ─────────────────────────────────────────────

function RelationsPanel({ slug, node }: { slug: string; node: KnowledgeNode }) {
  const overview = useBrainStore((s) => s.overview)
  const linkNodes = useBrainStore((s) => s.linkNodes)
  const unlink = useBrainStore((s) => s.unlink)

  const [targetId, setTargetId] = useState<string>("")
  const [relation, setRelation] = useState<string>("RELATES_TO")
  const [busy, setBusy] = useState(false)

  const edges = overview?.edges ?? []
  const nodes = overview?.nodes ?? []
  const nodeById = (id: number) => nodes.find((n) => n.id === id)
  const related = edges.filter((e) => e.fromNodeId === node.id || e.toNodeId === node.id)
  const candidates = nodes.filter((n) => n.id !== node.id)

  const addLink = async () => {
    if (!targetId) return
    setBusy(true)
    try {
      await linkNodes(slug, node.id, Number(targetId), relation)
      setTargetId("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-8 border-t pt-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Link2 className="size-4" /> Relations ({related.length})
      </h3>

      {related.length > 0 && (
        <ul className="mb-3 space-y-1">
          {related.map((e) => {
            const outgoing = e.fromNodeId === node.id
            const other = nodeById(outgoing ? e.toNodeId : e.fromNodeId)
            return (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {outgoing ? "→" : "←"} {e.relationType}
                </span>
                <span className="truncate">{other?.title ?? `#${outgoing ? e.toNodeId : e.fromNodeId}`}</span>
                <button
                  onClick={() => unlink(slug, e.id)}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  aria-label="Supprimer la relation"
                >
                  <Unlink className="size-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Select value={relation} onValueChange={setRelation}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EDGE_RELATIONS.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={targetId} onValueChange={setTargetId}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue placeholder="Lier à un node…" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((n) => (
              <SelectItem key={n.id} value={String(n.id)}>{n.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={addLink} disabled={busy || !targetId}>
          Lier
        </Button>
      </div>
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
