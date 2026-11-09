"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useParams } from "next/navigation"
import { ChevronRight, FileMinus2, FilePen, FilePlus2, FileText, Loader2, MessageSquarePlus, Send, Undo2, X } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { DeliveryRun, MissionChanges as Changes, MissionFileChange } from "@/lib/api/delivery-service"
import { commentTarget, diffRows, splitPath, textRows, type DiffLine, type DiffRow } from "@/lib/delivery/diff-rows"
import { fillText } from "@/lib/delivery/result-card"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useDeliveryStore, type DraftChangeComment } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

/** Le rythme des relectures pendant que l'agent écrit, ou qu'un fichier se remet comme avant. */
const POLL_MS = 2_000

const NO_FILES: readonly MissionFileChange[] = []
const NO_COMMENTS: readonly DraftChangeComment[] = []

const FILE_ICON = { added: FilePlus2, modified: FilePen, deleted: FileMinus2, written: FileText } as const

/** L'anneau de focus des boutons nus de cette vue, comme celui des boutons de l'interface. */
const FOCUS = "outline-none focus-visible:ring-1 focus-visible:ring-ring"

type Words = ReturnType<typeof usePreferencesStore.getState>["t"]["missionChanges"]

/** `+12 −1` en chiffres à chasse fixe, le nom complet au survol et pour les lecteurs d'écran. */
function Counts({ added, removed, t }: Readonly<{ added: number; removed: number; t: Words }>) {
  const label = fillText(t.counts, { added, removed })
  return (
    <span className="shrink-0 font-mono text-xs tabular-nums" title={label} role="img" aria-label={label}>
      <span className="text-chart-3">+{added}</span> <span className="text-chart-2">−{removed}</span>
    </span>
  )
}

