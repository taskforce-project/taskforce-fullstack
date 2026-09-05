"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, ChevronLeft, Wrench, Play, Search, ShieldCheck, Pencil, AlertTriangle, Copy, Check } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { getErrorMessage } from "@/lib/api/client"
import {
  getMcpServerTools, executeMcpAction,
  type McpToolInfo, type JsonSchemaProperty,
} from "@/lib/api/integration-service"

/** Type « scalaire » effectif d'une propriété de schéma (1er type si union, ex. ["string","null"]). */
function propType(spec: JsonSchemaProperty): string {
  return (Array.isArray(spec.type) ? spec.type[0] : spec.type) ?? "string"
}

/** Convertit la saisie texte vers le type attendu par l'outil ; "" → non transmis (undefined). */
function coerce(spec: JsonSchemaProperty, raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === "") return undefined
  switch (propType(spec)) {
    case "number":
    case "integer": {
      const n = Number(trimmed)
      return Number.isNaN(n) ? trimmed : n
    }
    case "boolean":
      return trimmed === "true"
    case "object":
    case "array":
      try { return JSON.parse(trimmed) } catch { return trimmed }
    default:
      return raw
  }
}

/**
 * Console d'actions MCP (TF-MCP-06) : liste les outils d'UN serveur MCP connecté et permet d'en
 * exécuter un directement — **hors Cortex/LLM**, donc non impacté par la limite de tokens du LLM.
 * Le formulaire est généré depuis le `inputSchema` (JSON Schema) de chaque outil ; une écriture
 * (`readOnly=false`) demande une confirmation avant de partir.
 */
