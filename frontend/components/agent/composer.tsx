"use client"

import { useRef, type RefObject } from "react"
import { useParams, usePathname } from "next/navigation"
import { ArrowUp, ChevronDown, Loader2, MessageSquare } from "lucide-react"

import { CortexUsage } from "./cortex-usage"
import { suggestionsFor } from "@/lib/cortex/suggestions"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cortexModel } from "@/lib/window/environment"

/**
 * Le compositeur (R76, R123) : écrire ce qu'on veut faire, puis l'envoyer. Rien ne part tant que la personne n'envoie
 * pas, par Entrée ou par le bouton ; une suggestion remplit le texte, elle n'envoie rien. En bas de la colonne de la
 * conversation, il porte dessous le modèle et l'indicateur de contexte. Replié, quand le volet prend toute la largeur,
 * il garde le bouton qui déplie la conversation au-dessus de lui et, vide, les suggestions de l'écran (le motif du
 * 02/11/2026).
 */
export function Composer({ variant, inputRef, onToggle }: Readonly<{
  variant: "column" | "folded"
  inputRef?: RefObject<HTMLInputElement | null>
  /** Replié : déplie ou replie la conversation au-dessus du compositeur. */
  onToggle?: () => void
}>) {
  const pathname = usePathname()
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.shell)
  const ownRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? ownRef

  const draft = useCortexStore((s) => s.draft)
  const setDraft = useCortexStore((s) => s.setDraft)
  const send = useCortexStore((s) => s.send)
  const open = useCortexStore((s) => s.open)
  const unread = useCortexStore((s) => s.unread)
  const busy = useCortexStore((s) => s.sentAt !== null)
  const hasTurns = useCortexStore((s) => s.turns.length > 0)
  const model = useAiStatusStore((s) => cortexModel(s.status))
  const folded = variant === "folded"

  const submit = () => {
    if (!draft.trim() || busy) return
    void send(slug)
  }

  const suggest = (text: string) => {
    setDraft(text)
    ref.current?.focus()
  }

  const toggleLabel = unread && !open ? t.barNewAnswer : open ? t.barHideConversation : t.barShowConversation

  return (
    <div>
      <div
        className="cortex-composer @container relative z-30 mx-auto flex h-13 w-full items-center gap-1.5 px-2.5"
        data-tour="command-bar"
      >
        {folded && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={toggleLabel}
            title={toggleLabel}
            className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {open ? <ChevronDown className="size-4" /> : <MessageSquare className="size-4" />}
            {unread && !open && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" aria-hidden="true" />}
          </button>
        )}
        <input
          ref={ref}
          id="command-bar-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={(!folded || open) && hasTurns ? t.barReply : t.barPlaceholder}
          aria-label={t.barPlaceholder}
          className="h-10 min-w-0 flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {/* Repliée et vide, la barre dit ce qu'on peut demander sur cet écran, si la place le permet ; dépliée, la
            conversation est le contexte. */}
        {folded && !open && !draft && (
          <div role="group" className="hidden shrink-0 items-center gap-1 @[46rem]:flex" aria-label={t.barSuggestions}>
            {suggestionsFor(pathname).map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => suggest(s.text)}
                className="h-7 rounded-full border border-border/70 px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim() || busy}
          aria-label={t.barSend}
          title={busy ? t.barAnswering : t.barSend}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-key transition-[background-color,transform] duration-150 hover:bg-primary-hover enabled:hover:-translate-y-px disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </div>
      {/* Sous le compositeur : le modèle qui répond, et la place que la conversation prend dans sa fenêtre. */}
      {!folded && (
        <div className="flex h-7 items-center justify-between gap-2 px-3 text-[11px] text-muted-foreground">
          <span className="min-w-0 truncate" title={model ?? undefined}>{model}</span>
          <CortexUsage />
        </div>
      )}
    </div>
  )
}
