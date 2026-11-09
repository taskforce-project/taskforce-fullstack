"use client"

import { X } from "lucide-react"

import { fillText } from "@/lib/delivery/result-card"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * Les messages qui attendent leur tour, juste au-dessus de la boîte (R134) : une ligne par message, cinq au plus, chacun
 * avec sa croix. Le suivant part quand le tour se finit, sous les yeux de la personne ; après un arrêt ou un échec, rien
 * ne part tout seul : un clic envoie le suivant.
 */
export function ComposerQueue({ slug }: Readonly<{ slug: string }>) {
  const t = usePreferencesStore((s) => s.t.composer)
  const queue = useCortexStore((s) => s.queue)
  const halted = useCortexStore((s) => s.queueHalted)
  const busy = useCortexStore((s) => s.sentAt !== null)
  const unqueue = useCortexStore((s) => s.unqueue)
  const sendNext = useCortexStore((s) => s.sendNext)
  if (queue.length === 0) return null

  return (
    <ul aria-label={t.queue} className="mb-1 flex flex-col gap-0.5 px-1.5">
      {queue.map((message, index) => {
        const removeLabel = fillText(t.queueRemove, { text: message.text })
        return (
          <li key={message.id} className="flex h-7 items-center gap-2 rounded-md bg-muted pl-2.5 pr-0.5 text-xs text-foreground/90">
            <span className="min-w-0 flex-1 truncate" title={message.text}>{message.text}</span>
            {index === 0 && halted && !busy && (
              <button
                type="button"
                onClick={() => void sendNext(slug)}
                className="shrink-0 rounded px-1.5 py-0.5 font-medium text-foreground underline-offset-2 transition-colors duration-150 hover:underline motion-reduce:transition-none"
              >
                {t.sendNext}
              </button>
            )}
            <button
              type="button"
              onClick={() => unqueue(message.id)}
              aria-label={removeLabel}
              title={removeLabel}
              className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-foreground motion-reduce:transition-none"
            >
              <X className="size-4" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