export function McpActionConsole({
  slug, connectorKey, connectorName,
}: Readonly<{ slug: string; connectorKey: string; connectorName: string }>) {
  const [tools, setTools] = useState<McpToolInfo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<McpToolInfo | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    setTools(null); setLoadError(null)
    getMcpServerTools(slug, connectorKey)
      .then((t) => { if (alive) setTools(t) })
      .catch((e) => { if (alive) setLoadError(getErrorMessage(e) || "Could not load this server's tools.") })
    return () => { alive = false }
  }, [slug, connectorKey])

  const fields = useMemo(() => {
    const props = selected?.inputSchema?.properties ?? {}
    const required = new Set(selected?.inputSchema?.required ?? [])
    return Object.entries(props).map(([key, spec]) => ({ key, spec, required: required.has(key) }))
  }, [selected])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!tools || !q) return tools ?? []
    return tools.filter((t) => t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q))
  }, [tools, query])

  function openTool(t: McpToolInfo) {
    setSelected(t)
    setResult(null)
    setConfirming(false)
    const init: Record<string, string> = {}
    for (const [k, spec] of Object.entries(t.inputSchema?.properties ?? {})) {
      if (spec.default !== undefined && spec.default !== null) init[k] = String(spec.default)
    }
    setValues(init)
  }

  async function run() {
    if (!selected) return
    const missing = fields.filter((f) => f.required && !(values[f.key] ?? "").trim())
    if (missing.length > 0) {
      toast.error(`Missing required field(s): ${missing.map((m) => m.key).join(", ")}`)
      return
    }
    setRunning(true); setConfirming(false); setResult(null)
    try {
      const args: Record<string, unknown> = {}
      for (const { key, spec } of fields) {
        const v = coerce(spec, values[key] ?? "")
        if (v !== undefined) args[key] = v
      }
      const output = await executeMcpAction(slug, `${connectorKey}__${selected.name}`, args)
      setResult(output)
    } catch (e) {
      toast.error(getErrorMessage(e) || "The action failed.")
    } finally {
      setRunning(false)
    }
  }

  function onRunClick() {
    if (!selected) return
    if (selected.readOnly) run()
    else setConfirming(true)
  }

  async function copyResult() {
    if (result == null) return
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard indispo : sans bruit */ }
  }

  // ---- Chargement / erreur ------------------------------------------------
  if (loadError) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>{loadError}</span>
      </div>
    )
  }
  if (tools === null) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  if (tools.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">This server exposes no tools.</p>
  }

  // ---- Détail d'un outil (formulaire + exécution) -------------------------
  if (selected) {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setSelected(null)}
                className="flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft className="size-3.5" /> All tools
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <Wrench className="size-4 text-primary" />
          <span className="font-mono text-sm font-semibold text-foreground">{selected.name}</span>
          {selected.readOnly
            ? <Badge variant="outline" className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-[10px] text-emerald-500"><ShieldCheck className="size-3" /> Read</Badge>
            : <Badge variant="outline" className="gap-1 border-amber-500/25 bg-amber-500/10 text-[10px] text-amber-500"><Pencil className="size-3" /> Write</Badge>}
        </div>
        {selected.description && <p className="text-xs leading-relaxed text-muted-foreground">{selected.description}</p>}

        {/* Formulaire généré depuis le JSON Schema */}
        {fields.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">This tool takes no parameters.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {fields.map(({ key, spec, required }) => {
              const type = propType(spec)
              const label = (
                <span className="text-xs font-medium text-muted-foreground">
                  <span className="font-mono text-foreground">{key}</span>
                  {required && <span className="text-destructive"> *</span>}
                  {spec.description && <span className="ml-1 font-normal opacity-70">— {spec.description}</span>}
                </span>
              )
              if (spec.enum && spec.enum.length > 0) {
                return (
                  <label key={key} className="flex flex-col gap-1">
                    {label}
                    <Select value={values[key] ?? ""} onValueChange={(v) => setValues((p) => ({ ...p, [key]: v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Choose…" /></SelectTrigger>
                      <SelectContent>
                        {spec.enum.map((opt) => <SelectItem key={String(opt)} value={String(opt)}>{String(opt)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </label>
                )
              }
              if (type === "boolean") {
                return (
                  <label key={key} className="flex flex-col gap-1">
                    {label}
                    <Select value={values[key] ?? ""} onValueChange={(v) => setValues((p) => ({ ...p, [key]: v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="true / false" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                )
              }
              if (type === "object" || type === "array") {
                return (
                  <label key={key} className="flex flex-col gap-1">
                    {label}
                    <textarea
                      value={values[key] ?? ""}
                      onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={type === "array" ? '["…"]' : '{ "…": "…" }'}
                      rows={3}
                      className="rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    />
                    <span className="text-[10px] text-muted-foreground/70">JSON</span>
                  </label>
                )
              }
              return (
                <label key={key} className="flex flex-col gap-1">
                  {label}
                  <Input
                    type={type === "number" || type === "integer" ? "number" : "text"}
                    value={values[key] ?? ""}
                    onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.value }))}
                    autoComplete="off"
                  />
                </label>
              )
            })}
          </div>
        )}

        {/* Confirmation d'écriture (bannière inline plutôt qu'un dialog imbriqué) */}
        {confirming ? (
          <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4 shrink-0" /> This runs a write action on {connectorName}. Continue?
            </span>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={run} disabled={running}>
                {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Run anyway
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" className="h-9 w-fit gap-1.5" onClick={onRunClick} disabled={running}>
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {running ? "Running…" : "Run"}
          </Button>
        )}

        {/* Résultat */}
        {result != null && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Result</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" onClick={copyResult}>
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground">
              {result || "(empty response)"}
            </pre>
          </div>
        )}
      </div>
    )
  }

  // ---- Liste des outils ---------------------------------------------------
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tools…" className="h-9 pl-9" />
      </div>
      <div className="flex max-h-80 flex-col gap-1.5 overflow-auto pr-1">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No tool matches your search.</p>
        ) : filtered.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => openTool(t)}
            className={cn(
              "flex flex-col gap-0.5 rounded-md border border-border bg-card p-2.5 text-left transition-colors hover:border-foreground/20 hover:bg-muted/40",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs font-semibold text-foreground">{t.name}</span>
              {!t.readOnly && (
                <Badge variant="outline" className="gap-1 border-amber-500/25 bg-amber-500/10 text-[9px] text-amber-500"><Pencil className="size-2.5" /> Write</Badge>
              )}
            </span>
            {t.description && <span className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{t.description}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
