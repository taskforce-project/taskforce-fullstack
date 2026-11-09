"use client"

import { useState, type ReactNode } from "react"
import { ChevronRight, Circle, CircleCheck, CircleDashed, CirclePause, CircleStop, CircleX, Loader2, type LucideIcon } from "lucide-react"

import { collapseRepeats, type MissionLine, type MissionStep, type MissionStepKey, type MissionStepState } from "@/lib/delivery/mission-sequence"
import { fillText } from "@/lib/delivery/result-card"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"
import { parseServerDate } from "@/lib/utils/server-date"

/** Au-delà, une étape montre ses dernières lignes : sa hauteur reste bornée, et ce qui vient d'arriver reste visible. */
const SHOWN_LINES = 8

const ICON: Readonly<Record<MissionStepState, { icon: LucideIcon; className: string }>> = {
  "not-started": { icon: Circle, className: "text-muted-foreground/45" },
  "in-progress": { icon: Loader2, className: "animate-spin text-primary motion-reduce:animate-none" },
  waiting: { icon: CirclePause, className: "text-ink-yellow" },
  done: { icon: CircleCheck, className: "text-ink-green" },
  skipped: { icon: CircleDashed, className: "text-muted-foreground/60" },
  failed: { icon: CircleX, className: "text-destructive" },
  stopped: { icon: CircleStop, className: "text-muted-foreground" },
}

/** L'état d'une étape (« Le dessin ») : un rond vide, un anneau qui tourne, une coche ; son nom au survol, et pour un lecteur d'écran. */
export function MissionStepIcon({ state, label, className }: Readonly<{ state: MissionStepState; label: string; className?: string }>) {
  const { icon: Icon, className: tone } = ICON[state]
  return (
    <span role="img" aria-label={label} title={label} data-state={state} className="inline-flex shrink-0">
      <Icon className={cn("size-4 transition-colors duration-150 motion-reduce:transition-none", tone, className)} aria-hidden="true" />
    </span>
  )
}

export const timeOf = (at: string | null): string =>
  at ? parseServerDate(at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""

/** Une ligne du détail : sa phrase ; avec l'interrupteur, sa ligne brute et son heure. */
export function MissionDetailLine({ line, times = 1, showCommands }: Readonly<{ line: MissionLine; times?: number; showCommands: boolean }>) {
  const t = usePreferencesStore((s) => s.t.missionSequence.lines)
  return (
    <li className="flex min-w-0 flex-col gap-0.5 py-0.5 text-xs leading-relaxed">
      <span className={cn("min-w-0 break-words", line.failed ? "text-destructive" : "text-foreground")}>
        {line.sentence}
        {times > 1 && <span className="tabular-nums text-muted-foreground"> · {fillText(t.times, { count: times })}</span>}
      </span>
      {showCommands && (line.raw || line.at) && (
        <span className="flex min-w-0 items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="min-w-0 break-all font-mono">{line.raw}</span>
          {line.at && <span className="shrink-0 tabular-nums">{timeOf(line.at)}</span>}
        </span>
      )}
    </li>
  )
}

function StepLines({ lines, showCommands }: Readonly<{ lines: readonly MissionLine[]; showCommands: boolean }>) {
  const t = usePreferencesStore((s) => s.t.missionSequence)
  const [all, setAll] = useState(false)
  // Une même phrase de suite se lit une fois ; avec les commandes, chaque ligne brute garde la sienne.
  const entries = showCommands ? lines.map((line) => ({ line, times: 1 })) : collapseRepeats(lines)
  const hidden = all ? 0 : Math.max(0, entries.length - SHOWN_LINES)
  return (
    <>
      {hidden > 0 && (
        <button type="button" onClick={() => setAll(true)} className="w-fit py-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          {fillText(t.showEarlier, { count: hidden })}
        </button>
      )}
      <ol className="flex flex-col">
        {entries.slice(hidden).map(({ line, times }) => <MissionDetailLine key={line.seq} line={line} times={times} showCommands={showCommands} />)}
      </ol>
    </>
  )
}

/**
 * Les cinq étapes d'une mission (R138, « Le dessin ») : cinq lignes de 40 px, l'état, le nom, la phrase. L'étape où en est
 * la mission est ouverte, les autres se déplient d'un clic ; ce qu'on a ouvert ou fermé à la main le reste. Ce qui attend
 * la personne (`waiting`) s'ouvre dans son étape et ne se referme pas tant qu'elle n'a pas répondu.
 */
export function MissionSteps({ steps, showCommands, waiting, waitingLabel }: Readonly<{
  steps: readonly MissionStep[]
  showCommands: boolean
  /** Les demandes qui attendent, montrées dans l'étape qui attend. */
  waiting?: ReactNode
  /** Le nom de l'état « en attente » quand ce n'est pas à la personne qui regarde de répondre. */
  waitingLabel?: string
}>) {
  const states = usePreferencesStore((s) => s.t.missionSequence.states)
  const [touched, setTouched] = useState<Partial<Record<MissionStepKey, boolean>>>({})

  return (
    <ol className="flex flex-col divide-y divide-border border-y border-border">
      {steps.map((step) => {
        const holdsRequest = step.state === "waiting" && Boolean(waiting)
        const open = holdsRequest || (touched[step.key] ?? step.current)
        const stateName = step.state === "waiting" && waitingLabel ? waitingLabel : states[step.state]
        return (
          <li key={step.key}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setTouched((was) => ({ ...was, [step.key]: !open }))}
              className="flex h-10 w-full items-center gap-2.5 px-2 text-left text-[13px] transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none"
            >
              <MissionStepIcon state={step.state} label={stateName} />
              <span className="w-[72px] shrink-0 font-medium text-foreground">{step.name}</span>
              <span
                title={step.sentence}
                className={cn("min-w-0 flex-1 truncate", step.state === "not-started" || step.state === "skipped" ? "text-muted-foreground/70" : "text-muted-foreground")}
              >
                {step.sentence}
              </span>
              <ChevronRight
                aria-hidden="true"
                className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")}
              />
            </button>
            {open && (step.lines.length > 0 || holdsRequest) && (
              <div className="flex flex-col gap-2 pb-2.5 pl-[34px] pr-2">
                {holdsRequest && waiting}
                {step.lines.length > 0 && <StepLines lines={step.lines} showCommands={showCommands} />}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
