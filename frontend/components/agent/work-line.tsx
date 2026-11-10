"use client"

import { useId, useState } from "react"
import { ChevronRight, LoaderCircle } from "lucide-react"

import { Reasoning } from "@/components/chat"
import type { AssistantAnswer } from "@/lib/api/assistant-service"
import { didWork, stepLine, workedLine, workSentences, type WorkSentence } from "@/lib/cortex/work-lines"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

const CHEVRON = "size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none"

/**
 * La ligne de travail (R137, à la manière de Dust) : pendant que Cortex travaille, une seule ligne calme dit ce qui se
 * passe, l'étape que le serveur vient d'annoncer ; sans étape connue, « Working… » seul, jamais une phase inventée.
 */
export function WorkingLine() {
  const t = usePreferencesStore((s) => s.t.thread)
  const step = useCortexStore((s) => s.workStep)
  const said = stepLine(step, t)
  return (
    <p role="status" className="flex h-6 items-center gap-2 text-xs text-muted-foreground">
      <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
      <span className="truncate">{said ? `${t.working} ${said}` : t.working}</span>
    </p>
  )
}

/** Une phrase du détail ; le brut du geste, s'il est connu, un clic plus loin (R133). */
function WorkItem({ sentence }: Readonly<{ sentence: WorkSentence }>) {
  const t = usePreferencesStore((s) => s.t.thread)
  const [open, setOpen] = useState(false)
  const id = useId()
  const raw = sentence.raw
  if (!raw) return <li className="py-0.5">{sentence.text}</li>
  const name = open ? t.hideRaw : t.showRaw
  return (
    <li className="py-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${sentence.text}. ${name}`}
        title={name}
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-full items-center gap-1 text-left transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
      >
        <span className="min-w-0">{sentence.text}</span>
        <ChevronRight aria-hidden className={cn(CHEVRON, open && "rotate-90")} />
      </button>
      {open && (
        <div id={id} className="mt-1 flex flex-col gap-1.5 border-l border-border pl-2">
          {raw.input != null && <RawBlock label={t.rawInput} text={raw.input} />}
          {raw.output != null && <RawBlock label={t.rawOutput} text={raw.output} />}
        </div>
      )}
    </li>
  )
}

function RawBlock({ label, text }: Readonly<{ label: string; text: string }>) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground">{text}</pre>
    </div>
  )
}

/**
 * À la fin, « Worked for 8 s » et un chevron (R137). Dépliée, la ligne dit en phrases ce qui a été lu et fait, jamais un nom
 * d'outil. Une réponse qui n'a rien fait d'autre n'en a pas : son texte et sa ligne grise. Les cartes restent visibles, hors
 * du pli.
 */
export function WorkedLine({ answer }: Readonly<{ answer: Pick<AssistantAnswer, "toolCalls" | "read" | "reasoning"> }>) {
  const t = usePreferencesStore((s) => s.t.thread)
  const [open, setOpen] = useState(false)
  const id = useId()
  if (!didWork(answer)) return null
  const name = open ? t.hideWork : t.showWork
  return (
    <div className="text-xs text-muted-foreground">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={name}
        onClick={() => setOpen((v) => !v)}
        className="flex h-6 items-center gap-1 transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
      >
        <span>{workedLine(answer, t)}</span>
        <ChevronRight aria-hidden className={cn(CHEVRON, open && "rotate-90")} />
      </button>
      {open && (
        <div id={id} className="pb-1 pl-1">
          <ul>
            {workSentences(answer, t).map((sentence, i) => <WorkItem key={i} sentence={sentence} />)}
          </ul>
          {answer.reasoning && <Reasoning content={answer.reasoning} />}
        </div>
      )}
    </div>
  )
}
