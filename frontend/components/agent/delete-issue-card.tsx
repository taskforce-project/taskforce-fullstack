"use client"

import { Archive, Loader2, Trash2, Undo2 } from "lucide-react"

import { PaneLink } from "@/components/layout/pane-link"
import { Button } from "@/components/ui/button"
import type { AssistantTarget, AssistantToolCall } from "@/lib/api/assistant-service"
import type { TranslationKeys } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { deletionKey, useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { issuePath } from "@/lib/window/pane"

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

/** Le titre de la carte : l'issue, sa colonne à côté de sa clé quand le serveur la donne, et son titre. */
export function deletionTitle(target: AssistantTarget, t: Texts): string {
  const key = target.key ?? ""
  return target.column
    ? fillText(t.deleteTitleIn, { key, column: target.column, title: target.title })
    : fillText(t.deleteTitle, { key, title: target.title })
}

/**
 * « Supprime TF-12 » dans la conversation (TF-J1-5) : la règle delete-issue demande, et cette carte dit l'issue, sa
 * colonne (test du CEO du 05/11/2026 : la carte d'une autre issue au même titre doit se voir d'emblée) et ce qui
 * partirait avec elle ; son titre ouvre l'issue dans le volet (R123). « Archive » d'abord : l'issue quitte le tableau, et
 * « Undo » la remet. « Delete » ensuite : l'accord part avec le dossier de la réponse, où le serveur rejuge la
 * suppression. Seul ce clic supprime, jamais un « oui » écrit (R1). Son état vit dans `useCortexStore` : « Changes »
 * (R122) montre l'archivage et la suppression, et la carte les garde quand la conversation se replie puis se déplie.
 */
export function DeleteIssueCard({ slug, call, target }: Readonly<{ slug: string; call: AssistantToolCall; target: AssistantTarget }>) {
  const t = usePreferencesStore((s) => s.t.cortex)
  const openText = usePreferencesStore((s) => s.t.window.openIssue)
  const state = useCortexStore((s) => s.deletions[deletionKey(call)])
  const archiveFromCard = useCortexStore((s) => s.archiveFromCard)
  const deleteFromCard = useCortexStore((s) => s.deleteFromCard)
  const { openIssue } = usePaneNavigation()
  const status = state?.status ?? "idle"
  const key = target.key ?? ""
  const title = deletionTitle(target, t)
  const what = goesWith(target, t)
  const busy = status === "archiving" || status === "restoring" || status === "deleting"
  const failed = state?.failed
  const problem = !failed ? null : failed.gesture === "archive" ? t.archiveFailed : fillText(t.deleteFailed, { why: failed.why })
  const asCall = { ...call, target }

  if (status === "deleted") {
    // Ce que le serveur a supprimé, dans ses mots (« Deleted TF-12 "Fix login", with its 3 comments. »).
    return <p className="my-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{state?.output || t.deleteDeleted}</p>
  }

  return (
    <div className="my-2 flex flex-col gap-2 border border-border p-2.5 text-xs" role="group" aria-label={title}>
      <PaneLink
        href={issuePath(slug, target.projectId, target.issueId)}
        open={() => openIssue({ projectId: target.projectId, issueId: target.issueId })}
        title={fillText(openText, { key })}
        className="w-fit font-medium text-foreground underline-offset-2 hover:underline"
      >
        {title}
      </PaneLink>
      <p className="text-muted-foreground">
        {what.length > 0 ? fillText(t.deleteGoesWith, { what: what.join(", ") }) : t.deleteNothingElse}
      </p>
      <p className="text-muted-foreground">{t.deleteHint}</p>
      {status === "archived" || status === "restoring" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground">{fillText(t.deleteArchived, { key })}</span>
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" disabled={busy} onClick={() => void archiveFromCard(slug, asCall, false)}>
            {status === "restoring" ? <Loader2 className="size-3 animate-spin" /> : <Undo2 className="size-3" />} {t.deleteUndo}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {target.archived ? (
            <span className="text-muted-foreground">{fillText(t.deleteAlreadyArchived, { key })}</span>
          ) : (
            <Button size="sm" className="h-7 px-2.5 text-[11px]" disabled={busy} onClick={() => void archiveFromCard(slug, asCall, true)}>
              {status === "archiving" ? <Loader2 className="size-3 animate-spin" /> : <Archive className="size-3" />} {t.deleteArchive}
            </Button>
          )}
          <Button variant="destructive" size="sm" className="h-7 px-2.5 text-[11px]" disabled={busy} onClick={() => void deleteFromCard(slug, asCall)}>
            {status === "deleting" ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} {t.deleteDelete}
          </Button>
        </div>
      )}
      {problem && <p className="whitespace-pre-wrap break-words text-destructive">{problem}</p>}
    </div>
  )
}
