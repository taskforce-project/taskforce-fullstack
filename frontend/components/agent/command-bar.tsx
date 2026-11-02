"use client"

import { useEffect, useRef } from "react"
import { useParams, usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowUp, ChevronDown, Loader2, MessageSquare, Sparkles } from "lucide-react"

import { AgentChat } from "./agent-chat"
import { suggestionsFor } from "@/lib/cortex/suggestions"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePanelStore, type OpenPanelInput, type PanelSide } from "@/lib/store/panel-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/** Le panneau de droite, où la conversation va quand la personne l'y épingle : le même partout, rouvert sans doublon. */
export const CORTEX_PANEL_ID = "assistant"

function cortexPanel(): OpenPanelInput {
  return {
    id: CORTEX_PANEL_ID,
    side: "right",
    title: "Cortex",
    icon: <Sparkles className="size-4 text-primary" />,
    content: <AgentChat place="side" onSwitchPlace={backToBar} />,
  }
}

/** Épingle la conversation dans le panneau de droite : l'ancien emplacement, gardé pour qui le préfère. */
export function pinToSide() {
  useCortexStore.getState().setPlace("side")
  useCortexStore.getState().setOpen(true)
  usePanelStore.getState().openPanel(cortexPanel())
}

/** Ramène la conversation au-dessus de la barre, ouverte. */
export function backToBar() {
  usePanelStore.getState().closePanel(CORTEX_PANEL_ID)
  useCortexStore.getState().setPlace("bar")
  useCortexStore.getState().setOpen(true)
}

/** La largeur du panneau ouvert d'un côté, 0 sans panneau : la bulle et la barre se centrent sur l'écran qui reste. */
function usePanelWidth(side: PanelSide): number {
  return usePanelStore((s) => s.panels.find((p) => p.side === side)?.width ?? 0)
}

/** La bulle et la barre gardent la place des panneaux ouverts (en `md` et au-delà : en dessous, un panneau couvre tout). */
const PANEL_ROOM = "transition-[padding] duration-200 ease-out motion-reduce:transition-none md:pl-(--cortex-left) md:pr-(--cortex-right)"

/**
 * Le bord haut de la bulle : on le tire pour lui donner plus ou moins de place, ou on le règle au clavier (flèches haut
 * et bas) une fois qu'il a le focus.
 */
function ResizeEdge({ target, height, label, onResize }: Readonly<{
  target: React.RefObject<HTMLElement | null>
  height: number
  label: string
  onResize: (height: number) => void
}>) {
  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    // La hauteur affichée, plafonnée par l'écran, et pas celle demandée : le geste part de ce que l'on voit.
    const startHeight = target.current?.getBoundingClientRect().height ?? height
    const onMove = (ev: PointerEvent) => onResize(startHeight + (startY - ev.clientY))
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      document.body.style.userSelect = ""
    }
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={start}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault()
          onResize(height + (e.key === "ArrowUp" ? 40 : -40))
        }
      }}
      className="group absolute inset-x-12 top-0 z-10 flex h-1.5 cursor-row-resize justify-center outline-none"
    >
      <span className="mt-0.5 h-1 w-10 rounded-full bg-border opacity-0 transition-all duration-150 group-hover:w-14 group-hover:bg-primary/60 group-hover:opacity-100 group-focus-visible:w-14 group-focus-visible:bg-primary/60 group-focus-visible:opacity-100" />
    </button>
  )
}

