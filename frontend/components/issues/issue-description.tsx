"use client"

import { useEffect, useState } from "react"
import { Pencil, Check as CheckIcon } from "lucide-react"

import { Markdown, toggleTaskInMarkdown } from "@/components/ui/lightweight-markdown"
import { MarkdownEditor } from "@/components/brain/markdown-editor"
import { Button } from "@/components/ui/button"

interface IssueDescriptionProps {
  value: string
  /** Persiste la nouvelle description (toggle de case à cocher ou édition complète). */
  onSave: (value: string) => Promise<void> | void
  placeholder?: string
}

/**
 * Description d'issue **directement utilisable** : le markdown est rendu (titres, listes,
 * code, callouts) et les cases à cocher `- [ ]` sont cliquables sans passer en édition.
 * Le crayon ouvre un vrai petit éditeur markdown (toolbar + aperçu) pour retoucher le texte.
 */
export function IssueDescription({ value, onSave, placeholder }: Readonly<IssueDescriptionProps>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  // Resync si l'issue change ou qu'une source externe (Spec IA) réécrit la description.
  useEffect(() => { setDraft(value) }, [value])

  // Bascule une case à cocher directement depuis le rendu (pas besoin d'éditer).
  function handleToggleTask(taskIndex: number) {
    void onSave(toggleTaskInMarkdown(value, taskIndex))
  }

  async function save() {
    setEditing(false)
    await onSave(draft)
  }
  function cancel() {
    setDraft(value)
    setEditing(false)
  }
  function startEditing() {
    setDraft(value)
    setEditing(true)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <MarkdownEditor
          value={draft}
          onChange={setDraft}
          rows={10}
          placeholder="Describe the issue in markdown… headings, lists, `- [ ]` checkboxes, code."
        />
        <div className="flex gap-2">
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={save}>
            <CheckIcon className="size-3" /> Save
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  if (!value.trim()) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="w-full -mx-3 rounded-md px-3 py-3 text-left text-sm italic text-muted-foreground transition-colors hover:bg-muted/40"
      >
        {placeholder ?? "No description. Click to add one."}
      </button>
    )
  }

  return (
    <div className="group relative -mx-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/30">
      <Markdown
        content={value}
        onToggleTask={handleToggleTask}
        className="space-y-2 text-sm leading-relaxed text-foreground"
      />
      <button
        type="button"
        onClick={startEditing}
        title="Edit the description"
        className="absolute top-1.5 right-1.5 rounded p-1 text-muted-foreground opacity-40 transition-opacity hover:bg-muted hover:opacity-100"
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
  )
}
