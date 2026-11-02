"use client"

import { useEffect, useRef } from "react"
import { useParams, usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, Loader2, MessageSquare, Send, Sparkles } from "lucide-react"

import { AgentChat } from "./agent-chat"
import { suggestionsFor } from "@/lib/cortex/suggestions"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePanelStore, type OpenPanelInput } from "@/lib/store/panel-store"
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

/** Ramène la conversation au-dessus de la barre, dépliée. */
export function backToBar() {
  usePanelStore.getState().closePanel(CORTEX_PANEL_ID)
  useCortexStore.getState().setPlace("bar")
  useCortexStore.getState().setOpen(true)
}

/**
 * Le bord haut de la conversation dépliée : on le tire pour lui donner plus ou moins de place, ou on le règle au clavier
 * (flèches haut et bas) une fois qu'il a le focus.
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
      className="group absolute inset-x-0 -top-1 z-10 flex h-2 cursor-row-resize items-center justify-center outline-none"
    >
      <span className="h-1 w-12 rounded-full bg-border opacity-0 transition-all duration-150 group-hover:w-16 group-hover:bg-primary/60 group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  )
}

/**
 * La barre unique, en bas de chaque écran (R76, séance n°13), et la conversation qui s'en déplie (revue UX du
 * 01/11/2026). On y écrit ce qu'on veut faire ; la réponse s'ouvre juste au-dessus, là où l'on vient d'écrire, et la
 * barre devient la saisie de la conversation. Elle se replie (Échap), se redimensionne par son bord haut, et s'épingle
 * à droite pour qui préfère l'ancien panneau. Dépliée, elle pousse l'écran vers le haut au lieu de le recouvrir : le
 * tableau reste visible pendant que Cortex agit. Rien ne part tant que la personne n'envoie pas, par Entrée ou par le
 * bouton ; une suggestion remplit la barre, elle n'envoie rien.
 */
export function CommandBar() {
  const pathname = usePathname()
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.shell)

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
  const inputRef = useRef<HTMLInputElement>(null)
  const sectionRef = useRef<HTMLElement>(null)

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

  return (
    <div
      className="relative shrink-0 border-t border-border/70 bg-background"
      data-tour="command-bar"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open && !e.defaultPrevented) {
          e.preventDefault()
          fold()
        }
      }}
    >
      <AnimatePresence initial={false}>
        {unfolded && (
          <motion.section
            key="conversation"
            ref={sectionRef}
            aria-label={t.chatLabel}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            // Plafonnée sous la moitié de l'écran : l'objet sur lequel Cortex agit reste visible au-dessus.
            style={{ height: `min(${height}px, 45vh)` }}
            className="relative flex flex-col border-b border-border/70"
          >
            <ResizeEdge target={sectionRef} height={height} label={t.chatResize} onResize={setHeight} />
            <AgentChat place="bar" onSwitchPlace={pinToSide} onFold={fold} />
          </motion.section>
        )}
      </AnimatePresence>

      <div className="px-3 pb-2.5 pt-2 md:px-6">
        <div className="flex h-11 items-center gap-2 border border-border bg-background px-2 focus-within:border-foreground/30">
          <button
            type="button"
            onClick={open ? fold : show}
            aria-expanded={open}
            aria-label={toggleLabel}
            title={toggleLabel}
            className="relative flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || busy}
            title={busy ? t.barAnswering : undefined}
            className="flex h-8 shrink-0 items-center gap-1.5 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {t.barSend}
          </button>
        </div>
        {/* Repliée, la barre dit ce qu'on peut demander sur cet écran ; dépliée, la conversation est le contexte. */}
        {!unfolded && (
          <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label={t.barSuggestions}>
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
        )}
      </div>
    </div>
  )
}
