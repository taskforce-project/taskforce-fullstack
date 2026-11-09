"use client"

import { Fragment, useId, useState } from "react"

import type { AssistantAnswer } from "@/lib/api/assistant-service"
import { fillModelText } from "@/lib/ai/model-table"
import { greyLine, inASentence, readLine } from "@/lib/cortex/read-line"
import { useNoteStore } from "@/lib/store/note-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"

/**
 * La ligne grise sous une réponse (R123, R137) : le modèle qui a répondu et ce qu'il a lu, dans une phrase, toujours visible.
 * Le mot « Sources » n'existe plus (« Je sais tjr pas c'est quoi les sources ») : un clic sur « 5 notes » les nomme, et
 * chacune s'ouvre. Le mode et les tokens restent au survol, pour qui les cherche.
 */
export function ReadLine({ slug, answer }: Readonly<{
  slug: string
  answer: Pick<AssistantAnswer, "model" | "read" | "mode" | "usage">
}>) {
  const c = usePreferencesStore((s) => s.t.conversation)
  const t = usePreferencesStore((s) => s.t.thread)
  const answeredWith = usePreferencesStore((s) => s.t.cortex.answeredWith)
  const openNote = useNoteStore((s) => s.openNote)
  const [named, setNamed] = useState(false)
  const id = useId()
  const line = greyLine(answer.model, answer.read, c, t)
  const plain = readLine(line, c)
  if (!line || !plain) return null
  const notes = answer.read?.notesRead ?? []
  const usage = answer.usage && answer.usage.totalTokens > 0
    ? `${answer.mode} · ${answer.usage.totalTokens.toLocaleString("en-US")} tokens`
      + (answer.usage.promptTokens > 0 || answer.usage.completionTokens > 0
        ? ` (${answer.usage.promptTokens}↑ ${answer.usage.completionTokens}↓)`
        : "")
    : null
  const hover = [answer.model ? fillModelText(answeredWith, { model: answer.model }) : null, usage].filter(Boolean).join("\n")
  const toggleName = named ? c.hideNotes : c.showNotes

  const notesWord = line.pieces.find((piece) => piece.kind === "notes")?.text
  const words = inASentence(line.pieces.map((piece) => piece.text), c)

  return (
    <div className="mt-1 text-xs text-muted-foreground">
      <p className="truncate" aria-label={`${c.readLine}: ${plain}`} title={hover}>
        {line.model}
        {line.known && (
          line.pieces.length === 0 ? <> · {c.readNothing}</> : (
            <>
              {" · "}{c.read}{" "}
              {words.map((word, i) => (
                <Fragment key={i}>
                  {word === notesWord && notes.length > 0 ? (
                    <button
                      type="button"
                      aria-expanded={named}
                      aria-controls={named ? id : undefined}
                      title={toggleName}
                      onClick={() => setNamed((v) => !v)}
                      className="underline decoration-muted-foreground/50 decoration-dotted underline-offset-2 transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
                    >
                      {word}
                    </button>
                  ) : word}
                </Fragment>
              ))}
            </>
          )
        )}
      </p>
      {named && notes.length > 0 && (
        <ul id={id} className="mt-1 flex flex-col">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => void openNote(slug, note.id, note.title)}
                className="max-w-full truncate py-0.5 text-left transition-colors duration-150 hover:text-foreground hover:underline motion-reduce:transition-none"
              >
                {note.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
