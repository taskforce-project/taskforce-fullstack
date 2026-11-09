"use client"

import {
  AlignLeft,
  BookOpenText,
  ClipboardCheck,
  CodeXml,
  ListChecks,
  MousePointerClick,
  PenLine,
  Tags,
  type LucideIcon,
} from "lucide-react"

import { CapabilitySign } from "@/components/progress/capability-sign"
import { verdictSign } from "@/lib/ai/benchmark"
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
  bank: ClipboardCheck,
}

/**
 * Le signe d'un verdict : le même dessin que les capacités (point plein, demi-point, cercle, tiret), son mot au survol et
 * pour les lecteurs d'écran ; cerclé quand il est le verdict d'une personne (R131).
 */
export function VerdictMark({ verdict, judge, name }: Readonly<{
  verdict: BenchmarkVerdict | null
  judge?: BenchmarkJudge | null
  name: string
}>) {
  return (
    <span className={cn("block size-4 rounded-full", judge && "outline outline-1 outline-offset-0 outline-foreground/60")}>
      <CapabilitySign sign={verdictSign(verdict)} name={name} />
    </span>
  )
}