/** Une ligne du diff : ses numéros, son texte, et, si la relecture est ouverte, le geste pour la commenter. */
function Line({ row, plain, t, onComment }: Readonly<{ row: DiffLine; plain: boolean; t: Words; onComment: ((row: DiffLine) => void) | null }>) {
  const marker = row.kind === "add" ? "+" : row.kind === "del" ? "−" : ""
  return (
    <div className={cn("group/line relative flex min-w-0 font-mono text-[12px] leading-5",
      row.kind === "add" && "bg-chart-3/10", row.kind === "del" && "bg-chart-2/10")}>
      {!plain && <span className="w-9 shrink-0 select-none pr-1.5 text-right tabular-nums text-muted-foreground/70">{row.oldLine ?? ""}</span>}
      <span className="w-9 shrink-0 select-none pr-1.5 text-right tabular-nums text-muted-foreground/70">{row.newLine ?? ""}</span>
      {!plain && (
        <span aria-hidden="true" className={cn("w-3 shrink-0 select-none", row.kind === "add" ? "text-chart-3" : "text-chart-2")}>{marker}</span>
      )}
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-7 text-foreground">{row.text || " "}</span>
      {onComment && (
        <button type="button" onClick={() => onComment(row)} title={t.comments.add} aria-label={t.comments.add}
          className={cn("absolute right-1 top-0 flex size-5 items-center justify-center text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground focus-visible:opacity-100 group-hover/line:opacity-100 motion-reduce:transition-none", FOCUS)}>
          <MessageSquarePlus className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** Un commentaire de relecture sous sa ligne, tel qu'il partira. */
function Comment({ comment, t, onRemove }: Readonly<{ comment: DraftChangeComment; t: Words; onRemove: () => void }>) {
  return (
    <div className="my-1 ml-[5.25rem] mr-2 flex items-start gap-2 border-l-2 border-primary bg-muted/60 py-1.5 pl-2 pr-1 text-xs">
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground">{comment.text}</span>
      <button type="button" onClick={onRemove} title={t.comments.remove} aria-label={t.comments.remove}
        className={cn("flex size-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground", FOCUS)}>
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

/** L'endroit où l'on écrit un commentaire, sous la ligne choisie. */
function CommentForm({ t, onSave, onCancel }: Readonly<{ t: Words; onSave: (text: string) => void; onCancel: () => void }>) {
  const [text, setText] = useState("")
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (text.trim()) onSave(text.trim())
  }
  return (
    <form onSubmit={submit} className="my-1 ml-[5.25rem] mr-2 flex flex-col gap-1.5">
      <Textarea autoFocus value={text} rows={2} maxLength={2000} aria-label={t.comments.placeholder} placeholder={t.comments.placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel()
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event)
        }}
        className="min-h-14 resize-none text-xs" />
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>{t.comments.cancel}</Button>
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={!text.trim()}>{t.comments.save}</Button>
      </div>
    </form>
  )
}

/** Le diff d'un fichier, ouvert sur place. Il se relit quand le fichier change. */
function FileDiff({ slug, runId, file, canComment, t }: Readonly<{ slug: string; runId: number; file: MissionFileChange; canComment: boolean; t: Words }>) {
  const diff = useDeliveryStore((s) => s.fileDiffs[runId]?.[file.path])
  const fetchFileDiff = useDeliveryStore((s) => s.fetchFileDiff)
  const comments = useDeliveryStore((s) => s.changeComments[runId] ?? NO_COMMENTS)
  const addChangeComment = useDeliveryStore((s) => s.addChangeComment)
  const removeChangeComment = useDeliveryStore((s) => s.removeChangeComment)
  const [writing, setWriting] = useState<string | null>(null)

  useEffect(() => {
    void fetchFileDiff(slug, runId, file.path)
  }, [slug, runId, file.path, file.revision, fetchFileDiff])

  const plain = diff?.format === "text"
  const rows: DiffRow[] = useMemo(() => {
    if (!diff?.body) return []
    return diff.format === "text" ? textRows(diff.body) : diffRows(diff.body)
  }, [diff])

  if (diff === undefined) {
    return (
      <p role="status" className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {t.diff.loading}
      </p>
    )
  }
  if (diff === null) {
    return (
      <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        {t.diff.failed}
        <button type="button" className="text-foreground underline-offset-2 hover:underline" onClick={() => void fetchFileDiff(slug, runId, file.path)}>{t.diff.retry}</button>
      </p>
    )
  }
  if (diff.withheld) return <p className="px-3 py-2 text-xs text-muted-foreground">{t.diff.withheld}</p>
  if (diff.binary) return <p className="px-3 py-2 text-xs text-muted-foreground">{t.diff.binary}</p>
  if (rows.length === 0) return <p className="px-3 py-2 text-xs text-muted-foreground">{diff.truncated ? t.diff.tooLong : t.diff.empty}</p>

  const onFile = comments.filter((comment) => comment.path === file.path)
  return (
    <div className="overflow-hidden py-1" role="group" aria-label={file.path}>
      {rows.map((row) => {
        if (row.kind === "gap") {
          return <div key={row.key} title={t.diff.gap} aria-label={t.diff.gap} className="select-none bg-muted/50 px-3 text-center font-mono text-[11px] leading-5 text-muted-foreground">⋯</div>
        }
        const target = commentTarget(row)
        const here = onFile.filter((comment) => comment.side === target.side && comment.line === target.line)
        return (
          <div key={row.key}>
            <Line row={row} plain={plain} t={t} onComment={canComment ? (line) => setWriting(line.key) : null} />
            {here.map((comment) => <Comment key={comment.id} comment={comment} t={t} onRemove={() => removeChangeComment(runId, comment.id)} />)}
            {writing === row.key && (
              <CommentForm t={t} onCancel={() => setWriting(null)} onSave={(text) => {
                addChangeComment(runId, { path: file.path, ...target, text })
                setWriting(null)
              }} />
            )}
          </div>
        )
      })}
      {diff.truncated && <p className="px-3 py-1 text-xs text-muted-foreground">{t.diff.tooLong}</p>}
    </div>
  )
}

/** Une ligne de 36 px : le fichier, ses lignes, le retour en arrière au survol ; un clic ouvre le diff sur place. */
function FileRow({ slug, runId, file, canRevert, canComment, error, t }: Readonly<{
  slug: string
  runId: number
  file: MissionFileChange
  canRevert: boolean
  canComment: boolean
  error: string | undefined
  t: Words
}>) {
  const revertFile = useDeliveryStore((s) => s.revertFile)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const { dir, name } = splitPath(file.path)
  const Icon = FILE_ICON[file.status]
  const readable = !file.binary && !file.withheld
  const message = file.status === "added" ? t.revert.added : file.status === "deleted" ? t.revert.deleted : t.revert.modified

  return (
    <li className="group/file flex flex-col">
      <div className="flex h-9 items-center gap-1.5 pr-1 transition-colors duration-150 hover:bg-muted/50 motion-reduce:transition-none">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}
          aria-label={fillText(open ? t.close : t.open, { path: file.path })}
          className={cn("flex h-full min-w-0 flex-1 items-center gap-2 pl-1 text-left text-xs", FOCUS)}>
          <ChevronRight aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
          <span title={t.kinds[file.status]} className="shrink-0"><Icon className="size-3.5 text-muted-foreground" aria-label={t.kinds[file.status]} /></span>
          <span className="flex min-w-0 items-baseline font-mono text-[12px]" title={file.path}>
            {dir && <span className="truncate text-muted-foreground">{dir}</span>}
            <span className="shrink-0 text-foreground">{name}</span>
          </span>
        </button>
        {file.reverting ? (
          <span role="status" className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {t.revert.working}
          </span>
        ) : file.status === "written" && file.added !== null ? (
          <span className="shrink-0 text-xs text-muted-foreground">{t.written} · <span className="font-mono tabular-nums text-chart-3">+{file.added}</span></span>
        ) : file.added === null || file.removed === null ? (
          <span className="shrink-0 text-xs text-muted-foreground">{t.binary}</span>
        ) : (
          <Counts added={file.added} removed={file.removed} t={t} />
        )}
        {canRevert && (
          <button type="button" onClick={() => setConfirming(true)} disabled={file.reverting} title={t.revert.hint} aria-label={`${t.revert.hint}: ${file.path}`}
            className={cn("flex size-7 shrink-0 items-center justify-center text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground focus-visible:opacity-100 group-hover/file:opacity-100 disabled:invisible motion-reduce:transition-none", FOCUS)}>
            <Undo2 className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {error && <p role="alert" className="px-6 pb-1.5 text-xs text-destructive">{error}</p>}
      {open && (
        <div className="border-t border-border">
          {readable || file.truncated
            ? <FileDiff slug={slug} runId={runId} file={file} canComment={canComment && file.status !== "written"} t={t} />
            : <p className="px-3 py-2 text-xs text-muted-foreground">{file.withheld ? t.diff.withheld : t.diff.binary}</p>}
        </div>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{fillText(t.revert.title, { name })}</AlertDialogTitle>
            <AlertDialogDescription>{message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.revert.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void revertFile(slug, runId, file.path)}>{t.revert.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

/** Dire quelque chose à l'agent pendant qu'il travaille : il le lit à sa prochaine étape (R140). */
function Correction({ slug, runId, changes, error, t }: Readonly<{ slug: string; runId: number; changes: Changes; error: string | undefined; t: Words }>) {
  const sendCorrection = useDeliveryStore((s) => s.sendCorrection)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const last = changes.correction
  const failed = last && (last.status === "FAILED" || last.status === "EXPIRED")

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    if (await sendCorrection(slug, runId, value)) setText("")
    setBusy(false)
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} aria-label={t.correction.label} title={t.correction.hint}
          placeholder={t.correction.placeholder}
          className="h-8 min-w-0 flex-1 border border-border bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary" />
        <Button type="submit" size="sm" variant="secondary" className="h-8 text-xs" disabled={busy || !text.trim()} title={t.correction.send} aria-label={busy ? t.correction.sending : t.correction.send}>
          {busy ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="size-3.5" aria-hidden="true" />}
        </Button>
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p>
        : failed ? <p role="alert" className="text-xs text-destructive">{last.message ?? t.correction.failed}</p>
        : last && <p role="status" className="truncate text-xs text-muted-foreground" title={last.text}>{t.correction.sent}</p>}
    </form>
  )
}

/**
 * Les changements d'une mission (R139, séance n°20) : pendant le travail et après, chaque fichier avec ses lignes ajoutées
 * et retirées, un clic pour son diff, le retour en arrière au survol, un commentaire sur une ligne qui repart à l'agent.
 * Lu dans ce que le runner a relevé, jamais dans ce que l'agent en dit. Ce qui n'est pas possible n'est pas proposé (R15) :
 * un runner plus ancien ne relève rien, et rien ne s'affiche.
 */
export function MissionChanges({ run }: Readonly<{ run: DeliveryRun }>) {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.missionChanges)
  const changes = useDeliveryStore((s) => s.missionChanges[run.id])
  const comments = useDeliveryStore((s) => s.changeComments[run.id] ?? NO_COMMENTS)
  const errors = useDeliveryStore((s) => s.changeErrors[run.id])
  const fetchMissionChanges = useDeliveryStore((s) => s.fetchMissionChanges)
  const askForChanges = useDeliveryStore((s) => s.askForChanges)
  const { openMission } = usePaneNavigation()
  const [asking, setAsking] = useState(false)

  const files = changes?.files ?? NO_FILES
  const reverting = files.some((file) => file.reverting)
  const working = run.status === "RUNNING" || run.status === "QUEUED"
  const follow = working || reverting || changes?.correction?.status === "PENDING" || changes?.correction?.status === "RUNNING"

  useEffect(() => {
    if (!slug) return
    void fetchMissionChanges(slug, run.id)
    if (!follow) return
    const id = setInterval(() => { void fetchMissionChanges(slug, run.id) }, POLL_MS)
    return () => clearInterval(id)
  }, [slug, run.id, run.status, follow, fetchMissionChanges])

  // Un fichier en cours de retour qui quitte la liste est revenu comme avant : la ligne part, une phrase le dit.
  const wasReverting = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const present = new Set(files.map((file) => file.path))
    for (const path of wasReverting.current) {
      if (!present.has(path)) toast.success(fillText(t.revert.done, { name: splitPath(path).name }))
    }
    wasReverting.current = new Set(files.filter((file) => file.reverting).map((file) => file.path))
  }, [files, t.revert.done])

  const send = useCallback(async () => {
    setAsking(true)
    const next = await askForChanges(slug, run.issueId, run.id)
    setAsking(false)
    if (next) {
      toast.success(t.comments.sent)
      openMission(next.id)
    }
  }, [askForChanges, openMission, run.id, run.issueId, slug, t.comments.sent])

  // Un runner qui n'a rien relevé (plus ancien, ou une mission d'un autre agent) : rien à montrer ici.
  if (!changes || changes.mode === null) return null

  const review = errors?.[""]
  const count = files.length + changes.more
  const empty = files.length === 0

  return (
    <section aria-label={t.title} className="flex flex-col gap-1.5">
      <h3 className="flex items-baseline gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t.title}
        {!empty && <span className="normal-case tabular-nums">{count === 1 ? t.oneFile : fillText(t.files, { count })}</span>}
        {!empty && changes.mode === "repo" && <span className="normal-case"><Counts added={changes.added} removed={changes.removed} t={t} /></span>}
      </h3>
      {empty ? (
        <p className="text-xs text-muted-foreground">{working ? t.noneYet : t.none}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border" aria-label={t.title}>
          {files.map((file) => (
            <FileRow key={file.path} slug={slug} runId={run.id} file={file} canRevert={changes.canRevert} canComment={changes.canComment}
              error={file.error ?? errors?.[file.path]} t={t} />
          ))}
        </ul>
      )}
      {changes.more > 0 && <p className="text-xs text-muted-foreground">{fillText(t.more, { count: changes.more })}</p>}
      {changes.blockedReason && <p className="text-xs text-muted-foreground">{changes.blockedReason}</p>}
      {changes.canCorrect && <Correction slug={slug} runId={run.id} changes={changes} error={review} t={t} />}
      {comments.length > 0 && changes.canComment && (
        <div className="flex items-center justify-end gap-3 pt-1">
          {review && <p role="alert" className="min-w-0 flex-1 text-xs text-destructive">{review}</p>}
          <span className="text-xs text-muted-foreground">{comments.length === 1 ? t.comments.one : fillText(t.comments.many, { count: comments.length })}</span>
          <Button size="sm" className="h-8 text-xs" disabled={asking} onClick={() => void send()}>
            {asking && <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {t.comments.send}
          </Button>
        </div>
      )}
    </section>
  )
}
