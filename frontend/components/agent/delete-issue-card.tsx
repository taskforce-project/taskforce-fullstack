"use client"

import { useState } from "react"
import { Archive, Loader2, Trash2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { approveAction, type AssistantTarget, type AssistantToolCall } from "@/lib/api/assistant-service"
import { getErrorMessage } from "@/lib/api/client"
import type { TranslationKeys } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"
import { useIssueStore } from "@/lib/store/issue-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

type Texts = TranslationKeys["cortex"]

/** Ce qui partirait avec l'issue, dans les mots de la carte. */
function goesWith(target: AssistantTarget, t: Texts): string[] {
  const what: string[] = []
  const comments = target.comments ?? 0
  const checklist = target.checklist ?? 0
  if (comments > 0) what.push(comments === 1 ? t.deleteOneComment : fillText(t.deleteComments, { count: comments }))
  if (checklist > 0) what.push(checklist === 1 ? t.deleteOneChecklistItem : fillText(t.deleteChecklist, { count: checklist }))
  if (target.mission) what.push(t.deleteMission)
  return what
}

type State = "idle" | "archiving" | "archived" | "restoring" | "deleting" | "deleted"

/**
 * « Supprime TF-12 » dans la conversation (TF-J1-5) : la règle delete-issue demande, et cette carte dit l'issue et ce
 * qui partirait avec elle. « Archive » d'abord : l'issue quitte le tableau, et « Undo » la remet. « Delete » ensuite :
 * l'accord part avec le dossier de la réponse, où le serveur rejuge la suppression. Seul ce clic supprime, jamais un
 * « oui » écrit (R1).
 */
export function DeleteIssueCard({ slug, call, target }: Readonly<{ slug: string; call: AssistantToolCall; target: AssistantTarget }>) {
  const t = usePreferencesStore((s) => s.t.cortex)
  const archiveIssue = useIssueStore((s) => s.archiveIssue)
  const [state, setState] = useState<State>("idle")
  const [problem, setProblem] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<string | null>(null)
  const key = target.key ?? ""
  const what = goesWith(target, t)
  const busy = state === "archiving" || state === "restoring" || state === "deleting"

  async function archive(archived: boolean) {
    setState(archived ? "archiving" : "restoring")
    setProblem(null)
    const done = await archiveIssue(slug, target.projectId, target.issueId, archived)
    if (done) {
      setState(archived ? "archived" : "idle")
    } else {
      setState(archived ? "idle" : "archived")
      setProblem(t.archiveFailed)
    }
  }

  async function remove() {
    setState("deleting")
    setProblem(null)
    try {
      const result = await approveAction(slug, call)
      if (result.status === "success") {
        setDeleted(result.output)
        setState("deleted")
      } else {
        setState("idle")
        setProblem(fillText(t.deleteFailed, { why: result.output }))
      }
    } catch (e) {
      setState("idle")
      setProblem(fillText(t.deleteFailed, { why: getErrorMessage(e) }))
    }
  }

  if (state === "deleted") {
    // Ce que le serveur a supprimé, dans ses mots (« Deleted TF-12 "Fix login", with its 3 comments. »).
    return <p className="my-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{deleted || t.deleteDeleted}</p>
  }

  return (
    <div className="my-2 flex flex-col gap-2 border border-border p-2.5 text-xs" role="group"
      aria-label={fillText(t.deleteTitle, { key, title: target.title })}>
      <p className="font-medium text-foreground">{fillText(t.deleteTitle, { key, title: target.title })}</p>
      <p className="text-muted-foreground">
        {what.length > 0 ? fillText(t.deleteGoesWith, { what: what.join(", ") }) : t.deleteNothingElse}
      </p>
      <p className="text-muted-foreground">{t.deleteHint}</p>
      {state === "archived" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground">{fillText(t.deleteArchived, { key })}</span>
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={busy} onClick={() => void archive(false)}>
            <Undo2 className="size-3" /> {t.deleteUndo}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {target.archived ? (
            <span className="text-muted-foreground">{fillText(t.deleteAlreadyArchived, { key })}</span>
          ) : (
            <Button size="sm" className="h-7 px-2.5 text-[11px]" disabled={busy} onClick={() => void archive(true)}>
              {state === "archiving" ? <Loader2 className="size-3 animate-spin" /> : <Archive className="size-3" />} {t.deleteArchive}
            </Button>
          )}
          <Button variant="destructive" size="sm" className="h-7 px-2.5 text-[11px]" disabled={busy} onClick={() => void remove()}>
            {state === "deleting" ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} {t.deleteDelete}
          </Button>
        </div>
      )}
      {problem && <p className="whitespace-pre-wrap break-words text-destructive">{problem}</p>}
    </div>
  )
}
