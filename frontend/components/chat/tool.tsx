"use client"

import { useState } from "react"
import { ChevronRight, Wrench, Check, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Carte d'appel d'outil (tool call) pour un agent. Affiche le nom, le statut, et déplie
 * l'entrée/sortie. Prêt à câbler sur le deep-path (Groq/Claude tool calling).
 */
export type ToolStatus = "pending" | "running" | "success" | "error"

export interface ToolProps {
  name: string
  status?: ToolStatus
  input?: unknown
  output?: unknown
  defaultOpen?: boolean
  className?: string
}

const STATUS: Record<ToolStatus, { label: string; cls: string; icon: React.ElementType; spin?: boolean }> = {
  pending: { label: "Pending", cls: "text-muted-foreground", icon: Wrench },
  running: { label: "Running", cls: "text-amber-500", icon: Loader2, spin: true },
  success: { label: "Completed", cls: "text-emerald-500", icon: Check },
  error: { label: "Error", cls: "text-destructive", icon: X },
}

function asText(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "string") return v
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}

export function Tool({ name, status = "success", input, output, defaultOpen = false, className }: ToolProps) {
  const [open, setOpen] = useState(defaultOpen)
  const s = STATUS[status]
  const Icon = s.icon
  return (
    <div className={cn("my-2 overflow-hidden rounded-lg border bg-muted/30 text-sm", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50">
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium">{name}</span>
        <span className={cn("ml-auto flex items-center gap-1 text-xs", s.cls)}>
          <Icon className={cn("size-3.5", s.spin && "animate-spin")} />
          {s.label}
        </span>
      </button>
      {open && (input != null || output != null) && (
        <div className="space-y-2 border-t px-3 py-2">
          {input != null && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Input</div>
              <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-xs">{asText(input)}</pre>
            </div>
          )}
          {output != null && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Output</div>
              <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-xs">{asText(output)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
