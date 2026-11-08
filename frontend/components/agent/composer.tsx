"use client"

import { useId, useRef, useState, type RefObject } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowUp, ChevronDown, CircleDot, FolderKanban, Loader2, MessageSquare, X } from "lucide-react"

import { AttachMenu } from "./attach-menu"
import { CortexUsage } from "./cortex-usage"
import { optionDomId, PickList } from "./pick-list"
import { PaneLink } from "@/components/layout/pane-link"
import { applyPick, attachmentKey, nextIndex, triggerAt, type PickOption } from "@/lib/cortex/composer-picker"
import { fillText } from "@/lib/delivery/result-card"
import { usePickOptions } from "@/lib/hooks/use-pick-options"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { withConversation } from "@/lib/window/address"
import { cortexModel } from "@/lib/window/environment"
import { homePath } from "@/lib/window/pane"

/** Le volet « Progress » (R125) : ce que le modèle sait, et comment il progresse ; le lot 3b le construit. */
const progressPath = (slug: string): string => `${homePath(slug)}/progress`

/**
 * Le compositeur (R76, R123) : écrire ce qu'on veut faire, puis l'envoyer. Rien ne part tant que la personne n'envoie
 * pas, par Entrée ou par le bouton ; une suggestion, une mention ou un geste remplit le texte, il n'envoie rien. « + »
 * joint une issue ou un projet ; « @ » ouvre la liste des issues, des personnes et des projets, « / » en tête celle des
 * gestes, dès le premier caractère, au clavier d'abord. Ce qui est joint se montre en pastilles et part avec la demande :
 * Cortex reçoit ce que TaskForce en lit. En bas de la colonne de la conversation, il porte dessous le modèle, qui ouvre
 * « Progress » dans le volet, et l'indicateur de contexte. Replié, quand le volet prend toute la largeur, il garde le
 * bouton qui déplie la conversation au-dessus de lui (le motif du 02/11/2026).
 */
export function Composer({ variant, inputRef, onToggle }: Readonly<{
  variant: "column" | "folded"
  inputRef?: RefObject<HTMLInputElement | null>
  /** Replié : déplie ou replie la conversation au-dessus du compositeur. */
  onToggle?: () => void
}>) {
  const params = useParams()
  const router = useRouter()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.shell)
  const c = usePreferencesStore((s) => s.t.conversation)
  const ownRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? ownRef
  const listId = useId()

  const draft = useCortexStore((s) => s.draft)
  const setDraft = useCortexStore((s) => s.setDraft)
  const attachments = useCortexStore((s) => s.attachments)
  const attach = useCortexStore((s) => s.attach)
  const detach = useCortexStore((s) => s.detach)
  const send = useCortexStore((s) => s.send)
  const open = useCortexStore((s) => s.open)
  const unread = useCortexStore((s) => s.unread)
  const busy = useCortexStore((s) => s.sentAt !== null)
  const hasTurns = useCortexStore((s) => s.turns.length > 0)
  const model = useAiStatusStore((s) => cortexModel(s.status))
  const folded = variant === "folded"

  // Où est le curseur, et la liste que la personne a refermée (Échap) : elle reste fermée tant que la mention ne change pas.
  const [caret, setCaret] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const trigger = triggerAt(draft, caret)
  const triggerId = trigger ? `${trigger.kind}:${trigger.start}:${trigger.query}` : null
  const listOpen = trigger !== null && triggerId !== dismissed
  const { options, searching } = usePickOptions(slug, listOpen ? trigger.kind : null, trigger?.query ?? "")
  const current = listOpen ? options[Math.min(active, options.length - 1)] : undefined

  const submit = () => {
    if (!draft.trim() || busy) return
    void send(slug)
  }

  const write = (text: string, at: number) => {
    setDraft(text)
    setCaret(at)
    setActive(0)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(at, at)
    })
  }

  const pick = (option: PickOption) => {
    if (!trigger) return
    if (option.attach) attach(option.attach)
    const next = applyPick(draft, trigger, option.insert)
    write(next.text, next.caret)
  }

  const toggleLabel = unread && !open ? t.barNewAnswer : open ? t.barHideConversation : t.barShowConversation
  const progress = slug ? progressPath(slug) : ""

  return (
    <div>
      <div className="cortex-composer @container relative z-30 mx-auto w-full">
        {listOpen && (
          <PickList
            id={listId}
            options={options}
            active={Math.min(active, Math.max(options.length - 1, 0))}
            searching={searching}
            onPick={pick}
            onActive={setActive}
            className="absolute inset-x-0 bottom-full mb-2"
          />
        )}
        {attachments.length > 0 && (
          <ul aria-label={c.attached} className="flex flex-wrap gap-1 px-2.5 pt-2">
            {attachments.map((a) => {
              const Icon = a.kind === "issue" ? CircleDot : FolderKanban
              const name = a.title ? `${a.label} ${a.title}` : a.label
              return (
                <li key={attachmentKey(a)} className="flex h-6 max-w-64 items-center gap-1 rounded-full bg-muted pl-2 pr-0.5 text-xs" title={name}>
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{a.label}</span>
                  <button
                    type="button"
                    onClick={() => detach(attachmentKey(a))}
                    aria-label={fillText(c.detach, { name: a.label })}
                    title={fillText(c.detach, { name: a.label })}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-foreground motion-reduce:transition-none"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex h-13 items-center gap-1 px-2.5">
          {folded && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-label={toggleLabel}
              title={toggleLabel}
              className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none"
            >
              {open ? <ChevronDown className="size-4" /> : <MessageSquare className="size-4" />}
              {unread && !open && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" aria-hidden="true" />}
            </button>
          )}
          <AttachMenu slug={slug} onDone={() => ref.current?.focus()} />
          <input
            ref={ref}
            id="command-bar-input"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setCaret(e.target.selectionStart ?? e.target.value.length)
              setActive(0)
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={(e) => {
              if (listOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault()
                setActive((i) => Math.max(0, nextIndex(Math.min(i, options.length - 1), e.key === "ArrowDown" ? 1 : -1, options.length)))
                return
              }
              if (listOpen && current && (e.key === "Enter" || e.key === "Tab") && !e.nativeEvent.isComposing) {
                e.preventDefault()
                pick(current)
                return
              }
              if (listOpen && e.key === "Escape") {
                // Échap ferme d'abord la liste ; la conversation, ensuite.
                e.preventDefault()
                e.stopPropagation()
                setDismissed(triggerId)
                return
              }
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={(!folded || open) && hasTurns ? t.barReply : t.barPlaceholder}
            aria-label={t.barPlaceholder}
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listOpen ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={current ? optionDomId(listId, current) : undefined}
            className="h-10 min-w-0 flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || busy}
            aria-label={t.barSend}
            title={busy ? t.barAnswering : t.barSend}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-key transition-colors duration-150 hover:bg-primary-hover disabled:opacity-40 motion-reduce:transition-none"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </div>
      {/* Sous le compositeur : le modèle qui répond, qui ouvre « Progress » dans le volet, et la place que la conversation
          prend dans sa fenêtre. */}
      {!folded && (
        <div className="flex h-7 items-center justify-between gap-2 px-3 text-xs text-muted-foreground">
          {model && progress ? (
            <PaneLink
              href={progress}
              open={() => router.push(withConversation(progress, globalThis.location?.search ?? ""), { scroll: false })}
              title={fillText(c.modelProgress, { model })}
              className="min-w-0 truncate transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
            >
              {model}
            </PaneLink>
          ) : (
            <span className="min-w-0 truncate">{model}</span>
          )}
          <CortexUsage />
        </div>
      )}
    </div>
  )
}
