"use client"

import {
  useEffect, useId, useLayoutEffect, useRef, useState,
  type ClipboardEvent, type DragEvent, type RefObject,
} from "react"
import { useParams } from "next/navigation"
import { ArrowUp, ChevronDown, CircleDot, FileText, FolderKanban, Loader2, MessageSquare, Square, X } from "lucide-react"

import { AttachMenu } from "./attach-menu"
import { ComposerQueue } from "./composer-queue"
import { CortexUsage } from "./cortex-usage"
import { ModelChip } from "./model-chip"
import { optionDomId, PickList } from "./pick-list"
import { ProjectChip } from "./project-chip"
import { VoiceButton } from "./voice-button"
import { VoiceLine } from "./voice-line"
import { MAX_FILES, readFiles } from "@/lib/cortex/composer-files"
import { applyPick, attachmentKey, nextIndex, triggerAt, type PickOption } from "@/lib/cortex/composer-picker"
import { fillText } from "@/lib/delivery/result-card"
import { usePickOptions } from "@/lib/hooks/use-pick-options"
import { useThreadEnd } from "@/lib/hooks/use-thread-end"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { insertDictation } from "@/lib/voice/dictation"
import { cn } from "@/lib/utils"

/** Une ligne de texte : 14 px sur 20 px d'interligne. Le champ grandit jusqu'à 17 lignes, puis il défile (R134). */
const LINE_PX = 20
const MAX_LINES = 17

/**
 * Le compositeur (R76, R123, R134, séance n°20) : l'objet le plus touché de l'app, avec la structure qu'on connaît déjà
 * ailleurs. Une boîte arrondie, un champ qui passe à la ligne et grandit de 1 à 17 lignes puis défile ; dessous, dans la
 * boîte, « + » à gauche, le micro et l'envoi à droite : ils ne bougent pas quand le texte grandit. Sous la boîte, la rangée
 * de 24 px : le projet, le modèle, et à droite l'anneau de contexte.
 *
 * Rien ne part tant que la personne n'envoie pas : Entrée envoie, Maj+Entrée va à la ligne, sans rien casser d'une saisie
 * IME ni de ce que le micro (R132) écrit là où est le curseur. Une mention ou un geste remplit le texte, il n'envoie rien.
 * Pendant que Cortex travaille, le bouton d'envoi est un carré : un clic ou Échap arrête ; Entrée met le message en file,
 * visible au-dessus de la boîte. « @ » et « / » ouvrent leurs listes, sans être jamais annoncés. Replié, quand le volet
 * prend toute la largeur, il garde le bouton qui déplie la conversation au-dessus de lui (le motif du 02/11/2026).
 */
