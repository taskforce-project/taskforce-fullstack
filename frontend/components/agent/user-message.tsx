"use client"

import { useId, useState } from "react"
import { ChevronRight } from "lucide-react"

import { Message } from "@/components/chat"
import { fillText } from "@/lib/delivery/result-card"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

/** Au-delà, un texte collé plus qu'un message : il se replie. Ce qui se tape tient largement en dessous. */
const FOLD_CHARS = 1_500
const FOLD_LINES = 20

/** Un texte qui se replie dans sa bulle. */
export function isLongText(text: string): boolean {
  if (text.length > FOLD_CHARS) return true
  let lines = 1
  for (let i = text.indexOf("\n"); i !== -1 && lines <= FOLD_LINES; i = text.indexOf("\n", i + 1)) lines++
  return lines > FOLD_LINES
}

/**
 * La demande de la personne. Un long texte collé se replie dans sa bulle (R137, comme Claude) : une ligne, « Pasted text ·
 * 11,482 characters », et son chevron ; déplié, il se lit tel qu'il a été collé, sans mise en forme et dans sa propre
 * hauteur : le fil ne devient pas ce texte (recette 1.13, étape 35).
 */
export function UserMessage({ text }: Readonly<{ text: string | undefined }>) {
  const body = text ?? ""
  if (!isLongText(body)) return <Message role="user" content={body} />
  return (
    <Message role="user">
      <PastedText text={body} />
    </Message>
  )
}

function PastedText({ text }: Readonly<{ text: string }>) {
  const t = usePreferencesStore((s) => s.t.thread)
  const [open, setOpen] = useState(false)
  const id = useId()
  const name = open ? t.pastedHide : t.pastedShow
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={name}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-left text-sm"
      >
        <span className="min-w-0">{fillText(t.pasted, { count: text.length.toLocaleString("en-US") })}</span>
        <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
      </button>
      {open && (
        <pre id={id} className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed">{text}</pre>
      )}
    </div>
  )
}