/**
 * La barre unique, en bas de chaque écran (R76, séance n°13), et la conversation qui s'ouvre au-dessus. Depuis le
 * 02/11/2026, les deux parlent la langue du composeur du site : la barre flotte, détachée des bords, et la conversation
 * s'ouvre au-dessus d'elle dans une bulle à part, arrondie, ombrée, sur un halo et un dégradé bleu, lisible sur
 * n'importe quel écran (« une sorte de bulle de chat qui s'ouvrirait partout », le CEO). La bulle passe par-dessus
 * l'écran sans le figer : rien n'est modal, le reste de l'écran se clique. Elle se réduit dans la barre (Échap, ou son
 * chevron), se redimensionne par son bord haut, et s'épingle à droite pour qui préfère le panneau. Rien ne part tant
 * que la personne n'envoie pas, par Entrée ou par le bouton ; une suggestion remplit la barre, elle n'envoie rien.
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
  const place = useCortexStore((s) => s.place)
  const height = useCortexStore((s) => s.height)
  const setHeight = useCortexStore((s) => s.setHeight)
  const unread = useCortexStore((s) => s.unread)
  const busy = useCortexStore((s) => s.sentAt !== null)
  const hasTurns = useCortexStore((s) => s.turns.length > 0)
  const enterWorkspace = useCortexStore((s) => s.enterWorkspace)
  const sideShown = usePanelStore((s) => s.panels.some((p) => p.id === CORTEX_PANEL_ID))
  const openPanel = usePanelStore((s) => s.openPanel)
  const closePanel = usePanelStore((s) => s.closePanel)
  const leftRoom = usePanelWidth("left")
  const rightRoom = usePanelWidth("right")
  const inputRef = useRef<HTMLInputElement>(null)
  const bubbleRef = useRef<HTMLElement>(null)

  useEffect(() => { enterWorkspace(slug) }, [slug, enterWorkspace])

  // Épinglée à droite, la conversation est montrée tant que son panneau l'est : sa croix, ou un autre panneau ouvert
  // à droite, la replient (et une réponse arrivée ensuite allume le point de la barre).
  useEffect(() => {
    if (place === "side" && open && !sideShown) setOpen(false)
  }, [place, open, sideShown, setOpen])

  const unfolded = open && place === "bar"

  const show = () => {
    setOpen(true)
    if (place === "side") openPanel(cortexPanel())
    inputRef.current?.focus()
  }

  const fold = () => {
    if (place === "side") closePanel(CORTEX_PANEL_ID)
    setOpen(false)
    inputRef.current?.focus()
  }

  const submit = () => {
    if (!draft.trim() || busy) return
    if (place === "side") openPanel(cortexPanel())
    void send(slug)
  }

  const suggest = (text: string) => {
    setDraft(text)
    inputRef.current?.focus()
  }

  const toggleLabel = unread && !open ? t.barNewAnswer : open ? t.barHideConversation : t.barShowConversation
  // La bulle monte du composeur ; avec le mouvement réduit, elle apparaît en fondu, sans se déplacer.
  const away = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }
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
        {unfolded && (
          <motion.div
            key="conversation"
            initial={away}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={away}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "50% 100%" }}
            // Au-dessus de l'écran, sans le bloquer : seule la bulle capte les clics, pas le halo autour.
            className="pointer-events-none absolute inset-x-0 bottom-full z-30 px-3 pb-1 md:px-6"
          >
            <div className={PANEL_ROOM}>
              <div className="relative mx-auto w-full max-w-3xl">
                <span className="cortex-halo" aria-hidden="true" />
                <section
                  ref={bubbleRef}
                  aria-label={t.chatLabel}
                  // Plafonnée par l'écran : la bulle s'arrête sous la barre du haut (et, dans l'app desktop, sous les
                  // boutons de la fenêtre).
                  style={{ height: `min(${height}px, calc(100dvh - 11rem))` }}
                  className="cortex-bubble pointer-events-auto relative flex flex-col px-1 pb-2"
                >
                  <ResizeEdge target={bubbleRef} height={height} label={t.chatResize} onResize={setHeight} />
                  <AgentChat place="bar" onSwitchPlace={pinToSide} onFold={fold} />
                </section>
              </div>
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
          {/* Fermée et vide, la barre dit ce qu'on peut demander sur cet écran, si la place le permet (sinon, la bulle
              vide le dit) ; ouverte, la conversation est le contexte. */}
          {!unfolded && !draft && (
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
