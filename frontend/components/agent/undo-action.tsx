"use client"

import { Undo2 } from "lucide-react"

import type { AssistantToolCall } from "@/lib/api/assistant-service"
import { undoKey, useCortexStore } from "@/lib/store/cortex-store"
import { cn } from "@/lib/utils"

/**
 * « Undo » sous ce que Cortex vient de créer (R77, séance n°13) : un projet resté vide part avec ses pages, une issue
 * sans commentaire ou une note sur laquelle rien ne s'appuie part ; au-delà, le serveur dit pourquoi ce n'est plus
 * possible d'ici. Son état vit dans `useCortexStore` : le même geste se défait d'un endroit ou de l'autre (la
 * conversation, la ligne « Changes » de la fenêtre, R122), et les deux le disent.
 */
export function UndoAction({ slug, call }: { slug: string; call: AssistantToolCall }) {
  const state = useCortexStore((s) => s.undos[undoKey(call)])
  const undo = useCortexStore((s) => s.undo)

  if (state?.status === "done" || state?.status === "error") {
    return (
      <p className={cn("my-1 whitespace-pre-wrap break-words text-xs", state.status === "done" ? "text-muted-foreground" : "text-destructive")}>
        {state.status === "done" ? `Undone. ${state.output}` : state.output}
      </p>
    )
  }
  const running = state?.status === "running"
  return (
    <button
      type="button"
      onClick={() => void undo(slug, call)}
      disabled={running}
      className="my-1 flex h-6 w-fit items-center gap-1 border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
    >
      <Undo2 className="size-3" /> {running ? "Undoing…" : "Undo"}
    </button>
  )
}
