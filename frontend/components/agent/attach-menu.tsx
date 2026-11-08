"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Plus } from "lucide-react"

import { optionDomId, PickList } from "@/components/agent/pick-list"
import { MAX_ATTACHMENTS, nextIndex, type PickOption } from "@/lib/cortex/composer-picker"
import { usePickOptions } from "@/lib/hooks/use-pick-options"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { cn } from "@/lib/utils"

/**
 * Le « + » du compositeur (R123) : joindre une issue ou un projet à la demande. Une recherche, la liste au-dessus, le
 * clavier d'abord ; le choix devient une pastille dans le compositeur, et Cortex reçoit ce que TaskForce en lit. Trois
 * pièces jointes au plus. Un fichier ne se joint pas : l'API de l'assistant n'en reçoit pas.
 */
export function AttachMenu({ slug, onDone }: Readonly<{
  slug: string
  /** Après un choix ou la fermeture : le compositeur reprend le focus. */
  onDone?: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.conversation)
  const attachments = useCortexStore((s) => s.attachments)
  const attach = useCortexStore((s) => s.attach)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const { options, searching } = usePickOptions(slug, open ? "attach" : null, query)
  const full = attachments.length >= MAX_ATTACHMENTS
  const current = options[Math.min(active, options.length - 1)]

  const close = () => {
    setOpen(false)
    setQuery("")
    setActive(0)
    onDone?.()
  }

  const pick = (option: PickOption) => {
    if (option.attach) attach(option.attach)
    close()
  }

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        disabled={full}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t.attach}
        title={full ? t.attachFull : t.attach}
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-40 motion-reduce:transition-none"
      >
        <Plus className="size-4" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-80 max-w-[calc(100vw-2rem)]">
          <PickList
            id={listId}
            options={options}
            active={active}
            searching={searching}
            onPick={pick}
            onActive={setActive}
            className="mb-1"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault()
                setActive((i) => Math.max(0, nextIndex(i, e.key === "ArrowDown" ? 1 : -1, options.length)))
              } else if (e.key === "Enter" || e.key === "Tab") {
                if (!current) return
                e.preventDefault()
                pick(current)
              } else if (e.key === "Escape") {
                e.preventDefault()
                e.stopPropagation()
                close()
              }
            }}
            placeholder={t.attachSearch}
            aria-label={t.attachSearch}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current ? optionDomId(listId, current) : undefined}
            className={cn(
              "h-9 w-full rounded-lg border border-border bg-popover px-2.5 text-sm outline-none",
              "placeholder:text-muted-foreground/60 focus-visible:border-primary",
            )}
          />
        </div>
      )}
    </div>
  )
}
