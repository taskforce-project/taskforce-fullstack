"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { CodeXml, Play, RotateCw, ScrollText, Square, Wrench, type LucideIcon } from "lucide-react"

import { BusyMark } from "@/components/progress/busy-mark"
import { CapabilitySign } from "@/components/progress/capability-sign"
import { Named } from "@/components/progress/named"
import { Button } from "@/components/ui/button"
import { failedCaseTitles, fillModelText, proposedFor, scoreLine, scoreSign, scoreText } from "@/lib/ai/model-table"
import type {
  ModelCapabilityInfo, ModelCapabilityRow, ModelCapabilityTable as Table,
} from "@/lib/api/model-capability-service"
import { dayOf } from "@/lib/progress/day"
import { cardLine } from "@/lib/progress/model-card"
import { useEvalStore } from "@/lib/store/eval-store"
import { useModelCapabilityStore, type ModelMeasureProgress } from "@/lib/store/model-capability-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { cn } from "@/lib/utils"

/** Les capacités qui ont leur icône ; les autres (le français, l'anglais) disent deux lettres de leur nom. */
const CAPABILITY_ICON: Readonly<Record<string, LucideIcon>> = { tools: Wrench, context: ScrollText, code: CodeXml }

/** La tête d'une colonne : l'icône de la capacité, 16 px de large, son nom au survol. */
function CapabilityHead({ capability }: Readonly<{ capability: ModelCapabilityInfo }>) {
  const Icon = CAPABILITY_ICON[capability.key]
  const name = `${capability.label}: ${capability.description}`
  return (
    <Named name={name} wide>
      <span role="img" aria-label={name} className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        {Icon
          ? <Icon className="size-3.5" aria-hidden />
          : <span aria-hidden className="text-[9px] font-medium uppercase leading-none">{capability.label.slice(0, 2)}</span>}
      </span>
    </Named>
  )
}

/** Ce que la ligne dit d'une mesure qui la concerne : « 3/8 », ou les secondes du frein de débit ; la phrase au survol. */
function MeasureMark({ progress }: Readonly<{ progress: ModelMeasureProgress }>) {
  const t = usePreferencesStore((s) => s.t.models)
  const waiting = progress.waitSeconds !== null
  const text = waiting
    ? fillModelText(t.waiting, { seconds: progress.waitSeconds ?? 0 })
    : fillModelText(progress.auto ? t.autoMeasuring : t.measuring, { model: progress.model, done: progress.done, total: progress.total })
  return <BusyMark short={waiting ? `${progress.waitSeconds} s` : `${progress.done}/${progress.total}`} text={text} />
}

/**
 * Le geste de mesure, toujours visible et entier (R130) : une icône, son nom au survol. Pendant la mesure de ce modèle, il
 * devient son arrêt ; pendant une autre mesure ou un rejeu de la banque, il attend.
 */
function MeasureAction({ slug, row }: Readonly<{ slug: string; row: ModelCapabilityRow }>) {
  const t = usePreferencesStore((s) => s.t.models)
  const progress = useModelCapabilityStore((s) => s.progress)
  const measure = useModelCapabilityStore((s) => s.measure)
  const stop = useModelCapabilityStore((s) => s.stop)
  // Un rejeu de la banque tient déjà le modèle : une mesure attend qu'il finisse.
  const replaying = useEvalStore((s) => s.progress !== null)

  if (progress?.model === row.model) {
    return (
      <Named name={t.stop}>
        <span className="inline-flex shrink-0">
          <Button size="icon-sm" variant="ghost" onClick={stop} disabled={progress.stopping} aria-label={t.stop}>
            <Square className="size-3.5" />
          </Button>
        </span>
      </Named>
    )
  }
  const name = row.measuredAt ? t.measureAgain : t.measure
  const Icon = row.measuredAt ? RotateCw : Play
  return (
    <Named name={name}>
      <span className="inline-flex shrink-0">
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={progress !== null || replaying}
          onClick={() => void measure(slug, row.model)}
          aria-label={name}
        >
          <Icon className="size-3.5" />
        </Button>
      </span>
    </Named>
  )
}

/**
 * Le détail d'un modèle, dans sa ligne (R130) : les cas ratés, chaque capacité en mots, ce que dit sa fiche, la date, ce
 * que TaskForce le propose pour, ce que mesurer veut dire, et « Use for Cortex ». Ce qui a quitté le premier regard est ici.
 */
