"use client"

import { Check, Circle, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Stepper vertical pour suivre une tâche longue / multi-étapes d'un agent (OODA, plan d'exécution).
 */
export type StepStatus = "pending" | "active" | "done" | "error"

export interface Step {
  title: string
  description?: string
  status?: StepStatus
}

export interface StepsProps {
  steps: Step[]
  className?: string
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <Check className="size-3.5 text-emerald-500" />
  if (status === "active") return <Loader2 className="size-3.5 animate-spin text-amber-500" />
  if (status === "error") return <X className="size-3.5 text-destructive" />
  return <Circle className="size-3.5 text-muted-foreground/40" />
}

export function Steps({ steps, className }: StepsProps) {
  return (
    <ol className={cn("my-2 space-y-0", className)}>
      {steps.map((s, i) => {
        const status = s.status ?? "pending"
        const isLast = i === steps.length - 1
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex size-6 items-center justify-center rounded-full border bg-background">
                <StepIcon status={status} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>
            <div className={cn("pb-3", isLast && "pb-0")}>
              <p className={cn("text-sm", status === "pending" ? "text-muted-foreground" : "font-medium")}>{s.title}</p>
              {s.description && <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
