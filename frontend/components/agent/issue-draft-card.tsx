"use client"

import { useEffect, useMemo, useState } from "react"

import { approveAction, type AssistantToolCall } from "@/lib/api/assistant-service"
import { getErrorMessage } from "@/lib/api/client"
import { listCycles, type Cycle } from "@/lib/api/cycle-service"
import { listStatuses, type IssueStatus } from "@/lib/api/issue-service"
import { listLabels, type ProjectLabel } from "@/lib/api/label-service"
import { listProjectMembers, type ProjectMember } from "@/lib/api/project-service"
import {
  DRAFT_PRIORITIES, draftColumn, draftCycle, draftLabels, draftProblem, findDraftMember, findDraftProject, formatDraftDay,
  issueDraftInput, localDay, memberName, namedColumn, openCycles, readIssueDraft,
  type DraftPriority, type DraftProblem, type IssueDraft,
} from "@/lib/cortex/issue-draft"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { cn } from "@/lib/utils"
import { UndoAction } from "./undo-action"

type CardState = "draft" | "creating" | "created" | "failed"

const FIELD = "w-full border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

/** Les estimations proposées, comme sur la fiche d'une issue. */
const POINT_PRESETS = ["1", "2", "3", "5", "8", "13"]

/** Ce qui existe dans le projet : la carte n'y prend que ça. Null : pas encore là, ou illisible, et le serveur tranche. */
interface ProjectOptions {
  projectId: number
  members: ProjectMember[] | null
  labels: ProjectLabel[] | null
  cycles: Cycle[] | null
}

const settled = <T,>(result: PromiseSettledResult<T>): T | null => (result.status === "fulfilled" ? result.value : null)

/**
 * « Créer » (R78, séance n°13) : l'issue que Cortex a préparée, en carte. La personne la relit, change ce qu'il faut et
 * la crée ; l'accord part avec le dossier de la réponse et les champs modifiés, le serveur rejuge et crée l'issue avec
 * ses droits, puis « Undo » la reprend tant que rien n'a bougé (R77). La visibilité est celle du projet : une issue n'a
 * pas la sienne.
 *
 * La priorité, l'assigné, les labels, les points et le cycle ne prennent que ce qui existe dans le projet (recette du
 * 01/11/2026) : ce que Cortex a nommé et qui ne s'y trouve pas reste vide, à remplir ici.
 */
