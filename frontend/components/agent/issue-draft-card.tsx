"use client"

import { useEffect, useMemo, useState } from "react"

import { approveAction, type AssistantToolCall } from "@/lib/api/assistant-service"
import { getErrorMessage } from "@/lib/api/client"
import { listStatuses, type IssueStatus } from "@/lib/api/issue-service"
import {
  draftColumn, draftProblem, findDraftProject, formatDraftDay, issueDraftInput, localDay, readIssueDraft,
  type DraftProblem, type IssueDraft,
} from "@/lib/cortex/issue-draft"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { cn } from "@/lib/utils"
import { UndoAction } from "./undo-action"

type CardState = "draft" | "creating" | "created" | "failed"

const FIELD = "w-full border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

/**
 * « Créer » (R78, séance n°13) : l'issue que Cortex a préparée, en carte. La personne la relit, change ce qu'il faut et
 * la crée ; l'accord part avec le dossier de la réponse et les champs modifiés, le serveur rejuge et crée l'issue avec
 * ses droits, puis « Undo » la reprend tant que rien n'a bougé (R77). La visibilité est celle du projet : une issue n'a
 * pas la sienne.
 */
export function IssueDraftCard({ slug, call }: { slug: string; call: AssistantToolCall }) {
  const t = usePreferencesStore((s) => s.t.cortex)
  const projects = useProjectStore((s) => s.projects)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const [draft, setDraft] = useState<IssueDraft>(() => readIssueDraft(call.input))
  const [editing, setEditing] = useState(false)
  const [columns, setColumns] = useState<IssueStatus[]>([])
  const [state, setState] = useState<CardState>("draft")
  const [output, setOutput] = useState<string | null>(null)

  useEffect(() => {
    if (projects.length === 0) void fetchProjects(slug)
  }, [projects.length, fetchProjects, slug])

  const project = useMemo(() => findDraftProject(projects, draft.project), [projects, draft.project])
  const projectId = project?.id

  useEffect(() => {
    if (projectId === undefined) return
    let live = true
    listStatuses(slug, projectId)
      .then((list) => { if (live) setColumns(list) })
      .catch(() => { if (live) setColumns([]) })
    return () => { live = false }
  }, [slug, projectId])

  const column = draftColumn(columns, draft.status)
  // Sans les colonnes (pas encore là, ou illisibles), le serveur tranche.
  const problem = draftProblem(draft, project, columns.length === 0 || column !== null, localDay(new Date(), -1))
  const change = (fields: Partial<IssueDraft>) => setDraft((current) => ({ ...current, ...fields }))

  const create = async () => {
    if (problem || !project) return
    setState("creating")
    try {
      const result = await approveAction(slug, { ...call, input: issueDraftInput({ ...draft, project: project.identifier }) })
      setOutput(result.output)
      // L'outil dit ce qui l'arrête dans sa sortie : seule « Created … » est une issue créée.
      setState(result.status === "success" && result.output.startsWith("Created ") ? "created" : "failed")
    } catch (e) {
      setOutput(getErrorMessage(e))
      setState("failed")
    }
  }

  if (state === "created") {
    return (
      <div className="my-2 flex flex-col gap-1 border border-shape-green/30 bg-tint-green px-3 py-2 text-xs">
        <p className="whitespace-pre-wrap break-words text-ink-green">{output}</p>
        <UndoAction slug={slug} call={{ ...call, status: "success", output }} />
      </div>
    )
  }

  const subtasks = draft.subtasks.map((s) => s.trim()).filter(Boolean)
  const visibility = project ? (project.isPublic ? t.issueVisibleWorkspace : t.issueVisibleCollaborators) : null
  const message: Record<DraftProblem, string> = {
    project: t.issueNeedsProject,
    title: t.issueNeedsTitle,
    past: t.issueDueInPast,
    column: t.issueUnknownColumn,
  }

  return (
    <div className="my-2 flex flex-col border border-border bg-background text-xs" aria-label={t.issueCardTitle} role="group">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-2">
        <p className="font-semibold text-foreground">{t.issueCardTitle}</p>
        <p className="text-muted-foreground">{t.issueCardHint}</p>
      </div>
      <div className="flex flex-col gap-2.5 px-3 py-2.5">
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
          <dt className="text-muted-foreground">{t.issueProject}</dt>
          <dd className="min-w-0">
            {editing || !project ? (
              <select
                aria-label={t.issueProject}
                value={project?.identifier ?? ""}
                onChange={(e) => change({ project: e.target.value, status: "" })}
                className={cn(FIELD, "h-7")}
              >
                <option value="" disabled>{t.issueChooseProject}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.identifier}>{p.name} ({p.identifier})</option>
                ))}
              </select>
            ) : (
              <span className="flex flex-wrap items-baseline gap-2">
                {project.name} ({project.identifier})
                <button type="button" onClick={() => setEditing(true)} className="font-medium text-primary hover:underline">
                  {t.issueChange}
                </button>
              </span>
            )}
          </dd>

          <dt className="text-muted-foreground">{t.issueTitle}</dt>
          <dd className="min-w-0 break-words">
            {editing ? (
              <input aria-label={t.issueTitle} value={draft.title} onChange={(e) => change({ title: e.target.value })} className={cn(FIELD, "h-7")} />
            ) : (
              draft.title
            )}
          </dd>

          {(editing || draft.description) && (
            <>
              <dt className="text-muted-foreground">{t.issueDescription}</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words">
                {editing ? (
                  <textarea
                    aria-label={t.issueDescription}
                    rows={3}
                    value={draft.description}
                    onChange={(e) => change({ description: e.target.value })}
                    className={cn(FIELD, "py-1")}
                  />
                ) : (
                  draft.description
                )}
              </dd>
            </>
          )}

          {(editing || subtasks.length > 0) && (
            <>
              <dt className="text-muted-foreground">{t.issueSubtasks}</dt>
              <dd className="min-w-0 break-words">
                {editing ? (
                  <textarea
                    aria-label={t.issueSubtasks}
                    placeholder={t.issueSubtasksHint}
                    rows={3}
                    value={draft.subtasks.join("\n")}
                    onChange={(e) => change({ subtasks: e.target.value.split("\n") })}
                    className={cn(FIELD, "py-1")}
                  />
                ) : (
                  subtasks.join(" · ")
                )}
              </dd>
            </>
          )}

          <dt className="text-muted-foreground">{t.issueDue}</dt>
          <dd className="min-w-0">
            {editing ? (
              <input
                type="date"
                aria-label={t.issueDue}
                value={draft.dueDate}
                onChange={(e) => change({ dueDate: e.target.value })}
                className={cn(FIELD, "h-7 w-auto")}
              />
            ) : draft.dueDate ? (
              formatDraftDay(draft.dueDate)
            ) : (
              <span className="text-muted-foreground">{t.issueNoDue}</span>
            )}
          </dd>

          <dt className="text-muted-foreground">{t.issueColumn}</dt>
          <dd className="min-w-0">
            {editing && columns.length > 0 ? (
              <select
                aria-label={t.issueColumn}
                value={column?.name ?? ""}
                onChange={(e) => change({ status: e.target.value })}
                className={cn(FIELD, "h-7 w-auto")}
              >
                {column === null && <option value="" disabled>{draft.status}</option>}
                {columns.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            ) : (
              column?.name ?? draft.status
            )}
          </dd>

          {visibility && (
            <>
              <dt className="text-muted-foreground">{t.issueVisibleTo}</dt>
              <dd className="min-w-0">
                {visibility} <span className="text-muted-foreground">· {t.issueVisibleHint}</span>
              </dd>
            </>
          )}
        </dl>

        {problem && state === "draft" && <p className="text-ink-yellow">{message[problem]}</p>}
        {state === "failed" && <p className="whitespace-pre-wrap break-words text-destructive">{output}</p>}

        {state !== "failed" && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={create}
              disabled={problem !== null || state === "creating"}
              className="flex h-7 items-center bg-primary px-2.5 font-medium text-primary-foreground shadow-key transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {state === "creating" ? t.issueCreating : t.issueCreate}
            </button>
            <button
              type="button"
              onClick={() => setEditing((on) => !on)}
              disabled={state === "creating"}
              className="flex h-7 items-center border border-border px-2.5 text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              {editing ? t.issueEditDone : t.issueEdit}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
