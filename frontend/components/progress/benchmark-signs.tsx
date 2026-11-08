"use client"

import {
  AlignLeft,
  BookOpenText,
  CodeXml,
  ListChecks,
  MousePointerClick,
  PenLine,
  Tags,
  type LucideIcon,
} from "lucide-react"

import { verdictSign, type VerdictSign } from "@/lib/ai/benchmark"
import type { BenchmarkJudge, BenchmarkVerdict } from "@/lib/api/model-benchmark-service"
import { cn } from "@/lib/utils"

/** L'icône de chaque tâche, en tête de sa colonne ; son nom est au survol et pour les lecteurs d'écran (R129). */
export const TASK_ICONS: Record<string, LucideIcon> = {
  summarize: AlignLeft,
  triage: Tags,
  act: MousePointerClick,
  answer: BookOpenText,
  write: PenLine,
  plan: ListChecks,
  code: CodeXml,
}

const TONES: Record<VerdictSign, string> = {
  full: "text-ink-green",
  half: "text-ink-yellow",
  empty: "text-muted-foreground",
  none: "text-muted-foreground/50",
}

/** Le signe d'un verdict : un point plein, un demi-point, un cercle, un tiret ; cerclé quand il est celui d'une personne. */
export function VerdictMark({ verdict, judge, className }: Readonly<{
  verdict: BenchmarkVerdict | null
  judge?: BenchmarkJudge | null
  className?: string
}>) {
  const sign = verdictSign(verdict)
  return (
    <span aria-hidden="true" className={cn("inline-flex size-4 items-center justify-center", TONES[sign], className)}>
      {sign === "none"
        ? <span className="h-px w-2.5 bg-current" />
        : (
          <span
            data-sign={sign}
            className={cn(
              "size-2.5 rounded-full border border-current",
              sign === "full" && "bg-current",
              sign === "half" && "bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]",
              judge && "outline outline-1 outline-offset-1 outline-foreground/60",
            )}
          />
        )}
    </span>
  )
}
