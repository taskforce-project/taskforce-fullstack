"use client"

import { useCallback, useEffect, useId, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Download, FileJson, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { RecordUnavailable } from "@/components/delivery/record-unavailable"
import { PaneLink } from "@/components/layout/pane-link"
import type { MissionEvidence } from "@/lib/api/delivery-service"
import { saveBlob } from "@/lib/api/project-service"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { appVersion } from "@/lib/app-version"
import { fillText } from "@/lib/delivery/result-card"
import { verificationPage, type DossierFile } from "@/lib/delivery/verification"
import { checkRecord, type RecordCheck } from "@/lib/delivery/verification-check"
import { verificationHtml } from "@/lib/delivery/verification-html"
import {
  alertLines, exportHowTo, linkable, pageTitle, summarySentence, verdictLines, verificationSections, when, type Block, type Line, type Section,
} from "@/lib/delivery/verification-words"
import { IS_DESKTOP } from "@/lib/desktop"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import { missionPath } from "@/lib/window/address"

type Texts = typeof CONSTANTS_EN.verification

/** Au-delà, le résumé de l'agent se replie : la page ne le coupe pas dans une boîte qui défile (R161 M2). */
const SUMMARY_FOLD = 6

const TONE: Record<NonNullable<Line["tone"]>, string> = {
  muted: "text-xs text-muted-foreground",
  warn: "text-amber-700 dark:text-amber-400",
  ok: "text-emerald-800 dark:text-emerald-400",
  agent: "",
}

/** Le texte d'une ligne, avec son lien quand il mène à GitHub (R159 P7). */
function LineText({ line }: Readonly<{ line: Line }>) {
  if (!line.link || !linkable(line.link) || !line.text.includes(line.link)) return <>{line.text}</>
  const [before, after] = line.text.split(line.link, 2)
  return (
    <>
      {before}
      <a href={line.link} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">{line.link}</a>
      {after}
    </>
  )
}

function Inline({ block }: Readonly<{ block: Block }>) {
  return <>{block.parts.map((part, i) => (part.code ? <code key={i} className="font-mono text-[0.9em]">{part.text}</code> : <span key={i}>{part.text}</span>))}</>
}

/** Le résumé de l'agent : ses titres, ses listes et son code cité, sans lien ni image, toujours marqué comme le sien. */
function AgentSummary({ blocks, t }: Readonly<{ blocks: readonly Block[]; t: Texts }>) {
  const [all, setAll] = useState(false)
  const id = useId()
  const shown = all ? blocks : blocks.slice(0, SUMMARY_FOLD)
  return (
    <div data-agent="true" className="flex flex-col gap-1 border-l-4 border-border pl-3 text-sm">
      <div id={id} className="flex flex-col gap-1">
        {shown.map((block, i) => block.kind === "heading" ? <p key={i} className="font-semibold"><Inline block={block} /></p>
          : block.kind === "item" ? <p key={i} className="pl-3 before:mr-1.5 before:content-['•']"><Inline block={block} /></p>
          : <p key={i}><Inline block={block} /></p>)}
      </div>
      {blocks.length > SUMMARY_FOLD && (
        <button type="button" aria-expanded={all} aria-controls={id} onClick={() => setAll(!all)}
          className="w-fit text-xs text-foreground underline underline-offset-2">
          {all ? t.showLess : t.showMore}
        </button>
      )}
    </div>
  )
}

/** Une longue liste (les fichiers) : les premières lignes, les autres à un clic (R161 M1). */
function FoldedList({ list, t }: Readonly<{ list: NonNullable<Line["list"]>; t: Texts }>) {
  const [all, setAll] = useState(false)
  const id = useId()
  const shown = all ? list.lines : list.lines.slice(0, list.fold)
  return (
    <div className="flex flex-col gap-0.5">
      <ul id={id} className="flex flex-col gap-0.5">
        {shown.map((line, i) => <li key={i} className={cn("break-words", line.tone && TONE[line.tone])}><LineText line={line} /></li>)}
      </ul>
      {list.lines.length > list.fold && (
        <button type="button" aria-expanded={all} aria-controls={id} onClick={() => setAll(!all)}
          className="w-fit text-xs text-foreground underline underline-offset-2">
          {all ? t.showFewerFiles : fillText(t.showAllFiles, { count: list.lines.length })}
        </button>
      )}
    </div>
  )
}

/** Une ligne d'une rubrique : les mots de la page, le long texte du dossier à part, celui de l'agent marqué. */
function SectionLine({ line, t }: Readonly<{ line: Line; t: Texts }>) {
  return (
    <li className="flex flex-col gap-1">
      <p className={cn("break-words text-sm", line.tone && TONE[line.tone])}><LineText line={line} /></p>
      {line.blocks && <AgentSummary blocks={line.blocks} t={t} />}
      {line.list && <FoldedList list={line.list} t={t} />}
      {line.body && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t.showDetails}</summary>
          <p className="mt-1 whitespace-pre-wrap break-words border border-border bg-muted/40 p-2 leading-relaxed">{line.body}</p>
        </details>
      )}
    </li>
  )
}

