"use client"

import { useState } from "react"
import { Undo2 } from "lucide-react"

import { undoAction, type AssistantToolCall } from "@/lib/api/assistant-service"
import { getErrorMessage } from "@/lib/api/client"
import { cn } from "@/lib/utils"

/**
 * « Undo » sous ce que Cortex vient de créer (R77, séance n°13) : un projet resté vide part avec ses pages, une issue
 * sans commentaire ou une note sur laquelle rien ne s'appuie part ; au-delà, le serveur dit pourquoi ce n'est plus
 * possible d'ici.
 */
export function UndoAction({ slug, call }: { slug: string; call: AssistantToolCall }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle")
  const [output, setOutput] = useState<string | null>(null)

  const run = async () => {
    setState("running")
    try {
      const result = await undoAction(slug, call)
      setOutput(result.output)
      setState("done")
    } catch (e) {
      setOutput(getErrorMessage(e))
      setState("error")
    }
  }

  if (state === "done" || state === "error") {
    return (
      <p className={cn("my-1 whitespace-pre-wrap break-words text-xs", state === "done" ? "text-muted-foreground" : "text-destructive")}>
        {state === "done" ? `Undone. ${output}` : output}
      </p>
    )
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={state === "running"}
      className="my-1 flex h-6 w-fit items-center gap-1 border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
    >
      <Undo2 className="size-3" /> {state === "running" ? "Undoing…" : "Undo"}
    </button>
  )
}
