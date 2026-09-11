"use client"

import { useMemo, useState } from "react"
import { ChevronRight, FileText, Folder, FolderOpen, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import type { KnowledgeNode } from "@/lib/api/brain-service"

interface DomainDef { value: string; code: string; label: string }

interface PageTreeProps {
  /** Nodes visibles (deja filtres system/tag par le parent). */
  nodes: KnowledgeNode[]
  /** Conserve pour compat (le create-page derive desormais le domaine du parent). */
  domains: DomainDef[]
  selectedNodeId: number | null
  activeTag: string | null
  onSelect: (id: number) => void
  /** Creer une page : sous une page (parentId) ou a la racine (parentId null). */
  onNewPage: (domain: string, parentId: number | null) => void
  /** Deplacer une page (drag-to-nest) : sous une page (parentId) ou a la racine (parentId null). */
  onMove: (nodeId: number, parentId: number | null, domain: string) => void
}

/** Titre court : dernier segment apres « › » (l'arbre montre deja la hierarchie, le chemin complet est redondant). */
function shortLabel(title: string): string {
  return title.includes(" › ") ? title.slice(title.lastIndexOf(" › ") + 3) : title
}

/**
 * Arbre de pages regroupe par **CONTAINMENT** (Brain OS / espace -> projets -> systemes -> notes) via
 * {@code parentNodeId}, PAS par domaine : on suit la vraie hierarchie, comme le graphe. Titres courts
 * (dernier segment). Le hub « Brain OS » est la racine ; les pages orphelines s'y raccrochent (une seule
 * arborescence, jamais d'ilots). Seul le hub est deplie par defaut. Navigation clavier + drag-to-nest.
 */
export function PageTree({ nodes, selectedNodeId, onSelect, onNewPage, onMove }: Readonly<PageTreeProps>) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [dragId, setDragId] = useState<number | null>(null)
  const [dropId, setDropId] = useState<number | null>(null)

  const { childrenOf, byId, root } = useMemo(() => {
    const byId = new Map<number, KnowledgeNode>()
    for (const n of nodes) byId.set(n.id, n)
    // Racine = le hub « Brain OS » (le gabarit le pose en racine). Repli : la premiere racine.
    const root = [...byId.values()].find((n) => n.title === "Brain OS")
      ?? [...byId.values()].find((n) => n.parentNodeId == null || !byId.has(n.parentNodeId))
      ?? null
    const childrenOf = new Map<number, KnowledgeNode[]>()
    for (const n of nodes) {
      if (root && n.id === root.id) continue
      const raw = n.parentNodeId
      // Parent hors ensemble visible (filtre tag / plafond) -> on raccroche au hub plutot que d'orpheliner.
      const pid = raw != null && byId.has(raw) ? raw : root ? root.id : null
      if (pid == null) continue
      const arr = childrenOf.get(pid) ?? []
      arr.push(n); childrenOf.set(pid, arr)
    }
    // Conteneurs (projets, systemes) d'abord, puis feuilles ; a rang egal, par titre.
    const rank = (n: KnowledgeNode) => ((childrenOf.get(n.id)?.length ?? 0) > 0 ? 0 : 1)
    for (const arr of childrenOf.values()) arr.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
    return { childrenOf, byId, root }
  }, [nodes])

  // Chemin des ancetres de la selection -> deplie (la page selectionnee se revele toujours).
  const ancestors = useMemo(() => {
    const set = new Set<number>()
    let cur = selectedNodeId != null ? byId.get(selectedNodeId) : undefined
    let guard = 0
    while (cur?.parentNodeId != null && guard++ < 1000) { set.add(cur.parentNodeId); cur = byId.get(cur.parentNodeId) }
    return set
  }, [selectedNodeId, byId])

  // Descendants (+ la page draguee) : cibles de drop interdites (anti-cycle cote UI).
  const dragBlocked = useMemo(() => {
    const set = new Set<number>()
    if (dragId == null) return set
    const stack = [dragId]; let guard = 0
    while (stack.length && guard++ < 20000) { const id = stack.pop()!; set.add(id); for (const c of childrenOf.get(id) ?? []) stack.push(c.id) }
    return set
  }, [dragId, childrenOf])

  // Le hub est deplie PAR DEFAUT (on voit Brain OS -> projets d'emblee) : pour lui, `expanded` = REPLIE
  // (appartenance inversee) -> pas de setState dans un effet, le clic replie/deplie comme attendu.
  const isExpanded = (id: number) =>
    root && id === root.id ? !expanded.has(id) : expanded.has(id) || ancestors.has(id)
  const togglePage = (id: number) =>
    setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const dropOnPage = (target: KnowledgeNode) => {
    if (dragId != null && !dragBlocked.has(target.id)) onMove(dragId, target.id, target.domain)
    setDragId(null); setDropId(null)
  }

  // Navigation clavier (roving focus dans l'ordre visuel du DOM).
  const onTreeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-tree-row]"))
    const idx = rows.indexOf(document.activeElement as HTMLElement)
    if (e.key === "ArrowDown") { e.preventDefault(); rows[Math.min(idx + 1, rows.length - 1)]?.focus() }
    else if (e.key === "ArrowUp") { e.preventDefault(); rows[Math.max(idx - 1, 0)]?.focus() }
    else if (idx >= 0) {
      const id = Number(rows[idx].getAttribute("data-node-id"))
      if (!Number.isFinite(id) || (childrenOf.get(id)?.length ?? 0) === 0) return
      e.preventDefault()
      if (e.key === "ArrowRight" && !isExpanded(id)) togglePage(id)
      if (e.key === "ArrowLeft" && isExpanded(id)) togglePage(id)
    }
  }

  function renderNode(node: KnowledgeNode, depth: number) {
    const kids = childrenOf.get(node.id) ?? []
    const hasKids = kids.length > 0
    const open = isExpanded(node.id)
    const active = selectedNodeId === node.id
    const isDrop = dropId === node.id
    const Icon = hasKids ? (open ? FolderOpen : Folder) : FileText
    return (
      <div key={node.id}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-accent",
            active && "bg-accent",
            isDrop && "ring-1 ring-inset ring-primary bg-primary/5",
          )}
          style={{ paddingLeft: depth * 12 }}
          onDragOver={(e) => { if (dragId != null && !dragBlocked.has(node.id)) { e.preventDefault(); setDropId(node.id) } }}
          onDragLeave={() => setDropId((k) => (k === node.id ? null : k))}
          onDrop={(e) => { e.preventDefault(); dropOnPage(node) }}
        >
          <button
            type="button"
            onClick={() => hasKids && togglePage(node.id)}
            aria-label={hasKids ? (open ? "Collapse" : "Expand") : undefined}
            tabIndex={-1}
            className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90", !hasKids && "opacity-0")} />
          </button>
          <button
            type="button"
            draggable
            data-tree-row
            data-node-id={node.id}
            onDragStart={() => setDragId(node.id)}
            onDragEnd={() => { setDragId(null); setDropId(null) }}
            onClick={() => onSelect(node.id)}
            className={cn(
              "flex min-w-0 flex-1 cursor-grab items-center gap-1.5 py-1 text-left text-sm active:cursor-grabbing",
              active ? "font-medium text-foreground" : "text-foreground/80",
            )}
          >
            <Icon className={cn("size-3.5 shrink-0", hasKids ? "text-muted-foreground" : "text-muted-foreground/70")} />
            <span className="min-w-0 flex-1 truncate">{shortLabel(node.title)}</span>
            {hasKids && <span className="shrink-0 rounded px-1 text-[10px] tabular-nums text-muted-foreground/60">{kids.length}</span>}
          </button>
          <button
            type="button"
            onClick={() => onNewPage(node.domain, node.id)}
            title="New sub-page"
            aria-label="New sub-page"
            tabIndex={-1}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        {hasKids && open && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    )
  }

  if (!root) return <p className="px-2 py-3 text-sm text-muted-foreground">No pages yet.</p>
  return <div onKeyDown={onTreeKeyDown}>{renderNode(root, 0)}</div>
}
