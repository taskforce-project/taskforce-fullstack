"use client"

import { useRef } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { AgentChat } from "./agent-chat"
import { Composer } from "./composer"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * La conversation repliée dans le compositeur, en bas au centre du volet, quand il prend toute la largeur ou que la
 * fenêtre est étroite (R120, séance n°18). C'est le motif du 02/11/2026, gardé tel quel : le compositeur flotte,
 * détaché des bords ; la conversation n'est pas une carte, son texte se pose sur un dégradé qui monte de la barre, la
 * dernière réponse en grand. Rien n'est modal : hors du texte, le volet se clique. La conversation se réduit dans le
 * compositeur (Échap, ou son chevron) ; une réponse arrivée pendant qu'elle est réduite s'y signale.
 */
export function CommandBar() {
  const t = usePreferencesStore((s) => s.t.shell)
  const reduceMotion = useReducedMotion()
  const open = useCortexStore((s) => s.open)
  const setOpen = useCortexStore((s) => s.setOpen)
  const inputRef = useRef<HTMLInputElement>(null)

  const show = () => {
    setOpen(true)
    inputRef.current?.focus()
  }

  const fold = () => {
    setOpen(false)
    inputRef.current?.focus()
  }

  // La conversation monte de la barre ; avec le mouvement réduit, elle apparaît en fondu, sans se déplacer.
  const away = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }

  return (
    <div
      className="relative shrink-0 px-3 pb-3 pt-2 md:px-6"
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
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            // Au-dessus du volet, sans le bloquer : seul le texte capte les clics, pas le dégradé autour.
            className="pointer-events-none absolute inset-x-0 bottom-full z-30 px-3 md:px-6"
          >
            <span className="cortex-wash" aria-hidden="true" />
            <section aria-label={t.chatLabel} className="cortex-conversation pointer-events-auto relative mx-auto flex w-full max-w-3xl flex-col">
              <AgentChat onFold={fold} />
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto w-full max-w-3xl">
        <Composer variant="folded" inputRef={inputRef} onToggle={open ? fold : show} />
      </div>
    </div>
  )
}