export function Composer({ variant, inputRef, onToggle }: Readonly<{
  variant: "column" | "folded"
  inputRef?: RefObject<HTMLTextAreaElement | null>
  /** Replié : déplie ou replie la conversation au-dessus du compositeur. */
  onToggle?: () => void
}>) {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.shell)
  const c = usePreferencesStore((s) => s.t.conversation)
  const texts = usePreferencesStore((s) => s.t.composer)
  const ownRef = useRef<HTMLTextAreaElement>(null)
  const ref = inputRef ?? ownRef
  const listId = useId()

  const draft = useCortexStore((s) => s.draft)
  const setDraft = useCortexStore((s) => s.setDraft)
  const attachments = useCortexStore((s) => s.attachments)
  const attach = useCortexStore((s) => s.attach)
  const detach = useCortexStore((s) => s.detach)
  const files = useCortexStore((s) => s.files)
  const addFiles = useCortexStore((s) => s.addFiles)
  const removeFile = useCortexStore((s) => s.removeFile)
  const notice = useCortexStore((s) => s.notice)
  const setNotice = useCortexStore((s) => s.setNotice)
  const send = useCortexStore((s) => s.send)
  const enqueue = useCortexStore((s) => s.enqueue)
  const stop = useCortexStore((s) => s.stop)
  const open = useCortexStore((s) => s.open)
  const unread = useCortexStore((s) => s.unread)
  const busy = useCortexStore((s) => s.sentAt !== null)
  const stoppable = useCortexStore((s) => s.stoppable)
  const hasTurns = useCortexStore((s) => s.turns.length > 0)
  const folded = variant === "folded"

  // Où est le curseur, et la liste que la personne a refermée (Échap) : elle reste fermée tant que la mention ne change pas.
  const [caret, setCaret] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [dragging, setDragging] = useState(false)
  const trigger = triggerAt(draft, caret)
  const triggerId = trigger ? `${trigger.kind}:${trigger.start}:${trigger.query}` : null
  const listOpen = trigger !== null && triggerId !== dismissed
  const { options, searching } = usePickOptions(slug, listOpen ? trigger.kind : null, trigger?.query ?? "")
  const current = listOpen ? options[Math.min(active, options.length - 1)] : undefined
  useThreadEnd()

  // Le champ suit son texte, de 1 à 17 lignes, avant que le navigateur ne peigne : la boîte ne saute pas. Une colonne qui
  // change de largeur change aussi les retours à la ligne.
  useLayoutEffect(() => {
    const field = ref.current
    if (!field) return
    const fit = () => {
      field.style.height = "auto"
      const wanted = field.scrollHeight
      if (wanted > 0) field.style.height = `${Math.min(wanted, LINE_PX * MAX_LINES)}px`
      field.style.overflowY = wanted > LINE_PX * MAX_LINES ? "auto" : "hidden"
    }
    fit()
    let width = field.clientWidth
    const watcher = new ResizeObserver(() => {
      if (field.clientWidth === width) return
      width = field.clientWidth
      fit()
    })
    watcher.observe(field)
    return () => watcher.disconnect()
  }, [draft, ref])

  // Échap arrête où que soit le curseur, sauf quand une fenêtre de dialogue ou un menu la prend d'abord. Dans le champ,
  // sa touche passe avant le repli de la conversation.
  useEffect(() => {
    if (!stoppable) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return
      event.preventDefault()
      stop(slug)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [stoppable, slug, stop])

  const submit = () => {
    if (!draft.trim()) return
    if (!busy) {
      void send(slug)
    } else if (!enqueue()) {
      setNotice(texts.queueFull)
    }
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

  // La transcription finit après le second clic : le texte et le curseur sont relus à ce moment-là, la personne a pu écrire.
  const dictate = (said: string) => {
    const before = useCortexStore.getState().draft
    const next = insertDictation(before, ref.current?.selectionStart ?? before.length, said)
    write(next.text, next.caret)
  }

  const pick = (option: PickOption) => {
    if (!trigger) return
    if (option.attach) attach(option.attach)
    const next = applyPick(draft, trigger, option.insert)
    write(next.text, next.caret)
  }

  /** Ce qui se joint, d'où qu'il vienne (le « + », un glisser-déposer, un collage) : ce qui ne se lit pas le dit en une ligne. */
  const takeFiles = async (list: readonly File[]) => {
    const have = useCortexStore.getState().files
    const { accepted, refused, overflow } = await readFiles(list, MAX_FILES - have.length, have)
    addFiles(accepted)
    if (refused.length === 1) setNotice(fillText(texts.filesRefusedOne, { name: refused[0] }))
    else if (refused.length > 1) setNotice(fillText(texts.filesRefusedMany, { count: String(refused.length) }))
    else setNotice(overflow ? texts.filesFull : null)
  }

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    // Un fichier copié, et rien d'autre : un tableur met aussi une image dans le presse-papiers, c'est son texte qu'on colle.
    const pasted = Array.from(event.clipboardData.files)
    if (pasted.length === 0 || event.clipboardData.getData("text/plain")) return
    event.preventDefault()
    void takeFiles(pasted)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    void takeFiles(Array.from(event.dataTransfer.files))
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return
    event.preventDefault()
    setDragging(true)
  }

  const toggleLabel = unread && !open ? t.barNewAnswer : open ? t.barHideConversation : t.barShowConversation
  const hasChips = attachments.length > 0 || files.length > 0

  return (
    <div>
      <ComposerQueue slug={slug} />
      <div
        className={cn("cortex-composer @container relative z-30 mx-auto w-full", dragging && "ring-1 ring-primary/60")}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
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
        {hasChips && (
          <ul aria-label={c.attached} className="flex flex-wrap gap-1 px-2.5 pt-2">
            {attachments.map((a) => {
              const Icon = a.kind === "issue" ? CircleDot : FolderKanban
              return (
                <AttachedChip
                  key={attachmentKey(a)}
                  icon={<Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  label={a.label}
                  title={a.title ? `${a.label} ${a.title}` : a.label}
                  removeLabel={fillText(c.detach, { name: a.label })}
                  onRemove={() => detach(attachmentKey(a))}
                />
              )
            })}
            {files.map((file) => (
              <AttachedChip
                key={file.id}
                icon={<FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                label={file.name}
                title={file.name}
                removeLabel={fillText(c.detach, { name: file.name })}
                onRemove={() => removeFile(file.id)}
              />
            ))}
          </ul>
        )}
        <VoiceLine />
        {notice && (
          <div role="status" className="flex min-h-7 items-center gap-2 px-3.5 pt-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label={texts.dismiss}
              title={texts.dismiss}
              className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="px-3.5 pb-1 pt-3">
          <textarea
            ref={ref}
            id="command-bar-input"
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setCaret(e.target.selectionStart ?? e.target.value.length)
              setActive(0)
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              const composing = e.nativeEvent.isComposing || e.keyCode === 229
              if (listOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault()
                setActive((i) => Math.max(0, nextIndex(Math.min(i, options.length - 1), e.key === "ArrowDown" ? 1 : -1, options.length)))
                return
              }
              if (listOpen && current && (e.key === "Enter" || e.key === "Tab") && !composing) {
                e.preventDefault()
                pick(current)
                return
              }
              if (listOpen && e.key === "Escape") {
                // Échap ferme d'abord la liste ; puis arrête Cortex ; la conversation, ensuite.
                e.preventDefault()
                e.stopPropagation()
                setDismissed(triggerId)
                return
              }
              if (e.key === "Escape" && stoppable) {
                e.preventDefault()
                e.stopPropagation()
                stop(slug)
                return
              }
              if (e.key === "Enter" && !e.shiftKey && !composing) {
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
            style={{ maxHeight: LINE_PX * MAX_LINES }}
            className="block w-full resize-none bg-transparent text-sm leading-5 outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <div className="flex h-11 items-center gap-1 px-2 pb-1">
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
          <AttachMenu slug={slug} onDone={() => ref.current?.focus()} onFiles={(list) => void takeFiles(list)} />
          <div className="ml-auto flex items-center gap-1">
            <VoiceButton onText={dictate} />
            <button
              type="button"
              onClick={stoppable ? () => stop(slug) : submit}
              disabled={!stoppable && (!draft.trim() || busy)}
              aria-label={stoppable ? texts.stop : t.barSend}
              title={stoppable ? texts.stopHint : busy ? t.barAnswering : t.barSend}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-key transition-colors duration-150 hover:bg-primary-hover disabled:opacity-40 motion-reduce:transition-none"
            >
              {stoppable ? (
                <Square className="size-3 fill-current" />
              ) : busy ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </button>
          </div>
        </div>
      </div>
      {/* La rangée sous la boîte (R134, R135) : où travaille la conversation, le modèle qui répond, et la place que la
          conversation prend dans sa fenêtre. Repliée et dépliée, la conversation montre sa jauge au-dessus de la barre. */}
      <div className="flex h-6 items-center gap-1 px-1.5 text-xs text-muted-foreground">
        <ProjectChip slug={slug} />
        <ModelChip slug={slug} />
        {(!folded || !open) && <CortexUsage className="ml-auto shrink-0" />}
      </div>
    </div>
  )
}

/** Une pastille au-dessus du texte : ce qui part avec la demande, et sa croix. */
function AttachedChip({ icon, label, title, removeLabel, onRemove }: Readonly<{
  icon: React.ReactNode
  label: string
  title: string
  removeLabel: string
  onRemove: () => void
}>) {
  return (
    <li className="flex h-6 max-w-64 items-center gap-1 rounded-full bg-muted pl-2 pr-0.5 text-xs" title={title}>
      {icon}
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-foreground motion-reduce:transition-none"
      >
        <X className="size-4" />
      </button>
    </li>
  )
}
