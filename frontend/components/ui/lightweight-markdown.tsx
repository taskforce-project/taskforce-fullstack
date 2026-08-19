"use client"

import { Fragment, useState, type ReactNode } from "react"
import {
  Check, Copy, Info, Lightbulb, AlertTriangle, CheckCircle2, XCircle, AlertCircle, Quote,
} from "lucide-react"

/**
 * Rendu Markdown riche et SANS dépendance (pas de react-markdown/shiki/tiptap — réseau du poste).
 * Couvre : titres H1–H4, listes, gras/italique, ==surlignage==, code inline, **blocs de code**
 * (coloration légère + copier), liens, **images** ![](url), **[[wikilinks]]**, **#tags**, et
 * **callouts** façon Obsidian `> [!tip] Titre`. Réutilisé par le chat IA et les notes Brain OS.
 */

export interface MarkdownProps {
  content: string
  className?: string
  onWikiLink?: (title: string) => void
  onTag?: (tag: string) => void
  /**
   * Rend les cases à cocher `- [ ]` / `- [x]` **interactives**. Reçoit l'index de la
   * tâche (ordre d'apparition dans le document, 0-based) et son nouvel état.
   * Utiliser {@link toggleTaskInMarkdown} pour reconstruire le markdown côté appelant.
   */
  onToggleTask?: (taskIndex: number, checked: boolean) => void
}

// Détection d'un item de checklist markdown : `- [ ] …`, `* [x] …`, `+ [X] …`.
const TASK_RE = /^(\s*[-*+]\s+)\[([ xX])\]\s+(.*)$/

/**
 * Bascule la Nième case à cocher (0-based, ordre du document) d'une chaîne markdown,
 * en ignorant les blocs de code délimités par ```. Renvoie le markdown mis à jour.
 * Miroir exact de l'ordre de comptage du parseur → l'index reste cohérent avec le rendu.
 */
export function toggleTaskInMarkdown(md: string, taskIndex: number): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n")
  let counter = 0
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i].trim())) { inFence = !inFence; continue }
    if (inFence) continue
    const m = TASK_RE.exec(lines[i])
    if (!m) continue
    if (counter === taskIndex) {
      const checked = m[2] !== " "
      lines[i] = `${m[1]}[${checked ? " " : "x"}] ${m[3]}`
      break
    }
    counter++
  }
  return lines.join("\n")
}