export function IssueDraftCard({ slug, call }: { slug: string; call: AssistantToolCall }) {
  const t = usePreferencesStore((s) => s.t.cortex)
  const projects = useProjectStore((s) => s.projects)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const [draft, setDraft] = useState<IssueDraft>(() => readIssueDraft(call.input))
  const [editing, setEditing] = useState(false)
  const [columns, setColumns] = useState<IssueStatus[]>([])
  const [loaded, setLoaded] = useState<ProjectOptions | null>(null)
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
    void Promise.allSettled([listProjectMembers(slug, projectId), listLabels(slug, projectId), listCycles(slug, projectId)])
      .then(([members, labels, cycles]) => {
        if (live) setLoaded({ projectId, members: settled(members), labels: settled(labels), cycles: settled(cycles) })
      })
    return () => { live = false }
  }, [slug, projectId])

  const options = loaded && loaded.projectId === projectId ? loaded : null
  const column = draftColumn(columns, draft.status)
  // Cortex a nommé une colonne que le projet n'a pas : l'issue part dans sa colonne par défaut, et la carte le dit au
  // lieu de bloquer la création (rejeu de la 1.8.0).
  const columnByDefault = column !== null && draft.status.trim() !== "" && namedColumn(columns, draft.status) === null
  const member = options?.members ? findDraftMember(options.members, draft.assignee) : null
  const labels = options?.labels ? draftLabels(options.labels, draft.labels) : []
  const cycle = options?.cycles ? draftCycle(options.cycles, draft.cycle) : null
  // Sans les colonnes (pas encore là, ou illisibles), le serveur tranche.
  const problem = draftProblem(draft, project, columns.length === 0 || column !== null, localDay(new Date(), -1))
  const change = (fields: Partial<IssueDraft>) => setDraft((current) => ({ ...current, ...fields }))

  const create = async () => {
    if (problem || !project) return
    setState("creating")
    // Ce que la carte montre, résolu parmi ce qui existe : l'e-mail du membre, les noms exacts. Sans les options du
    // projet, ce que Cortex a écrit part tel quel et le serveur le rejuge.
    const sent: IssueDraft = {
      ...draft,
      project: project.identifier,
      // La colonne que la carte montre, par son nom exact : celle que Cortex a nommée, ou celle par défaut.
      status: draft.status.trim() && column ? column.name : draft.status,
      assignee: options?.members ? (member?.email ?? "") : draft.assignee,
      labels: options?.labels ? labels.map((l) => l.name) : draft.labels,
      cycle: options?.cycles ? (cycle?.name ?? "") : draft.cycle,
    }
    try {
      const result = await approveAction(slug, { ...call, input: issueDraftInput(sent) })
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

  const checklist = draft.checklist.map((s) => s.trim()).filter(Boolean)
  const visibility = project ? (project.isPublic ? t.issueVisibleWorkspace : t.issueVisibleCollaborators) : null
  const message: Record<DraftProblem, string> = {
    project: t.issueNeedsProject,
    title: t.issueNeedsTitle,
    past: t.issueDueInPast,
    column: t.issueUnknownColumn,
  }
  const projectLabels = options?.labels ?? []
  const cycles = openCycles(options?.cycles ?? [])
  const points = draft.points
  const pointChoices = points && !POINT_PRESETS.includes(points) ? [...POINT_PRESETS, points] : POINT_PRESETS
  const empty = (text: string) => <span className="text-muted-foreground">{text}</span>
  const toggleLabel = (name: string) => {
    const names = labels.map((l) => l.name)
    change({ labels: names.includes(name) ? names.filter((n) => n !== name) : [...names, name] })
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

          {(editing || checklist.length > 0) && (
            <>
              <dt className="text-muted-foreground">{t.issueChecklist}</dt>
              <dd className="min-w-0 break-words">
                {editing ? (
                  <textarea
                    aria-label={t.issueChecklist}
                    placeholder={t.issueChecklistHint}
                    rows={3}
                    value={draft.checklist.join("\n")}
                    onChange={(e) => change({ checklist: e.target.value.split("\n") })}
                    className={cn(FIELD, "py-1")}
                  />
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {checklist.map((line, i) => (
                      <li key={i} className="flex items-baseline gap-1.5">
                        <span aria-hidden="true" className="inline-block size-2.5 shrink-0 translate-y-px border border-muted-foreground/60" />
                        {line}
                      </li>
                    ))}
                  </ul>
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
              empty(t.issueNoDue)
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
            {columnByDefault && column && (
              <p className="mt-0.5 text-muted-foreground">
                {t.issueColumnByDefault.replace("{asked}", draft.status.trim()).replace("{column}", column.name)}
              </p>
            )}
          </dd>

          <dt className="text-muted-foreground">{t.issuePriority}</dt>
          <dd className="min-w-0">
            {editing ? (
              <select
                aria-label={t.issuePriority}
                value={draft.priority === "NONE" ? "" : draft.priority}
                onChange={(e) => change({ priority: e.target.value as DraftPriority | "" })}
                className={cn(FIELD, "h-7 w-auto")}
              >
                <option value="">{t.issuePriorities.NONE}</option>
                {DRAFT_PRIORITIES.filter((p) => p !== "NONE").map((p) => (
                  <option key={p} value={p}>{t.issuePriorities[p]}</option>
                ))}
              </select>
            ) : draft.priority && draft.priority !== "NONE" ? (
              t.issuePriorities[draft.priority]
            ) : (
              empty(t.issuePriorities.NONE)
            )}
          </dd>

          <dt className="text-muted-foreground">{t.issueAssignee}</dt>
          <dd className="min-w-0 break-words">
            {editing ? (
              <select
                aria-label={t.issueAssignee}
                value={member?.email ?? ""}
                onChange={(e) => change({ assignee: e.target.value })}
                className={cn(FIELD, "h-7")}
              >
                <option value="">{t.issueUnassigned}</option>
                {(options?.members ?? []).map((m) => (
                  <option key={m.userId} value={m.email}>{memberName(m)}</option>
                ))}
              </select>
            ) : member ? (
              memberName(member)
            ) : (
              empty(t.issueUnassigned)
            )}
          </dd>

          <dt className="text-muted-foreground">{t.issueLabels}</dt>
          <dd className="min-w-0 break-words">
            {editing ? (
              projectLabels.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {projectLabels.map((l) => {
                    const on = labels.includes(l)
                    return (
                      <button
                        key={l.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleLabel(l.name)}
                        className={cn(
                          "border px-1.5 py-0.5 transition-colors",
                          on ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {l.name}
                      </button>
                    )
                  })}
                </span>
              ) : (
                empty(t.issueProjectHasNoLabels)
              )
            ) : labels.length > 0 ? (
              labels.map((l) => l.name).join(", ")
            ) : (
              empty(t.issueNoLabels)
            )}
          </dd>

          <dt className="text-muted-foreground">{t.issuePoints}</dt>
          <dd className="min-w-0">
            {editing ? (
              <select
                aria-label={t.issuePoints}
                value={points}
                onChange={(e) => change({ points: e.target.value })}
                className={cn(FIELD, "h-7 w-auto")}
              >
                <option value="">{t.issueNoPoints}</option>
                {pointChoices.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : points ? (
              (points === "1" ? t.issueOnePoint : t.issuePointsValue).replace("{points}", points)
            ) : (
              empty(t.issueNoPoints)
            )}
          </dd>

          <dt className="text-muted-foreground">{t.issueCycle}</dt>
          <dd className="min-w-0 break-words">
            {editing ? (
              <select
                aria-label={t.issueCycle}
                value={cycle?.name ?? ""}
                onChange={(e) => change({ cycle: e.target.value })}
                className={cn(FIELD, "h-7")}
              >
                <option value="">{t.issueNoCycle}</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.name}>{c.status === "ACTIVE" ? `${c.name} ${t.issueActiveCycle}` : c.name}</option>
                ))}
              </select>
            ) : cycle ? (
              <>
                {cycle.name}
                {cycle.status === "ACTIVE" && <span className="text-muted-foreground"> {t.issueActiveCycle}</span>}
              </>
            ) : (
              empty(t.issueNoCycle)
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
