"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { PaneLink } from "@/components/layout/pane-link"
import { saveBlob } from "@/lib/api/project-service"
import { verificationPage, type DossierFile } from "@/lib/delivery/verification"
import { verificationHtml } from "@/lib/delivery/verification-html"
import { verificationSections, type Line, type Section } from "@/lib/delivery/verification-words"
import { usePaneNavigation } from "@/lib/hooks/use-pane-navigation"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import { missionPath } from "@/lib/window/address"

/** Une ligne d'une rubrique : les mots de la page, le long texte du dossier à part, celui de l'agent marqué. */
function SectionLine({ line }: Readonly<{ line: Line }>) {
  return (
    <li className="flex flex-col gap-1">
      <p className={cn("text-sm", line.tone === "muted" && "text-xs text-muted-foreground", line.tone === "warn" && "text-amber-700 dark:text-amber-400")}>
        {line.link ? (
          <>
            {line.text.replace(line.link, "")}
            <a href={line.link} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">{line.link}</a>
          </>
        ) : line.text}
      </p>
      {line.body && (
        <pre
          data-agent={line.tone === "agent" ? "true" : undefined}
          className={cn("max-h-72 overflow-auto whitespace-pre-wrap break-words border border-border bg-muted/40 p-2 text-xs leading-relaxed",
            line.tone === "agent" && "border-l-4")}
        >
          {line.body}
        </pre>
      )}
    </li>
  )
}

function SectionBlock({ section }: Readonly<{ section: Section }>) {
  return (
    <section aria-labelledby={`verification-${section.id}`} className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 id={`verification-${section.id}`} className="text-sm font-semibold text-foreground">{section.title}</h3>
      <ul className="flex flex-col gap-1.5">
        {section.lines.map((line, index) => <SectionLine key={`${section.id}-${index}`} line={line} />)}
      </ul>
    </section>
  )
}

/**
 * La page de vérification d'une mission (R212) : `/{slug}/missions/{runId}/verification`. Tout y vient du dossier exporté
 * de la mission, assemblé par du code ({@link verificationPage}) ; rien n'y est écrit par l'agent, sauf son résumé, marqué.
 * Elle s'ouvre depuis la mission et par le lien de sa pull request, et s'exporte en un fichier qui porte son dossier.
 */
export function VerificationView({ runId }: Readonly<{ runId: number }>) {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.verification)
  const evidence = useDeliveryStore((s) => s.evidence[runId])
  const fetchEvidence = useDeliveryStore((s) => s.fetchEvidence)
  const { openMission } = usePaneNavigation()
  // La lecture a échoué sans dire que la mission n'a pas de dossier (le store garde alors `undefined`) : la page le dit.
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!slug) return
    void fetchEvidence(slug, runId).then((read) => setFailed(read === null))
  }, [slug, runId, fetchEvidence])

  const sections = useMemo(() => (evidence ? verificationSections(verificationPage(evidence as DossierFile), t) : null), [evidence, t])

  if (evidence === undefined) {
    if (failed) return <p role="status" className="text-sm text-muted-foreground">{t.failed}</p>
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t.loading}
      </p>
    )
  }
  if (evidence === null || !sections) return <p role="status" className="text-sm text-muted-foreground">{t.none}</p>

  const page = verificationPage(evidence as DossierFile)
  const heading = page.mission.issue ? `${t.title}: ${page.mission.issue}` : t.title

  function download() {
    try {
      const html = verificationHtml({ title: heading, heading, notes: [t.audience, t.assembled, t.scope] }, sections ?? [],
        JSON.stringify(evidence, null, 2))
      saveBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `verification-run-${runId}.html`)
      toast.success(t.record.downloaded)
    } catch {
      toast.error(t.record.downloadFailed)
    }
  }

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-4" aria-labelledby="verification-title">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id="verification-title" className="text-base font-semibold text-foreground">{heading}</h2>
          <button type="button" onClick={download}
            className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-xs text-foreground hover:bg-muted">
            <Download className="size-3.5" aria-hidden="true" /> {t.record.download}
          </button>
        </div>
        <p className="text-sm text-foreground">{t.audience}</p>
        <p className="text-xs text-muted-foreground">{t.assembled}</p>
        <p className="text-xs text-muted-foreground">{t.scope}</p>
        <PaneLink href={missionPath(slug, runId)} open={() => openMission(runId)}
          className="w-fit text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
          {t.back}
        </PaneLink>
      </header>
      {sections.map((section) => <SectionBlock key={section.id} section={section} />)}
    </article>
  )
}