// code | image | [[wiki]] | ==hl== | **b** | *i* | _i_ | [txt](url) | #tag
const INLINE_RE =
  /(`[^`]+`)|(!\[[^\]]*\]\([^)]+\))|(\[\[[^\]]+\]\])|(==[^=]+==)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]]+\]\([^)]+\))|(#[\p{L}_][\p{L}0-9_/-]{0,39})/gu

function renderInline(text: string, keyPrefix: string, opts: MarkdownProps): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  INLINE_RE.lastIndex = 0
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const token = m[0]
    const key = `${keyPrefix}-${i++}`
    if (token.startsWith("`")) {
      out.push(<code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{token.slice(1, -1)}</code>)
    } else if (token.startsWith("![")) {
      const mm = /!\[([^\]]*)\]\(([^)]+)\)/.exec(token)
      out.push(mm
        // eslint-disable-next-line @next/next/no-img-element
        ? <img key={key} src={mm[2]} alt={mm[1]} className="my-2 max-h-96 rounded-lg border object-contain" />
        : token)
    } else if (token.startsWith("[[")) {
      const title = token.slice(2, -2).trim()
      out.push(
        <button key={key} type="button" onClick={opts.onWikiLink ? () => opts.onWikiLink!(title) : undefined}
          className="text-primary underline decoration-dotted underline-offset-2 hover:bg-primary/10 rounded px-0.5">
          {title}
        </button>,
      )
    } else if (token.startsWith("==")) {
      out.push(<mark key={key} className="rounded bg-amber-200/60 px-0.5 dark:bg-amber-400/25">{token.slice(2, -2)}</mark>)
    } else if (token.startsWith("**")) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith("*") || token.startsWith("_")) {
      out.push(<em key={key}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith("#")) {
      const tag = token.slice(1)
      out.push(
        <button key={key} type="button" onClick={opts.onTag ? () => opts.onTag!(tag) : undefined}
          className="inline-flex items-center rounded-full bg-primary/10 px-1.5 text-[0.8em] font-medium text-primary hover:bg-primary/20">
          #{tag}
        </button>,
      )
    } else {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(token)
      out.push(mm
        ? <a key={key} href={mm[2]} target="_blank" rel="noopener noreferrer"
             className="text-primary underline underline-offset-2 hover:opacity-80">{mm[1]}</a>
        : token)
    }
    last = m.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// ─── Callouts (façon Obsidian) ────────────────────────────────────────────────

const CALLOUTS: Record<string, { icon: typeof Info; cls: string; accent: string; label: string }> = {
  note:    { icon: Info, cls: "border-blue-500/30 bg-blue-500/5", accent: "text-blue-500", label: "Note" },
  info:    { icon: Info, cls: "border-blue-500/30 bg-blue-500/5", accent: "text-blue-500", label: "Info" },
  tip:     { icon: Lightbulb, cls: "border-emerald-500/30 bg-emerald-500/5", accent: "text-emerald-500", label: "Tip" },
  success: { icon: CheckCircle2, cls: "border-emerald-500/30 bg-emerald-500/5", accent: "text-emerald-500", label: "Success" },
  warning: { icon: AlertTriangle, cls: "border-amber-500/30 bg-amber-500/5", accent: "text-amber-500", label: "Warning" },
  danger:  { icon: XCircle, cls: "border-red-500/30 bg-red-500/5", accent: "text-red-500", label: "Danger" },
  error:   { icon: XCircle, cls: "border-red-500/30 bg-red-500/5", accent: "text-red-500", label: "Error" },
  question:{ icon: AlertCircle, cls: "border-violet-500/30 bg-violet-500/5", accent: "text-violet-500", label: "Question" },
}

// ─── Coloration légère et générique ───────────────────────────────────────────

const KEYWORDS = new Set([
  "const","let","var","function","return","if","else","for","while","class","extends","import","export",
  "from","default","new","await","async","public","private","protected","static","void","int","boolean",
  "String","interface","type","enum","def","self","None","True","False","null","true","false","select",
  "where","join","insert","update","delete","and","or","not","package","try","catch","finally","throw","throws",
])
const TOKEN_RE = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/[^\n]*|#[^\n]*)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g

function highlightCode(code: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0, i = 0
  let m: RegExpExecArray | null
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(code)) !== null) {
    if (m.index > last) out.push(code.slice(last, m.index))
    const key = `t${i++}`
    if (m[1]) out.push(<span key={key} className="text-emerald-500 dark:text-emerald-400">{m[1]}</span>)
    else if (m[2]) out.push(<span key={key} className="text-muted-foreground italic">{m[2]}</span>)
    else if (m[3]) out.push(<span key={key} className="text-amber-600 dark:text-amber-400">{m[3]}</span>)
    else if (m[4]) out.push(KEYWORDS.has(m[4]) ? <span key={key} className="font-medium text-violet-600 dark:text-violet-400">{m[4]}</span> : m[4])
    last = m.index + m[0].length
  }
  if (last < code.length) out.push(code.slice(last))
  return out
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{lang || "code"}</span>
        <button type="button" onClick={copy} className="text-muted-foreground hover:text-foreground" aria-label="Copy">
          {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-[0.8rem] leading-relaxed"><code className="font-mono">{highlightCode(code)}</code></pre>
    </div>
  )
}

// ─── Parsing en blocs ─────────────────────────────────────────────────────────

type TaskItem = { checked: boolean; text: string; index: number }

type Block =
  | { type: "code"; lang?: string; code: string }
  | { type: "callout"; kind: string; title: string; lines: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "h"; level: number; text: string }
  | { type: "tasks"; items: TaskItem[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "p"; lines: string[] }

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let para: string[] = []
  let taskCounter = 0 // index global des cases à cocher (ordre du document)
  const flushPara = () => { if (para.length) { blocks.push({ type: "p", lines: para }); para = [] } }

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx]
    const fence = /^```(\w*)\s*$/.exec(raw.trim())
    if (fence) {
      flushPara()
      const lang = fence[1] || undefined
      const code: string[] = []
      idx++
      while (idx < lines.length && !/^```\s*$/.test(lines[idx].trim())) { code.push(lines[idx]); idx++ }
      blocks.push({ type: "code", lang, code: code.join("\n") })
      continue
    }
    // Citations / callouts : lignes consécutives commençant par >
    if (/^>\s?/.test(raw)) {
      flushPara()
      const quoted: string[] = []
      while (idx < lines.length && /^>\s?/.test(lines[idx])) { quoted.push(lines[idx].replace(/^>\s?/, "")); idx++ }
      idx--
      const head = /^\[!(\w+)\]\s*(.*)$/.exec(quoted[0] ?? "")
      if (head) {
        blocks.push({ type: "callout", kind: head[1].toLowerCase(), title: head[2].trim(), lines: quoted.slice(1) })
      } else {
        blocks.push({ type: "quote", lines: quoted })
      }
      continue
    }
    const line = raw.trimEnd()
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    const task = TASK_RE.exec(line)
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (heading) { flushPara(); blocks.push({ type: "h", level: heading[1].length, text: heading[2] }) }
    else if (task) {
      flushPara()
      const item: TaskItem = { checked: task[2] !== " ", text: task[3], index: taskCounter++ }
      const prev = blocks[blocks.length - 1]
      if (prev && prev.type === "tasks") prev.items.push(item); else blocks.push({ type: "tasks", items: [item] })
    }
    else if (bullet) {
      flushPara()
      const prev = blocks[blocks.length - 1]
      if (prev && prev.type === "ul") prev.items.push(bullet[1]); else blocks.push({ type: "ul", items: [bullet[1]] })
    } else if (ordered) {
      flushPara()
      const prev = blocks[blocks.length - 1]
      if (prev && prev.type === "ol") prev.items.push(ordered[1]); else blocks.push({ type: "ol", items: [ordered[1]] })
    } else if (line.trim() === "") { flushPara() }
    else para.push(line)
  }
  flushPara()
  return blocks
}