function ModelDetail({ slug, id, table, row }: Readonly<{ slug: string; id: string; table: Table; row: ModelCapabilityRow }>) {
  const t = usePreferencesStore((s) => s.t.models)
  const tp = usePreferencesStore((s) => s.t.progress)
  const choose = useModelCapabilityStore((s) => s.choose)
  const card = cardLine(row.card, tp)
  const proposed = proposedFor(table, row.model, t)
  return (
    <div id={id} className="flex flex-col gap-1 pb-3 pl-5 pr-9 text-xs text-muted-foreground">
      {failedCaseTitles(table, row).map((title) => (
        <p key={title} className="text-foreground">{fillModelText(t.caseFailed, { title })}</p>
      ))}
      {row.measuredAt && <p>{scoreLine(table, row, t)}</p>}
      {card && <p>{card}</p>}
      <p>{row.measuredAt ? fillModelText(t.measuredOn, { date: dayOf(row.measuredAt) }) : tp.notMeasuredYet}</p>
      {proposed && <p>{proposed}</p>}
      <p>{fillModelText(t.hint, { cases: table.cases.length })}</p>
      <div className="pt-1">
        {row.current ? (
          <span className="text-foreground">{t.inUse}</span>
        ) : (
          // Le modèle de l'instance se suit sans être épinglé : le reprendre efface le choix de la personne.
          <Button size="sm" variant="outline" onClick={() => void choose(slug, row.model === table.instanceModel ? null : row.model)}>
            {t.useForCortex}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Une ligne, 36 px (« Le dessin », séance n°19) : le point du modèle en service, son nom, un signe par capacité, le geste. */
function ModelLine({ slug, table, row, open, onToggle }: Readonly<{
  slug: string
  table: Table
  row: ModelCapabilityRow
  open: boolean
  onToggle: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.models)
  const progress = useModelCapabilityStore((s) => s.progress)
  const detailId = useId()
  const nameOf = (capability: string) => table.capabilities.find((c) => c.key === capability)?.label ?? capability
  return (
    <li>
      <div className="flex h-9 items-center gap-1">
        <button
          type="button"
          data-model-line
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          onClick={onToggle}
          className={cn(
            "flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left transition-colors duration-150 hover:bg-muted motion-reduce:transition-none",
            open && "bg-muted",
          )}
        >
          <span className="flex w-3 shrink-0 justify-center">
            {row.current && (
              <Named name={t.inUse}>
                <span role="img" aria-label={t.inUse} className="block size-1.5 rounded-full bg-primary" />
              </Named>
            )}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{row.model}</span>
          {progress?.model === row.model && <MeasureMark progress={progress} />}
          <span className="flex shrink-0">
            {row.scores.map((score) => (
              <CapabilitySign
                key={score.capability}
                sign={scoreSign(score)}
                name={`${nameOf(score.capability)}: ${scoreText(score, t)}`}
              />
            ))}
          </span>
        </button>
        <MeasureAction slug={slug} row={row} />
      </div>
      {open && <ModelDetail slug={slug} id={detailId} table={table} row={row} />}
    </li>
  )
}

/**
 * Ce que sait faire chaque modèle, mesuré ici (R113 ; R125, R130, R129) : une ligne par modèle, le modèle en service
 * d'abord, un signe par capacité, jamais de classement. Le reste à un clic, dans la ligne. Le modèle de Cortex sans mesure
 * complète se mesure une fois, sans clic, quand la table s'ouvre ; les autres restent à la demande. Rien ne change de
 * modèle sans la personne.
 */
export function ModelCapabilityTable({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.models)
  const tp = usePreferencesStore((s) => s.t.progress)
  const table = useModelCapabilityStore((s) => s.table)
  const error = useModelCapabilityStore((s) => s.error)
  const fetchTable = useModelCapabilityStore((s) => s.fetchTable)
  const measureCortexModel = useModelCapabilityStore((s) => s.measureCortexModel)
  const openSettings = useSettingsStore((s) => s.openSettings)
  const [opened, setOpened] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (slug) void fetchTable(slug)
  }, [slug, fetchTable])
  // Le modèle de Cortex sans mesure complète se mesure une fois, sans clic, quand la table s'ouvre ou que le modèle de
  // Cortex change. Les autres restent à la demande ; le store garde ce qu'il a déjà mesuré seul.
  useEffect(() => {
    if (slug && table) void measureCortexModel(slug)
  }, [slug, table, measureCortexModel])

  if (!table) return <p className="text-xs text-muted-foreground">{tp.reading}</p>
  if (table.models.length === 0) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {t.noModels}
        <Button size="sm" variant="outline" onClick={() => openSettings("ai")}>{tp.setUpAi}</Button>
      </p>
    )
  }

  // Le modèle en service d'abord, puis l'ordre de la table : jamais un classement (R57).
  const rows = [...table.models].sort((a, b) => Number(b.current) - Number(a.current))

  /** Les flèches passent d'une ligne à l'autre, Entrée ouvre son détail : le geste du bouton de la ligne. */
  const arrows = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const lines = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-model-line]") ?? [])]
    const here = lines.indexOf(document.activeElement as HTMLButtonElement)
    if (here < 0) return
    event.preventDefault()
    lines[Math.min(Math.max(here + (event.key === "ArrowDown" ? 1 : -1), 0), lines.length - 1)]?.focus()
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Les têtes s'alignent sur les signes : la place du geste de mesure (28 + 4 px) et le retrait du bouton (4 px). */}
      <div className="flex h-5 justify-end pr-9">
        {table.capabilities.map((capability) => <CapabilityHead key={capability.key} capability={capability} />)}
      </div>
      <ul ref={listRef} onKeyDown={arrows} className="flex flex-col">
        {rows.map((row) => (
          <ModelLine
            key={row.model}
            slug={slug}
            table={table}
            row={row}
            open={opened === row.model}
            onToggle={() => setOpened(opened === row.model ? null : row.model)}
          />
        ))}
      </ul>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
