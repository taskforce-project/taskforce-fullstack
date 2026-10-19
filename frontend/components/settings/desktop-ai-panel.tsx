"use client"

import { useEffect, useState } from "react"
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react"

import { CopyableCode } from "@/components/settings/copyable-code"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { desktopBridge, type DesktopAiSettings, type DesktopAiView } from "@/lib/desktop"
import { useAiStatusStore } from "@/lib/store/ai-status-store"

/** Valeur des listes de modèles pour « choisi automatiquement » (un élément de liste ne peut pas être vide). */
const AUTO = "__auto"

const PROVIDERS: { value: DesktopAiSettings["provider"]; label: string; hint: string }[] = [
  { value: "ollama", label: "Ollama on this computer", hint: "Free and private: your projects never leave this computer." },
  {
    value: "custom",
    label: "An OpenAI-compatible API",
    hint: "OpenAI, Mistral, Groq, OpenRouter, LM Studio... The text of each request goes to that provider.",
  },
  { value: "off", label: "No AI", hint: "Projects, issues and the Brain OS keep working. Search uses full text." },
]

/**
 * Réglages « AI » de l'app desktop : où tourne l'IA de TaskForce. Le choix et la clé d'API restent dans la coque (clé
 * dans le trousseau du système), qui relaie les appels du backend vers ce fournisseur (cf. `desktop/src/ai.ts`).
 */
export function DesktopAiPanel() {
  const fetchAiStatus = useAiStatusStore((s) => s.fetchStatus)
  const [view, setView] = useState<DesktopAiView | null>(null)
  const [draft, setDraft] = useState<DesktopAiSettings | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [busy, setBusy] = useState<"load" | "save" | null>("load")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    const bridge = desktopBridge()
    if (!bridge) return
    setBusy("load")
    try {
      const next = await bridge.ai.get()
      setView(next)
      setDraft(next.settings)
    } catch {
      setError("TaskForce couldn't read the AI settings. Restart the app and try again.")
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    const bridge = desktopBridge()
    if (!bridge || !draft) return
    setBusy("save")
    setError(null)
    setSaved(false)
    const result = await bridge.ai.save({ settings: draft, ...(apiKey ? { apiKey } : {}) })
    setBusy(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setView(result.view)
    setDraft(result.view.settings)
    setApiKey("")
    setSaved(true)
    // Cortex et les autres écrans relisent l'état tout de suite, sans attendre les caches.
    void fetchAiStatus(true)
  }

  if (!draft || !view) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {busy === "load" ? <Loader2 className="size-4 animate-spin" /> : null}
        {error ?? "Reading the AI settings..."}
      </div>
    )
  }

  const update = (patch: Partial<DesktopAiSettings>) => {
    setSaved(false)
    setDraft({ ...draft, ...patch })
  }
  const unchanged = JSON.stringify(draft) === JSON.stringify(view.settings) && !apiKey
  const { state } = view

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 border-b border-border/60 pb-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Where the AI runs</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cortex, summaries, suggestions and semantic search use this model. You can change it at any time.
          </p>
        </div>
        <RadioGroup
          value={draft.provider}
          onValueChange={(value) => update({ provider: value as DesktopAiSettings["provider"] })}
          className="flex flex-col gap-3"
        >
          {PROVIDERS.map((p) => (
            <label key={p.value} className="flex cursor-pointer items-start gap-3">
              <RadioGroupItem value={p.value} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-foreground">{p.label}</span>
                <span className="block text-xs text-muted-foreground">{p.hint}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </section>

      {draft.provider === "custom" && (
        <section className="flex flex-col gap-4 border-b border-border/60 pb-6">
          <Field label="API address" hint="With /v1 at the end.">
            <Input
              value={draft.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              spellCheck={false}
            />
          </Field>
          <Field label="API key" hint="Kept in your system keychain, never shown again.">
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setSaved(false)
                setApiKey(e.target.value)
              }}
              placeholder={view.hasApiKey ? "Saved. Type a new key to replace it." : "sk-..."}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </section>
      )}

      {draft.provider !== "off" && (
        <section className="flex flex-col gap-4 border-b border-border/60 pb-6">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Models</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Automatic picks a fast model that handles tools, and a search model of 1024 dimensions.
            </p>
          </div>
          <ModelField
            label="Conversation"
            value={draft.model}
            models={state.models}
            current={state.chat.model}
            onChange={(model) => update({ model })}
          />
          <ModelField
            label="Quick answers"
            value={draft.modelFast}
            models={state.models}
            current={state.chat.model_fast}
            onChange={(modelFast) => update({ modelFast })}
          />
          <ModelField
            label="Search"
            value={draft.embedModel}
            models={state.models}
            current={state.embeddings.model}
            onChange={(embedModel) => update({ embedModel })}
          />
        </section>
      )}

      <StatusLine view={view} />

      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy !== null || unchanged}>
          {busy === "save" && <Loader2 className="size-3.5 animate-spin" />}
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy !== null}>
          Check again
        </Button>
        {saved && <span className="text-xs text-muted-foreground">Saved. TaskForce uses it right away.</span>}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: Readonly<{ label: string; hint: string; children: React.ReactNode }>) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[160px_1fr] sm:items-start sm:gap-4">
      <div className="sm:pt-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Liste des modèles du fournisseur ; sans liste (fournisseur injoignable), un champ libre. */
