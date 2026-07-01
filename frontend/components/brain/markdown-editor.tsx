"use client"

import { useCallback, useRef, useState } from "react"
import {
  Bold, Italic, Heading1, Heading2, List, ListOrdered, Code, Link2, Braces, Eye, Pencil, X,
  Highlighter, Image as ImageIcon, Quote, Paperclip, Loader2,
} from "lucide-react"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { Input } from "@/components/ui/input"

export interface UploadedFile { url: string; filename: string; image: boolean }

type ToolAction =
  | "bold" | "italic" | "h1" | "h2" | "highlight" | "ul" | "ol"
  | "callout" | "code" | "codeblock" | "link" | "image" | "wiki"

// Config statique (hors composant) : aucune closure sur un ref pendant le rendu.
const TOOLBAR: { icon: typeof Bold; label: string; action: ToolAction }[] = [
  { icon: Heading1, label: "Titre 1", action: "h1" },
  { icon: Heading2, label: "Titre 2", action: "h2" },
  { icon: Bold, label: "Gras", action: "bold" },
  { icon: Italic, label: "Italique", action: "italic" },
  { icon: Highlighter, label: "Surligner", action: "highlight" },
  { icon: List, label: "Liste", action: "ul" },
  { icon: ListOrdered, label: "Liste numérotée", action: "ol" },
  { icon: Quote, label: "Callout (tip/warning/danger…)", action: "callout" },
  { icon: Code, label: "Code", action: "code" },
  { icon: Braces, label: "Bloc de code", action: "codeblock" },
  { icon: Link2, label: "Lien", action: "link" },
  { icon: ImageIcon, label: "Image (URL)", action: "image" },
  { icon: Pencil, label: "Wikilink", action: "wiki" },
]

/**
 * Éditeur Markdown maison (sans tiptap — réseau du poste) : toolbar de formatage, bascule
 * Écrire / Aperçu live, et gestion des tags. Le contenu supporte les [[wikilinks]] et #tags
 * (matérialisés en arêtes côté backend → réseau de neurones).
 */
export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  tags: string[]
  onTagsChange: (tags: string[]) => void
  /** Upload d'une pièce jointe (image/doc) → MinIO. Active les boutons image/joindre. */
  onUploadFile?: (file: File) => Promise<UploadedFile | null>
}

export function MarkdownEditor({ value, onChange, tags, onTagsChange, onUploadFile }: MarkdownEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<"write" | "preview">("write")
  const [tagInput, setTagInput] = useState("")
  const [uploading, setUploading] = useState(false)

  // Insertion de texte à la position du curseur (pour les uploads).
  const insertAtCursor = useCallback((text: string) => {
    const ta = taRef.current
    const s = ta ? ta.selectionStart : value.length
    onChange(value.slice(0, s) + text + value.slice(s))
    requestAnimationFrame(() => {
      if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = s + text.length }
    })
  }, [value, onChange])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !onUploadFile) return
    setUploading(true)
    try {
      const r = await onUploadFile(file)
      if (r) insertAtCursor(r.image ? `\n![${r.filename}](${r.url})\n` : `\n[📎 ${r.filename}](${r.url})\n`)
    } finally {
      setUploading(false)
    }
  }

  // Applique le formatage de la toolbar. Lecture du ref confinée à ce callback (hors rendu).
  const applyFormat = useCallback((action: ToolAction) => {
    const ta = taRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta

    const surround = (before: string, after = before) => {
      const sel = value.slice(s, e) || "texte"
      onChange(value.slice(0, s) + before + sel + after + value.slice(e))
      requestAnimationFrame(() => {
        ta.focus()
        ta.selectionStart = s + before.length
        ta.selectionEnd = s + before.length + sel.length
      })
    }
    const prefixLines = (prefix: string) => {
      const start = value.lastIndexOf("\n", s - 1) + 1
      const block = value.slice(start, e)
      const replaced = block.split("\n").map((l) => prefix + l).join("\n")
      onChange(value.slice(0, start) + replaced + value.slice(e))
      requestAnimationFrame(() => ta.focus())
    }
    const insertBlock = (block: string) => {
      const before = value.slice(0, s)
      const ins = (before.length > 0 && !before.endsWith("\n") ? "\n" : "") + block
      onChange(before + ins + value.slice(s))
      requestAnimationFrame(() => ta.focus())
    }

    switch (action) {
      case "bold": return surround("**")
      case "italic": return surround("*")
      case "h1": return prefixLines("# ")
      case "h2": return prefixLines("## ")
      case "highlight": return surround("==")
      case "ul": return prefixLines("- ")
      case "ol": return prefixLines("1. ")
      case "callout": return insertBlock("> [!tip] Titre\n> Votre message ici.\n")
      case "code": return surround("`")
      case "codeblock": return surround("```\n", "\n```")
      case "link": return surround("[", "](url)")
      case "image": return surround("![", "](url)")
      case "wiki": return surround("[[", "]]")
    }
  }, [value, onChange])

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-")
    if (t && !tags.includes(t)) onTagsChange([...tags, t])
    setTagInput("")
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar + bascule mode — collante en haut au scroll */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-md border bg-background/95 p-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {TOOLBAR.map((b) => (
          <button key={b.label} type="button" title={b.label}
            onClick={() => (b.action === "image" && onUploadFile ? imgInputRef.current?.click() : applyFormat(b.action))}
            disabled={mode === "preview" || uploading}
            className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30">
            <b.icon className="size-3.5" />
          </button>
        ))}
        {onUploadFile && (
          <button type="button" title="Joindre un document" onClick={() => fileInputRef.current?.click()}
            disabled={mode === "preview" || uploading}
            className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30">
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
          </button>
        )}
        <input ref={imgInputRef} type="file" accept="image/*" hidden onChange={handleUpload} />
        <input ref={fileInputRef} type="file" hidden onChange={handleUpload} />
        <div className="ml-auto flex items-center rounded border p-0.5">
          <button type="button" onClick={() => setMode("write")}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${mode === "write" ? "bg-accent font-medium" : "text-muted-foreground"}`}>
            <Pencil className="size-3" /> Écrire
          </button>
          <button type="button" onClick={() => setMode("preview")}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${mode === "preview" ? "bg-accent font-medium" : "text-muted-foreground"}`}>
            <Eye className="size-3" /> Aperçu
          </button>
        </div>
      </div>

      {/* Zone d'édition / aperçu */}
      {mode === "write" ? (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={20}
          spellCheck={false}
          placeholder="# Titre&#10;&#10;Contenu markdown… Utilise [[Autre note]] pour lier et #tag pour classer."
          className="w-full resize-y rounded-md border bg-background p-3 font-mono text-sm leading-relaxed outline-none focus:border-foreground/20"
        />
      ) : (
        <div className="min-h-[20rem] rounded-md border bg-background p-3">
          {value.trim() ? <Markdown content={value} /> : <p className="text-sm italic text-muted-foreground">Rien à prévisualiser.</p>}
        </div>
      )}

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/20 px-2 py-1.5">
        <span className="text-xs text-muted-foreground">Tags</span>
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            #{t}
            <button type="button" onClick={() => onTagsChange(tags.filter((x) => x !== t))} className="hover:text-destructive">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput) }
          }}
          onBlur={() => tagInput && addTag(tagInput)}
          placeholder="ajouter…"
          className="h-6 w-24 flex-1 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  )
}
