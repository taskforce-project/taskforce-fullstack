"use client"

import { useRef } from "react"
import { usePathname } from "next/navigation"
import { MessageSquare, Send, Sparkles } from "lucide-react"

import { AgentChat } from "./agent-chat"
import { suggestionsFor } from "@/lib/cortex/suggestions"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePanelStore } from "@/lib/store/panel-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/** Le panneau de la conversation, ouvert par la barre : le même partout, réouvert sans doublon. */
export const CORTEX_PANEL = {
  id: "assistant",
  side: "right" as const,
  title: "Cortex",
  icon: <Sparkles className="size-4 text-primary" />,
  content: <AgentChat />,
}

/**
 * La barre unique, en bas de chaque écran (R76, séance n°13) : on y écrit ce qu'on veut faire, et la conversation
 * s'ouvre à droite. Rien ne part tant que la personne n'envoie pas elle-même, par Entrée ou par le bouton ; une
 * suggestion remplit la barre, elle n'envoie rien. Elle remplace le bouton « Ask AI » de la barre du haut.
 */
export function CommandBar() {
  const pathname = usePathname()
  const t = usePreferencesStore((s) => s.t)
  const draft = useCortexStore((s) => s.draft)
  const setDraft = useCortexStore((s) => s.setDraft)
  const submit = useCortexStore((s) => s.submit)
  const openPanel = usePanelStore((s) => s.openPanel)
  const inputRef = useRef<HTMLInputElement>(null)

  const send = () => {
    if (submit()) openPanel(CORTEX_PANEL)
  }

  const suggest = (text: string) => {
    setDraft(text)
    inputRef.current?.focus()
  }

  return (
    <div className="shrink-0 border-t border-border/70 bg-background px-3 pb-2.5 pt-2 md:px-6" data-tour="command-bar">
      <div className="flex h-11 items-center gap-2 border border-border bg-background px-2 focus-within:border-foreground/30">
        <button
          type="button"
          onClick={() => openPanel(CORTEX_PANEL)}
          aria-label={t.shell.barOpenConversation}
          title={t.shell.barOpenConversation}
          className="flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MessageSquare className="size-4" />
        </button>
        <input
          ref={inputRef}
          id="command-bar-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={t.shell.barPlaceholder}
          aria-label={t.shell.barPlaceholder}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim()}
          className="flex h-8 shrink-0 items-center gap-1.5 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          <Send className="size-3.5" /> {t.shell.barSend}
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label={t.shell.barSuggestions}>
        {suggestionsFor(pathname).map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => suggest(s.text)}
            className="h-6 border border-border/70 bg-muted/40 px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