function ModelField({
  label,
  value,
  models,
  current,
  onChange,
}: Readonly<{ label: string; value: string; models: string[]; current: string | null; onChange: (value: string) => void }>) {
  const hint = value ? "Chosen by you." : current ? `Automatic: ${current}.` : "Automatic: none installed yet."
  return (
    <Field label={label} hint={hint}>
      {models.length > 0 ? (
        <Select value={value || AUTO} onValueChange={(next) => onChange(next === AUTO ? "" : next)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={AUTO}>Automatic</SelectItem>
            {models.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Automatic" spellCheck={false} />
      )}
    </Field>
  )
}

/** Ce qui marche maintenant, et quoi faire sinon. */
function StatusLine({ view }: Readonly<{ view: DesktopAiView }>) {
  const { settings, state } = view
  if (settings.provider === "off") {
    return <p className="text-xs text-muted-foreground">AI is off. Cortex still searches the Brain OS and cites what it finds.</p>
  }
  if (!state.reachable) {
    return settings.provider === "ollama" ? (
      <div className="flex flex-col gap-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <CircleAlert className="size-3.5 text-ink-yellow" /> Ollama isn&apos;t running on this computer
        </p>
        <p>
          Install it from{" "}
          <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="underline">
            ollama.com
          </a>
          , open it, then get a conversation model and a search model:
        </p>
        <CopyableCode label="Conversation model" text="ollama pull qwen3:8b" />
        <CopyableCode label="Search model" text="ollama pull bge-m3" />
      </div>
    ) : (
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <CircleAlert className="size-3.5 text-ink-yellow" /> TaskForce can&apos;t reach this API. Check the address and the key.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-1.5 text-xs">
      <StatusItem ok={state.chat.available} label="Conversation" model={state.chat.model} missing="pull a conversation model, for example qwen3:8b" />
      <StatusItem ok={state.embeddings.available} label="Search" model={state.embeddings.model} missing="pull bge-m3 for semantic search (full text works meanwhile)" />
    </ul>
  )
}

function StatusItem({ ok, label, model, missing }: Readonly<{ ok: boolean; label: string; model: string | null; missing: string }>) {
  return (
    <li className="flex items-center gap-1.5 text-muted-foreground">
      {ok ? <CircleCheck className="size-3.5 text-ink-green" /> : <CircleAlert className="size-3.5 text-ink-yellow" />}
      <span className="font-medium text-foreground">{label}</span>
      {ok ? `ready with ${model}` : `not ready: ${missing}`}
    </li>
  )
}