/** Une rubrique : son titre et sa première ligne, le détail à un clic (R133, R161 M1). */
function SectionBlock({ section, t }: Readonly<{ section: Section; t: Texts }>) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const [first, ...rest] = section.lines
  return (
    <section aria-labelledby={`verification-${section.id}`} className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 id={`verification-${section.id}`} className="text-sm font-semibold text-foreground">{section.title}</h3>
      <ul className="flex flex-col gap-1.5">
        {first && <SectionLine line={first} t={t} />}
      </ul>
      {rest.length > 0 && (
        <>
          {open && (
            <ul id={id} className="flex flex-col gap-1.5">
              {rest.map((line, index) => <SectionLine key={`${section.id}-${index}`} line={line} t={t} />)}
            </ul>
          )}
          <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
            className="w-fit text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
            {open ? t.hideDetails : t.showDetails}
          </button>
        </>
      )}
    </section>
  )
}

/**
 * La page de vérification d'une mission (R212) : `/{slug}/missions/{runId}/verification`. Tout y vient du dossier exporté
 * de la mission, assemblé par du code ({@link verificationPage}), et vérifié dans l'app avant d'en rien dire, avec le
 * vérificateur du runner ({@link checkRecord}). Elle s'ouvre depuis la mission, sa carte de résultat et le lien de sa pull
 * request, et s'exporte en un fichier qui porte son dossier.
 */
