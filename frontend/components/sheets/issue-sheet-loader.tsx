"use client"

import { useEffect, useState } from "react"

import { IssueSheet, type SheetIssue } from "@/components/sheets/issue-sheet"
import { getIssue, type Issue, type IssuePriority } from "@/lib/api/issue-service"

/** Cible d'ouverture : une issue, identifiée par son projet. */
export interface IssueSheetTarget {
  readonly projectId: number
  readonly issueId: number
}

/** `/{slug}/projects/{projectId}/issues/{issueId}` → cible exploitable par le sheet. */
const ISSUE_URL_PATTERN = /\/projects\/(\d+)\/issues\/(\d+)\/?$/

/**
 * Extrait la cible d'une URL d'issue. Renvoie `null` si l'URL ne pointe pas sur une issue
 * (ex. un signal de surcharge pointe vers la fiche d'un membre) — l'appelant retombe alors
 * sur une navigation classique.
 */
export function parseIssueTarget(url: string | null | undefined): IssueSheetTarget | null {
  if (!url) return null
  const match = ISSUE_URL_PATTERN.exec(url)
  return match ? { projectId: Number(match[1]), issueId: Number(match[2]) } : null
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-500", "bg-amber-500", "bg-indigo-500",
]

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { month: "short", day: "numeric" })
  } catch {
    return null
  }
}

/** Convertit une Issue de l'API en SheetIssue (format attendu par IssueSheet). */
export function toSheetIssue(issue: Issue): SheetIssue {
  const priorityMap: Record<IssuePriority, SheetIssue["priority"]> = {
    NONE: "NONE", URGENT: "URGENT", HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW",
  }
  return {
    id:             String(issue.id),
    identifier:     issue.identifier,
    title:          issue.title,
    description:    issue.description ?? undefined,
    priority:       priorityMap[issue.priority],
    statusId:       issue.status.id,
    statusName:     issue.status.name,
    statusCategory: issue.status.category,
    assignee:       issue.assignee
      ? {
          initials: issue.assignee.email.slice(0, 2).toUpperCase(),
          color:    AVATAR_COLORS[issue.assignee.id % AVATAR_COLORS.length],
          name:     issue.assignee.displayName ?? issue.assignee.email,
          email:    issue.assignee.email,
          userId:   issue.assignee.id,
          avatarUrl: issue.assignee.avatarUrl,
        }
      : null,
    assigneeId:  issue.assignee?.id ?? null,
    labels:      issue.labels,
    pinned:      issue.pinned,
    archived:    issue.archived,
    dueDate:     formatDate(issue.dueDate),
    storyPoints: null,
    createdAt:   formatDate(issue.createdAt) ?? issue.createdAt,
  }
}

/**
 * Ouvre le sheet d'une issue depuis n'importe quelle liste (Signals, Ma file…) : charge
 * l'issue à la demande et la rend dans le sheet partagé, **sans quitter la page courante**.
 * On garde ainsi le contexte de triage ; la pleine page reste accessible par un lien explicite.
 */
export function IssueSheetLoader({
  slug,
  target,
  onClose,
}: Readonly<{ slug: string; target: IssueSheetTarget | null; onClose: () => void }>) {
  // L'issue chargée est mémorisée AVEC la clé de la cible qui l'a produite. On en dérive ensuite
  // ce qu'on affiche : plus besoin de remettre l'état à null dans un effet quand la cible change,
  // et surtout aucun risque d'afficher brièvement l'issue précédente pendant le chargement.
  const [loaded, setLoaded] = useState<{ key: string; issue: SheetIssue } | null>(null)

  // Dépendances primitives : `target` est recréé à chaque rendu du parent.
  const projectId = target?.projectId ?? null
  const issueId = target?.issueId ?? null
  const key = projectId !== null && issueId !== null ? `${projectId}:${issueId}` : null

  useEffect(() => {
    if (projectId === null || issueId === null || key === null) return
    let active = true
    getIssue(slug, projectId, issueId)
      .then((issue) => { if (active) setLoaded({ key, issue: toSheetIssue(issue) }) })
      .catch(() => { /* le sheet reste en état de chargement ; l'appelant peut refermer */ })
    return () => { active = false }
  }, [slug, projectId, issueId, key])

  const issue = loaded !== null && loaded.key === key ? loaded.issue : null

  return (
    <IssueSheet
      issue={issue}
      open={target !== null}
      onOpenChange={(open) => { if (!open) onClose() }}
      workspaceSlug={slug}
      projectId={target?.projectId}
    />
  )
}
