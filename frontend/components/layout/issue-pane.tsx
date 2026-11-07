"use client"

import { useEffect, useState, type ReactNode } from "react"
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react"

import { IssueDetail, type SheetIssue } from "@/components/sheets/issue-sheet"
import { getIssue, type Issue } from "@/lib/api/issue-service"
import { fillText } from "@/lib/delivery/result-card"
import { useIssueStore } from "@/lib/store/issue-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import type { IssueTarget } from "@/lib/window/address"

const ICON_BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"

/** L'issue de l'API, telle que son contenu la lit : la date d'échéance brute, que son sélecteur relit. */
export function toSheetIssue(issue: Issue): SheetIssue {
  return {
    id: String(issue.id),
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? undefined,
    priority: issue.priority,
    statusId: issue.status.id,
    statusName: issue.status.name,
    statusCategory: issue.status.category,
    assignee: issue.assignee
      ? {
          name: issue.assignee.displayName ?? issue.assignee.email,
          email: issue.assignee.email,
          userId: issue.assignee.id,
          avatarUrl: issue.assignee.avatarUrl,
        }
      : null,
    assigneeId: issue.assignee?.id ?? null,
    labels: issue.labels,
    pinned: issue.pinned,
    archived: issue.archived,
    dueDate: issue.dueDate,
    storyPoints: issue.storyPoints,
    createdAt: issue.createdAt,
  }
}

const keyOf = (target: IssueTarget): string => `${target.projectId}:${target.issueId ?? target.key}`

const matches = (target: IssueTarget) => (issue: Issue): boolean =>
  target.issueId !== null ? issue.id === target.issueId : issue.identifier === target.key

/**
 * L'issue telle qu'elle était à son ouverture : son contenu garde ses propres valeurs pendant qu'on l'édite, comme la
 * fiche le faisait. Une autre issue la remonte (`key`).
 */
function OpenedIssue({ slug, issue, onClose }: Readonly<{ slug: string; issue: Issue; onClose: () => void }>) {
  const [opened] = useState(() => toSheetIssue(issue))
  return <IssueDetail issue={opened} onClose={onClose} workspaceSlug={slug} projectId={issue.projectId} />
}

/**
 * L'issue dans le volet (R120, séance n°18 ; constat 5 de la revue UX) : par-dessus l'écran qui la liste, jamais
 * par-dessus la fenêtre, avec une flèche de retour et son fil d'Ariane (« Board › OPS-35 »). L'écran d'en dessous reste
 * monté : le retour le retrouve tel qu'il était, son défilement et ses filtres compris. L'issue vient du tableau déjà
 * chargé quand il la montre, sinon de l'API ; par sa clé, elle se cherche dans le tableau de son projet.
 */
export function IssuePane({ slug, target, under, actions, onBack }: Readonly<{
  slug: string
  target: IssueTarget
  /** L'écran que l'issue recouvre, le début du fil d'Ariane. */
  under: string
  /** Les boutons du volet (la pleine largeur, la fermeture), à la droite de sa ligne. */
  actions?: ReactNode
  onBack: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.window)
  const key = keyOf(target)
  const listed = useIssueStore((s) => (s.loadedProjectId === target.projectId ? s.issues.find(matches(target)) : undefined))
  const boardLoaded = useIssueStore((s) => s.loadedProjectId === target.projectId && !s.isLoading)
  const [fetched, setFetched] = useState<{ key: string; issue: Issue } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const found = listed !== undefined
  const issueId = target.issueId

  useEffect(() => {
    if (found || issueId === null) return
    let live = true
    getIssue(slug, target.projectId, issueId)
      .then((issue) => { if (live) setFetched({ key, issue }) })
      .catch(() => { if (live) setFailed(key) })
    return () => { live = false }
  }, [slug, key, target.projectId, issueId, found, attempt])

  const issue = listed ?? (fetched?.key === key ? fetched.issue : undefined)
  const shownKey = issue?.identifier ?? target.key ?? `#${target.issueId}`
  const missing = !issue && target.issueId === null && boardLoaded
  const broken = !issue && failed === key

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border pl-2 pr-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={fillText(t.backTo, { screen: under })}
          title={fillText(t.backTo, { screen: under })}
          className={ICON_BUTTON}
        >
          <ArrowLeft className="size-4" />
        </button>
        <nav aria-label={shownKey} className="flex min-w-0 flex-1 items-center gap-1 text-[13px]">
          <button type="button" onClick={onBack} className="shrink-0 rounded px-1 text-muted-foreground transition-colors duration-150 hover:text-foreground">
            {under}
          </button>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span aria-current="page" className="min-w-0 truncate font-medium text-foreground">{shownKey}</span>
        </nav>
        {actions}
      </div>
      {issue ? (
        <OpenedIssue key={key} slug={slug} issue={issue} onClose={onBack} />
      ) : missing || broken ? (
        <div className="flex flex-col items-start gap-2 p-6 text-sm text-muted-foreground">
          <p>{missing ? fillText(t.issueMissing, { key: shownKey }) : t.issueFailed}</p>
          {broken && (
            <button type="button" onClick={() => { setFailed(null); setAttempt((n) => n + 1) }} className="text-foreground underline underline-offset-2">
              {t.retry}
            </button>
          )}
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t.issueLoading}
        </p>
      )}
    </div>
  )
}
