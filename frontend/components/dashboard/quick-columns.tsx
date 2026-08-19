"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"
import { Plus } from "lucide-react"

import { SectionCard } from "@/components/ui/section-card"
import { ProjectIcon } from "@/components/ui/project-icon"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjectStore } from "@/lib/store/project-store"
import { useCreateProjectStore } from "@/lib/store/create-project-store"
import { listMyIssuesQuiet } from "@/lib/api/dashboard-card-service"
import type { Issue } from "@/lib/api/issue-service"
import { listNotifications, type NotificationResponse } from "@/lib/api/notification-service"

const MAX_ROWS = 5

// ---------------------------------------------------------------------------
// États partagés des colonnes
// ---------------------------------------------------------------------------

function ColumnSkeleton() {
  return (
    <div className="space-y-2.5 p-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  )
}

/** État vide honnête d'une colonne — jamais de donnée fabriquée. */
function ColumnEmpty({ message }: { readonly message: string }) {
  return <p className="px-4 py-8 text-center text-xs text-muted-foreground/60">{message}</p>
}

const ROW_CLASS =
  "flex items-center gap-2.5 border-b border-border px-4 py-2.5 transition-colors last:border-0 hover:bg-muted/50"

// ---------------------------------------------------------------------------
// Opérations — projets réels (store partagé avec les cartes santé/kpi)
// ---------------------------------------------------------------------------

function OperationsColumn() {
  const projects = useProjectStore((s) => s.projects)
  const isLoading = useProjectStore((s) => s.isLoading)
  const openCreateProject = useCreateProjectStore((s) => s.openCreateProject)

  // Actives d'abord, archivées exclues — la page complète reste à un clic (en-tête).
  const rows = projects
    .filter((p) => p.status !== "ARCHIVED")
    .sort((a, b) => (a.status === "ACTIVE" ? 0 : 1) - (b.status === "ACTIVE" ? 0 : 1))
    .slice(0, MAX_ROWS)

  return (
    <SectionCard title="Operations" href="./projects" bodyClassName="p-0">
      {isLoading && projects.length === 0 ? (
        <ColumnSkeleton />
      ) : (
        <div className="flex h-full flex-col">
          {rows.length === 0 && <ColumnEmpty message="No operations yet" />}
          {rows.map((p) => (
            <Link key={p.id} href={`./projects/${p.id}`} className={ROW_CLASS}>
              <ProjectIcon iconUrl={p.iconUrl} name={p.name} color={p.color} size={22} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{p.name}</span>
              <span className="shrink-0 font-mono text-[11px] uppercase text-muted-foreground">{p.identifier}</span>
            </Link>
          ))}
          {/* Tuile fantôme : ouvre le modal GLOBAL de création en place (plus de navigation `?new=1`). */}
          <div className="mt-auto p-2">
            {/* `text-muted-foreground` sans le modificateur `/70` : l'opacité faisait tomber le
                contraste sous le seuil WCAG AA (audit axe-core du 22/07). La couleur reste
                discrète sans être illisible. */}
            <button
              type="button"
              onClick={openCreateProject}
              data-tour="create-operation"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/30 hover:text-primary"
            >
              <Plus className="size-3.5" /> Create an operation
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Ma file — top 5 de mes issues ouvertes (endpoint my-issues réel)
// ---------------------------------------------------------------------------

function MyQueueColumn({ slug }: { readonly slug: string }) {
  // null = chargement en cours (distinct d'une liste vide réelle).
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!slug) return
    let alive = true
    setIssues(null)
    setFailed(false)
    listMyIssuesQuiet(slug)
      .then((d) => {
        if (alive) setIssues(d)
      })
      .catch(() => {
        if (alive) {
          setIssues([])
          setFailed(true)
        }
      })
    return () => {
      alive = false
    }
  }, [slug])

  const open = (issues ?? [])
    .filter((i) => !i.archived && i.status.category !== "COMPLETED" && i.status.category !== "CANCELLED")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_ROWS)

  return (
    <SectionCard title="Ma file" href="./my-work" bodyClassName="p-0">
      {issues === null ? (
        <ColumnSkeleton />
      ) : open.length === 0 ? (
        <ColumnEmpty message={failed ? "Queue unavailable right now" : "No assigned tasks"} />
      ) : (
        open.map((i) => (
          // Board du projet + sheet ouverte (`?issue=`) — même cible que My Work.
          <Link key={i.id} href={`./projects/${i.projectId}?issue=${i.id}`} className={ROW_CLASS}>
            <span className="shrink-0 font-mono text-[11px] uppercase text-muted-foreground">{i.identifier}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{i.title}</span>
          </Link>
        ))
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Récents — 5 dernières notifications (endpoint notifications réel)
// ---------------------------------------------------------------------------

function RecentColumn({ slug }: { readonly slug: string }) {
  const [notifs, setNotifs] = useState<NotificationResponse[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!slug) return
    let alive = true
    setNotifs(null)
    setFailed(false)
    // listNotifications est déjà silencieux (pattern cloche du topbar).
    listNotifications(slug)
      .then((d) => {
        if (alive) setNotifs(d)
      })
      .catch(() => {
        if (alive) {
          setNotifs([])
          setFailed(true)
        }
      })
    return () => {
      alive = false
    }
  }, [slug])

  const rows = (notifs ?? []).slice(0, MAX_ROWS)

  return (
    <SectionCard title="Recent" href="./inbox" bodyClassName="p-0">
      {notifs === null ? (
        <ColumnSkeleton />
      ) : rows.length === 0 ? (
        <ColumnEmpty message={failed ? "Notifications indisponibles pour le moment" : "Rien de nouveau"} />
      ) : (
        rows.map((n) => {
          const inner = (
            <>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{n.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: fr })}
              </span>
            </>
          )
          return n.issueUrl ? (
            <Link key={n.id} href={n.issueUrl} className={ROW_CLASS}>
              {inner}
            </Link>
          ) : (
            <div key={n.id} className={ROW_CLASS}>
              {inner}
            </div>
          )
        })
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Grille des trois colonnes
// ---------------------------------------------------------------------------

/** Trois listes compactes (en-têtes cliquables vers la page complète), données réelles. */
export function QuickColumns({ slug }: { readonly slug: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <OperationsColumn />
      <MyQueueColumn slug={slug} />
      <RecentColumn slug={slug} />
    </div>
  )
}