export function VerificationView({ runId }: Readonly<{ runId: number }>) {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.verification)
  const evidence = useDeliveryStore((s) => s.evidence[runId])
  const legacyRefused = useDeliveryStore((s) => s.evidenceLegacy[runId] === true)
  const keys = useDeliveryStore((s) => s.evidenceKeys[slug])
  const fetchEvidence = useDeliveryStore((s) => s.fetchEvidence)
  const fetchEvidenceKeys = useDeliveryStore((s) => s.fetchEvidenceKeys)
  const downloadEvidence = useDeliveryStore((s) => s.downloadEvidence)
  const { openMission } = usePaneNavigation()
  // La lecture a échoué sans dire que la mission n'a pas de dossier (le store garde alors `undefined`) : la page le dit.
  const [failed, setFailed] = useState(false)
  const [readAt, setReadAt] = useState<string | null>(null)
  // La vérification d'une lecture du dossier : une nouvelle lecture (« Refresh ») attend la sienne.
  const [checked, setChecked] = useState<{ file: MissionEvidence; keys: readonly string[] | null; result: RecordCheck } | null>(null)

  const read = useCallback(() => {
    if (!slug) return
    void fetchEvidence(slug, runId).then((file) => {
      setFailed(file === null)
      setReadAt(new Date().toISOString())
    })
  }, [slug, runId, fetchEvidence])

  const retry = () => {
    setFailed(false)
    read()
  }

  useEffect(() => {
    read()
    if (slug) void fetchEvidenceKeys(slug)
  }, [read, slug, fetchEvidenceKeys])

  // La page vérifie le dossier avant d'en rien dire : la chaîne, l'en-tête, les textes, le sceau (R161 B1, R159 P5).
  useEffect(() => {
    if (!evidence || keys === undefined) return
    let current = true
    void checkRecord(evidence, keys).then((result) => {
      if (current) setChecked({ file: evidence, keys, result })
    })
    return () => {
      current = false
    }
  }, [evidence, keys])
  const check = checked && checked.file === evidence && checked.keys === keys ? checked.result : null

  const page = useMemo(() => (evidence ? verificationPage(evidence as DossierFile, check) : null), [evidence, check])
  const context = useMemo(() => ({ runId, desktop: IS_DESKTOP }), [runId])
  const sections = useMemo(() => (page ? verificationSections(page, t, context) : null), [page, t, context])

  const back = (
    <PaneLink href={missionPath(slug, runId)} open={() => openMission(runId)}
      className="w-fit text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
      {t.back}
    </PaneLink>
  )

  if (evidence === undefined) {
    if (failed) {
      return (
        <RecordUnavailable title={t.title} message={t.failed} hint={t.failedHint} back={back}
          action={<button type="button" onClick={retry} className="w-fit border border-border px-2 py-1 text-xs text-foreground hover:bg-muted">{t.tryAgain}</button>} />
      )
    }
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t.loading}
      </p>
    )
  }
  // Un dossier d'avant la 1.18 que la personne peut lire, mais pas en JSON : la page le dit, et offre l'export Markdown, qui
  // masque les courriels (R159, second tour, N4).
  if (evidence === null && legacyRefused) {
    const downloadMarkdown = async () => {
      const ok = await downloadEvidence(slug, runId, "md")
      if (ok) toast.success(t.markdownDownloaded)
      else toast.error(t.markdownDownloadFailed)
    }
    return (
      <RecordUnavailable title={t.title} message={t.legacyDenied} hint={t.legacyDeniedHint} back={back}
        action={(
          <button type="button" onClick={() => void downloadMarkdown()}
            className="inline-flex w-fit items-center gap-1.5 border border-border px-2 py-1 text-xs text-foreground hover:bg-muted">
            <Download className="size-3.5" aria-hidden="true" /> {t.downloadMarkdown}
          </button>
        )} />
    )
  }
  // 403 et 404 : un seul message, qui ne dit pas lequel (R159 P2).
  if (evidence === null || !page || !sections) return <RecordUnavailable title={t.title} message={t.denied} hint={t.deniedHint} back={back} />
  // Rien du dossier avant la fin de sa vérification, pas même le titre de la demande : un texte changé ne s'affiche jamais,
  // même un instant (R159 de #552, second tour, V4).
  if (!check) {
    return (
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-4" aria-labelledby="verification-title">
        <header className="flex flex-col gap-2">
          <h2 id="verification-title" className="text-base font-semibold text-foreground">{t.title}</h2>
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t.checking}
          </p>
          {back}
        </header>
      </article>
    )
  }

  const heading = pageTitle(page, t)
  const verdict = verdictLines(page, t)
  // Un dossier changé après coup se voit d'un coup d'œil, à part des réserves de tout dossier sain (R161 N1, R159 V1).
  const alert = alertLines(verdict)
  const sentence = summarySentence(page, t)

  function downloadPage() {
    if (!page || !sections) return
    try {
      const id = page.mission.id ?? runId
      const html = verificationHtml({
        title: heading,
        assembled: fillText(t.export.assembled, {
          version: appVersion().label,
          source: IS_DESKTOP ? t.export.desktop : globalThis.location?.host ?? "",
          date: when(new Date().toISOString()),
          id,
          workspace: page.mission.workspace ?? slug,
        }),
        verdict: verdict.filter((line) => !line.alert),
        alert: alert.length > 0 ? { title: t.changedRecord.title, lines: alert, says: t.changedRecord.says } : null,
        proves: t.export.proves,
        sentence,
        notes: [t.audience, t.assembled, t.scope],
        howTo: exportHowTo(page, t, context),
        moreFiles: t.showAllFiles,
        // Une chaîne d'avant la 1.18 nomme les personnes par leur courriel : la page exportée ne la porte pas (N4).
      }, sections, page.legacy ? null : JSON.stringify(evidence, null, 2))
      saveBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `verification-run-${id}.html`)
      toast.success(t.record.downloaded)
    } catch {
      toast.error(t.record.downloadFailed)
    }
  }

  async function downloadRecord() {
    const ok = await downloadEvidence(slug, runId, "json")
    if (ok) toast.success(t.record.recordDownloaded)
    else toast.error(t.record.recordDownloadFailed)
  }

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-4" aria-labelledby="verification-title">
      <header className="flex flex-col gap-2">
        <h2 id="verification-title" className="text-base font-semibold text-foreground">{heading}</h2>
        {alert.length > 0 && (
          <div role="alert" className="flex flex-col gap-1 border-l-4 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-300">
            <p className="font-semibold">{t.changedRecord.title}</p>
            <ul className="flex flex-col gap-1">
              {alert.map((line, i) => <li key={i}>{line.text}</li>)}
            </ul>
          </div>
        )}
        <ul aria-live="polite" className="flex flex-col gap-1">
          {verdict.filter((line) => !line.alert).map((line, i) => (
            <li key={i} className={cn("flex items-start gap-2 text-sm", line.tone && TONE[line.tone])}>
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
        {page.running && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <span>{fillText(t.running, { time: when(readAt) })}</span>
            <button type="button" onClick={read} className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-xs text-foreground hover:bg-muted">
              <RefreshCw className="size-3.5" aria-hidden="true" /> {t.refresh}
            </button>
          </div>
        )}
        {alert.length > 0 && <p className="text-sm font-semibold text-foreground">{t.changedRecord.says}</p>}
        <p className="text-sm text-foreground">{sentence}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={downloadPage}
            className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50">
            <Download className="size-3.5" aria-hidden="true" /> {t.record.download}
          </button>
          <button type="button" onClick={() => void downloadRecord()}
            className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-xs text-foreground hover:bg-muted">
            <FileJson className="size-3.5" aria-hidden="true" /> {t.record.downloadRecord}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t.record.downloads}</p>
        <p className="text-xs text-muted-foreground">{t.audience} {t.assembled} {t.scope}</p>
        {back}
      </header>
      {sections.map((section) => <SectionBlock key={section.id} section={section} t={t} />)}
    </article>
  )
}
