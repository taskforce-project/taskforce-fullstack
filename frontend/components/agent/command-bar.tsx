"use client"

import { useEffect, useRef } from "react"
import { useParams, usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowUp, ChevronDown, Loader2, MessageSquare } from "lucide-react"

import { AgentChat } from "./agent-chat"
import { suggestionsFor } from "@/lib/cortex/suggestions"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePanelStore, type PanelSide } from "@/lib/store/panel-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/** La largeur du panneau ouvert d'un côté, 0 sans panneau : la conversation et la barre se centrent sur l'écran qui reste. */
function usePanelWidth(side: PanelSide): number {
  return usePanelStore((s) => s.panels.find((p) => p.side === side)?.width ?? 0)
}

/** La conversation et la barre gardent la place des panneaux ouverts (en `md` et au-delà : en dessous, un panneau couvre tout). */
const PANEL_ROOM = "transition-[padding] duration-200 ease-out motion-reduce:transition-none md:pl-(--cortex-left) md:pr-(--cortex-right)"

/**
 * La barre unique, en bas de chaque écran (R76, séance n°13), et la conversation qui s'ouvre au-dessus. Depuis le
 * 02/11/2026, les deux parlent la langue du composeur du site : la barre flotte, détachée des bords ; la conversation
 * n'est pas une carte, son texte se pose sur un dégradé qui monte de la barre, la dernière réponse en grand (« juste un
 * bg qui fait ressortir le texte en gros », le CEO). Toujours en bas, jamais sur le côté : on pilote tout depuis la
 * barre, les écrans au-dessus servent à voir. Rien n'est modal : hors du texte, l'écran se clique. La conversation se
 * réduit dans la barre (Échap, ou son chevron). Rien ne part tant que la personne n'envoie pas, par Entrée ou par le
 * bouton ; une suggestion remplit la barre, elle n'envoie rien.
 */
export function CommandBar() {
  const pathname = usePathname()
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.shell)
  const reduceMotion = useReducedMotion()

  const draft = useCortexStore((s) => s.draft)
  const setDraft = useCortexStore((s) => s.setDraft)
  const send = useCortexStore((s) => s.send)
  const open = useCortexStore((s) => s.open)
  const setOpen = useCortexStore((s) => s.setOpen)
  const unread = useCortexStore((s) => s.unread)
  const busy = useCortexStore((s) => s.sentAt !== null)
  const hasTurns = useCortexStore((s) => s.turns.length > 0)
  const enterWorkspace = useCortexStore((s) => s.enterWorkspace)
  const leftRoom = usePanelWidth("left")
  const rightRoom = usePanelWidth("right")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { enterWorkspace(slug) }, [slug, enterWorkspace])

  const show = () => {
    setOpen(true)
    inputRef.current?.focus()
  }

  const fold = () => {
    setOpen(false)
    inputRef.current?.focus()
  }

  const submit = () => {
    if (!draft.trim() || busy) return
    void send(slug)
  }

  const suggest = (text: string) => {
    setDraft(text)
    inputRef.current?.focus()
  }

  const toggleLabel = unread && !open ? t.barNewAnswer : open ? t.barHideConversation : t.barShowConversation
  // La conversation monte de la barre ; avec le mouvement réduit, elle apparaît en fondu, sans se déplacer.
  const away = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }
  const room = { "--cortex-left": `${leftRoom}px`, "--cortex-right": `${rightRoom}px` } as React.CSSProperties

  return (
    <div
      className="relative shrink-0 px-3 pb-3 pt-2 md:px-6"
      style={room}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open && !e.defaultPrevented) {
          e.preventDefault()
          fold()
        }
      }}
    >
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="conversation"
            initial={away}
            animate={{ opacity: 1, y: 0 }}
            exit={away}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            // Au-dessus de l'écran, sans le bloquer : seul le texte capte les clics, pas le dégradé autour.
            className="pointer-events-none absolute inset-x-0 bottom-full z-30 px-3 md:px-6"
          >
            <span className="cortex-wash" aria-hidden="true" />
            <div className={PANEL_ROOM}>
              <section aria-label={t.chatLabel} className="cortex-conversation pointer-events-auto relative mx-auto flex w-full max-w-3xl flex-col">
                <AgentChat onFold={fold} />
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={PANEL_ROOM}>
        <div
          className="cortex-composer @container relative z-30 mx-auto flex h-13 w-full max-w-3xl items-center gap-1.5 px-2.5"
          data-tour="command-bar"
        >
          <button
            type="button"
            onClick={open ? fold : show}
            aria-expanded={open}
            aria-label={toggleLabel}
            title={toggleLabel}
            className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {open ? <ChevronDown className="size-4" /> : <MessageSquare className="size-4" />}
            {unread && !open && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" aria-hidden="true" />}
          </button>
          <input
            ref={inputRef}
            id="command-bar-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={open && hasTurns ? t.barReply : t.barPlaceholder}
            aria-label={t.barPlaceholder}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          {/* Fermée et vide, la barre dit ce qu'on peut demander sur cet écran, si la place le permet (sinon, la
              conversation vide le dit) ; ouverte, la conversation est le contexte. */}
          {!open && !draft && (
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
      </div>
    </div>
  )
}
