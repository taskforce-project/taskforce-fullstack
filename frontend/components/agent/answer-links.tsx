"use client"

import { Fragment, useCallback, useMemo, type ReactNode } from "react"
import { useParams, usePathname } from "next/navigation"

import { PaneLink } from "@/components/layout/pane-link"
import type { AssistantToolCall } from "@/lib/api/assistant-service"
import { fillText } from "@/lib/delivery/result-card"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { useIssueStore } from "@/lib/store/issue-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"
import { hrefWith, workflowProjectOf } from "@/lib/window/address"
import { linkIndex, splitLinks, type AnswerLink } from "@/lib/window/answer-links"
import { boardPath, issuePath, workflowPath } from "@/lib/window/pane"

const LINK = "font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"

const NO_CALLS: readonly AssistantToolCall[] = []

/**
 * Un lien d'une réponse : il ouvre le volet de ce qu'il nomme, la conversation reste à sa place. Quand le volet est le
 * workflow du projet nommé (séance n°25), une issue s'y choisit, nœud choisi (`?node=`), et son projet y reste.
 */
function AnswerLinkView({ slug, link }: Readonly<{ slug: string; link: AnswerLink }>) {
  const t = usePreferencesStore((s) => s.t.window)
  const pathname = usePathname()
  const { openIssue, openBoard, openWorkflow } = usePaneNavigation()
  // Une mission que la réponse a lancée ou touchée (séance n°25, §9) : son application est le workflow, sur son nœud.
  if (link.kind === "issue" && link.runId !== null && link.issueId !== null) {
    const mission = `run-${link.runId}`
    return (
      <PaneLink
        href={workflowPath(slug, link.projectId, mission)}
        open={() => openWorkflow(link.projectId, mission)}
        title={fillText(t.missionOnWorkflow, { key: link.key })}
        className={LINK}
      >
        {link.text}
      </PaneLink>
    )
  }
  const onItsWorkflow = workflowProjectOf(pathname) === link.projectId
  if (onItsWorkflow && (link.kind === "project" || link.issueId !== null)) {
    const node = link.kind === "issue" && link.issueId !== null ? `issue-${link.issueId}` : null
    return (
      <PaneLink
        href={workflowPath(slug, link.projectId, node)}
        open={() => openWorkflow(link.projectId, node)}
        title={link.kind === "issue" ? fillText(t.openIssue, { key: link.key }) : fillText(t.workflowOf, { project: link.text })}
        className={LINK}
      >
        {link.text}
      </PaneLink>
    )
  }
  if (link.kind === "project") {
    return (
      <PaneLink href={boardPath(slug, link.projectId)} open={() => openBoard(link.projectId)} title={fillText(t.boardOf, { project: link.text })} className={LINK}>
        {link.text}
      </PaneLink>
    )
  }
  const href = link.issueId !== null
    ? issuePath(slug, link.projectId, link.issueId)
    : hrefWith(boardPath(slug, link.projectId), null, { issue: link.key })
  return (
    <PaneLink
      href={href}
      open={() => openIssue({ projectId: link.projectId, issueId: link.issueId, key: link.key })}
      title={fillText(t.openIssue, { key: link.key })}
      className={LINK}
    >
      {link.text}
    </PaneLink>
  )
}

/**
 * Les liens d'une réponse de Cortex (R120) : les clés d'issue et les noms de projet qu'elle écrit ouvrent leur volet.
 * La fenêtre les connaît par les gestes de la réponse, les missions de l'espace et le tableau chargé ; une clé d'un
 * projet de l'espace qu'elle ne connaît pas encore s'ouvre par sa clé, sur le tableau de son projet.
 */
export function useAnswerLinks(toolCalls: readonly AssistantToolCall[] = NO_CALLS): (text: string, key: string) => ReactNode {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const projects = useProjectStore((s) => s.projects)
  const issues = useIssueStore((s) => s.issues)
  // Celles du workflow ouvert, sous-issues comprises : leurs clés y choisissent leur nœud.
  const workflowIssues = useIssueStore((s) => s.workflowIssues?.issues)
  const runs = useDeliveryStore((s) => s.workspaceRuns)

  const index = useMemo(() => linkIndex(projects, [
    ...toolCalls.map((call) => call.target ?? null),
    ...runs.map((run) => ({ projectId: run.projectId, issueId: run.issueId, key: run.issueKey })),
    ...issues.map((issue) => ({ projectId: issue.projectId, issueId: issue.id, key: issue.identifier })),
    ...(workflowIssues ?? []).map((issue) => ({ projectId: issue.projectId, issueId: issue.id, key: issue.identifier })),
  ]), [projects, toolCalls, runs, issues, workflowIssues])

  return useCallback((text: string, key: string) => {
    const segments = splitLinks(text, index)
    if (segments.every((segment) => typeof segment === "string")) return text
    return (
      <Fragment key={key}>
        {segments.map((segment, i) =>
          typeof segment === "string" ? segment : <AnswerLinkView key={`${key}-${i}`} slug={slug} link={segment} />)}
      </Fragment>
    )
  }, [index, slug])
}

/** Un texte court de TaskForce (« Created OPS-36 ... »), avec les mêmes liens que les réponses. */
export function LinkedText({ text }: Readonly<{ text: string }>) {
  const render = useAnswerLinks()
  return <>{render(text, "linked")}</>
}
