"use client"

import { useMemo, useState } from "react"
import { ChevronRight, FileText, Folder, FolderOpen, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import type { KnowledgeNode } from "@/lib/api/brain-service"

interface DomainDef { value: string; code: string; label: string }

interface PageTreeProps {
  /** Nodes visibles (deja filtres system/tag par le parent). */
  nodes: KnowledgeNode[]
  domains: DomainDef[]
  selectedNodeId: number | null
  activeTag: string | null
  onSelect: (id: number) => void
  /** Creer une page : sous un domaine (parentId null) ou sous une page (parentId). */
  onNewPage: (domain: string, parentId: number | null) => void
}

/**
 * Arbre de pages facon Notion. Les 16 domaines sont les racines ; les pages se nichent dessous via
 * {@code parentNodeId} (recursif). Une page dont le parent n'est pas dans l'ensemble visible (filtre
 * tag, node system masque) remonte au niveau racine de son domaine -> aucune page ne disparait.
 */
export function PageTree({ nodes, domains, selectedNodeId, activeTag, onSelect, onNewPage }: Readonly<PageTreeProps>) {
  const [openDomains, setOpenDomains] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const { childrenOf, rootsByDomain, countByDomain, byId } = useMemo(() => {
    const byId = new Map<number, KnowledgeNode>()
    for (const n of nodes) byId.set(n.id, n)
    const childrenOf = new Map<number, KnowledgeNode[]>()
    const rootsByDomain = new Map<string, KnowledgeNode[]>()
    const countByDomain = new Map<string, number>()
    for (const n of nodes) {
      countByDomain.set(n.domain, (countByDomain.get(n.domain) ?? 0) + 1)
      if (n.parentNodeId != null && byId.has(n.parentNodeId)) {
        const arr = childrenOf.get(n.parentNodeId) ?? []
        arr.push(n); childrenOf.set(n.parentNodeId, arr)
      } else {
        const arr = rootsByDomain.get(n.domain) ?? []
        arr.push(n); rootsByDomain.set(n.domain, arr)
      }
    }
    const byTitle = (a: KnowledgeNode, b: KnowledgeNode) => a.title.localeCompare(b.title)
    for (const arr of childrenOf.values()) arr.sort(byTitle)
    for (const arr of rootsByDomain.values()) arr.sort(byTitle)
    return { childrenOf, rootsByDomain, countByDomain, byId }
  }, [nodes])

  // Chemin des ancetres de la selection -> on le deplie (la page selectionnee se revele toujours).
  const ancestors = useMemo(() => {
    const set = new Set<number>()
    let cur = selectedNodeId != null ? byId.get(selectedNodeId) : undefined
    let guard = 0
    while (cur?.parentNodeId != null && guard++ < 1000) {
      set.add(cur.parentNodeId)
      cur = byId.get(cur.parentNodeId)
    }
    return set
  }, [selectedNodeId, byId])

  const selectedDomain = selectedNodeId != null ? byId.get(selectedNodeId)?.domain : undefined
  const isDomainOpen = (d: string) => openDomains.has(d) || selectedDomain === d || activeTag != null
  const isExpanded = (id: number) => expanded.has(id) || ancestors.has(id)

  const toggleDomain = (d: string) =>
    setOpenDomains((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n })
  const togglePage = (id: number) =>
    setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  function renderNode(node: KnowledgeNode, depth: number) {
    const kids = childrenOf.get(node.id) ?? []
    const hasKids = kids.length > 0
    const open = isExpanded(node.id)
    const active = selectedNodeId === node.id
    return (
      <div key={node.id}>
        <div
          className={cn("group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-accent", active && "bg-accent")}
          style={{ paddingLeft: depth * 12 }}
        >
          <button
            type="button"
            onClick={() => hasKids && togglePage(node.id)}
            aria-label={hasKids ? (open ? "Collapse" : "Expand") : undefined}
            className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90", !hasKids && "opacity-0")} />
          </button>
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className={cn("flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm", active ? "font-medium text-foreground" : "text-foreground/80")}
          >
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{node.title}</span>
          </button>
          <button
            type="button"
            onClick={() => onNewPage(node.domain, node.id)}
            title="New sub-page"
            aria-label="New sub-page"
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        {hasKids && open && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    )
  }

  const shownDomains = domains.filter((d) => !activeTag || (rootsByDomain.get(d.value)?.length ?? 0) > 0)

  return (
    <div>
      {shownDomains.map((d) => {
        const roots = rootsByDomain.get(d.value) ?? []
        const open = isDomainOpen(d.value)
        const count = countByDomain.get(d.value) ?? 0
        return (
          <div key={d.value}>
            <div className="group flex items-center gap-1 rounded-md pr-1 hover:bg-accent">
              <button
                type="button"
                onClick={() => toggleDomain(d.value)}
                className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90", count === 0 && "opacity-40")} />
                {open ? <FolderOpen className="size-3.5 shrink-0" /> : <Folder className={cn("size-3.5 shrink-0", count === 0 && "opacity-40")} />}
                <span className="min-w-0 flex-1 truncate">{d.code} · {d.label}</span>
                <span className={cn("shrink-0 rounded px-1 text-[10px]", count ? "bg-muted" : "text-muted-foreground/40")}>{count}</span>
              </button>
              <button
                type="button"
                onClick={() => onNewPage(d.value, null)}
                title="New page"
                aria-label="New page"
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            {open && roots.length > 0 && (
              <div className="ml-2 border-l pl-1">{roots.map((r) => renderNode(r, 0))}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