const H_CLS = ["text-xl font-bold", "text-lg font-semibold", "text-base font-semibold", "text-sm font-semibold"]

export function Markdown(props: MarkdownProps) {
  const { content, className } = props
  const blocks = parseBlocks(content)
  const inl = (s: string, k: string) => renderInline(s, k, props)
  return (
    <div className={className ?? "space-y-2 text-sm leading-relaxed"}>
      {blocks.map((b, i) => {
        if (b.type === "code") return <CodeBlock key={i} code={b.code} lang={b.lang} />
        if (b.type === "callout") {
          const c = CALLOUTS[b.kind] ?? CALLOUTS.note
          const Icon = c.icon
          return (
            <div key={i} className={`my-2 rounded-lg border-l-2 px-3 py-2 ${c.cls}`}>
              <div className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${c.accent}`}>
                <Icon className="size-3.5" /> {b.title || c.label}
              </div>
              <div className="space-y-1 text-foreground/90">
                {b.lines.map((ln, j) => <p key={j}>{inl(ln, `c${i}-${j}`)}</p>)}
              </div>
            </div>
          )
        }
        if (b.type === "quote") {
          return (
            <blockquote key={i} className="my-2 flex gap-2 border-l-2 border-border pl-3 text-muted-foreground">
              <Quote className="mt-0.5 size-3.5 shrink-0 opacity-50" />
              <div className="space-y-1">{b.lines.map((ln, j) => <p key={j}>{inl(ln, `q${i}-${j}`)}</p>)}</div>
            </blockquote>
          )
        }
        if (b.type === "h") return <p key={i} className={H_CLS[Math.min(b.level, 4) - 1]}>{inl(b.text, `h${i}`)}</p>
        if (b.type === "tasks") {
          const boxCls = (checked: boolean) =>
            `mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40"}`
          return (
            <ul key={i} className="space-y-1">
              {b.items.map((it) => (
                <li key={it.index} className="flex items-start gap-2">
                  {props.onToggleTask ? (
                    <button
                      type="button"
                      onClick={() => props.onToggleTask!(it.index, !it.checked)}
                      aria-label={it.checked ? "Uncheck" : "Check"}
                      className={`${boxCls(it.checked)} cursor-pointer hover:brightness-110`}
                    >
                      {it.checked && <Check className="size-3" />}
                    </button>
                  ) : (
                    <span className={boxCls(it.checked)}>{it.checked && <Check className="size-3" />}</span>
                  )}
                  <span className={it.checked ? "text-muted-foreground line-through" : ""}>{inl(it.text, `tk${i}-${it.index}`)}</span>
                </li>
              ))}
            </ul>
          )
        }
        if (b.type === "ul") return <ul key={i} className="list-disc space-y-0.5 pl-5">{b.items.map((it, j) => <li key={j}>{inl(it, `ul${i}-${j}`)}</li>)}</ul>
        if (b.type === "ol") return <ol key={i} className="list-decimal space-y-0.5 pl-5">{b.items.map((it, j) => <li key={j}>{inl(it, `ol${i}-${j}`)}</li>)}</ol>
        return (
          <p key={i}>
            {b.lines.map((ln, j) => (
              <Fragment key={j}>{inl(ln, `p${i}-${j}`)}{j < b.lines.length - 1 && <br />}</Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
