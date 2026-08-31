"use client"

import { useEffect, useState } from "react"
import { BarChart3, Loader2, Pin, Plus, Send, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  generateChart,
  listSavedCharts,
  type ChartSpec,
  type SavedChart,
} from "@/lib/api/analytics-service"
import { useDashboardCardsStore } from "@/lib/store/dashboard-cards-store"
import { CARD_DEFINITIONS, type CardDefinition } from "./card-registry"
import { DashboardSpecChart } from "./spec-chart"

interface AddCardDialogProps {
  readonly slug: string
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

/**
 * Dialog d'ajout de carte : grille des types du registre (POST direct),
 * génération d'un graphe par l'IA (aperçu réel → épingler), et graphes
 * déjà épinglés dans Intelligence, ajoutables en un clic.
 */
export function AddCardDialog({ slug, open, onOpenChange }: AddCardDialogProps) {
  const addCard = useDashboardCardsStore((s) => s.addCard)

  const [pending, setPending] = useState<string | null>(null)
  const [prompt, setPrompt] = useState("")
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(false)
  const [spec, setSpec] = useState<ChartSpec | null>(null)
  const [saved, setSaved] = useState<SavedChart[]>([])

  useEffect(() => {
    if (!open || !slug) return
    setPrompt("")
    setSpec(null)
    setGenError(false)
    setPending(null)
    // Graphes épinglés dans Intelligence - non bloquant si indisponible.
    listSavedCharts(slug)
      .then(setSaved)
      .catch(() => setSaved([]))
  }, [open, slug])

  const pickable = CARD_DEFINITIONS.filter((d) => !d.hiddenInPicker)

  async function handleAddType(def: CardDefinition) {
    if (pending) return
    setPending(def.type)
    const created = await addCard(slug, { cardType: def.type, config: { size: def.defaultSize } })
    setPending(null)
    if (created) onOpenChange(false)
    else toast.error("Couldn't add the card")
  }

  async function handleGenerate() {
    const q = prompt.trim()
    if (!q || generating) return
    setGenerating(true)
    setGenError(false)
    try {
      // Timeout IA géré par le service (AI_TIMEOUT_MS).
      setSpec(await generateChart(slug, q))
    } catch {
      setGenError(true)
    } finally {
      setGenerating(false)
    }
  }

  async function handlePinSpec() {
    if (!spec || pending) return
    setPending("ai-chart")
    const created = await addCard(slug, {
      cardType: "ai-chart",
      title: spec.title || "AI chart",
      config: { size: "2", spec },
    })
    setPending(null)
    if (created) onOpenChange(false)
    else toast.error("Couldn't pin the chart")
  }

  async function handleAddSaved(chart: SavedChart) {
    if (pending) return
    setPending(`saved-${chart.id}`)
    const created = await addCard(slug, {
      cardType: "ai-chart",
      title: chart.title,
      config: { size: "2", spec: chart.spec },
    })
    setPending(null)
    if (created) onOpenChange(false)
    else toast.error("Couldn't add this chart")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a card</DialogTitle>
          <DialogDescription>
            All cards rely on your workspace&apos;s real data.
          </DialogDescription>
        </DialogHeader>

        {/* Types du registre */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {pickable.map((def) => (
            <button
              key={def.type}
              type="button"
              onClick={() => void handleAddType(def)}
              disabled={pending !== null}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border border-border p-3 text-left transition-colors",
                "hover:border-primary/40 hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {pending === def.type ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <def.icon className="size-4 text-muted-foreground" />
                )}
                {def.label}
              </span>
              <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{def.description}</span>
            </button>
          ))}
        </div>

        {/* Génération IA */}
        <div className="space-y-2 border-t border-border pt-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="size-3 text-primary" /> Ask AI
          </p>
          <div className="flex gap-2">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. issue breakdown by priority"
              rows={2}
              className="min-h-0 flex-1 resize-none text-sm"
            />
            <Button
              size="sm"
              className="h-auto shrink-0 gap-1.5 self-stretch px-3"
              onClick={() => void handleGenerate()}
              disabled={!prompt.trim() || generating}
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Generate
            </Button>
          </div>
          {genError && <p className="text-[11px] text-rose-500">Generation failed, try again.</p>}

          {spec && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">{spec.title}</p>
                {spec.mode !== "unsupported" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 text-xs"
                    onClick={() => void handlePinSpec()}
                    disabled={pending !== null}
                  >
                    {pending === "ai-chart" ? <Loader2 className="size-3.5 animate-spin" /> : <Pin className="size-3.5" />}
                    Pin to dashboard
                  </Button>
                )}
              </div>
              <div className="h-48 w-full">
                {/* Spec fraîche : les points breakdown arrivent avec la spec, pas de re-fetch. */}
                <DashboardSpecChart slug={slug} spec={spec} preferInlineData />
              </div>
            </div>
          )}
        </div>

        {/* Graphes déjà épinglés dans Intelligence */}
        {saved.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Pin className="size-3" /> My pinned charts
            </p>
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {saved.map((chart) => (
                <div
                  key={chart.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                >
                  <BarChart3 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{chart.title}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => void handleAddSaved(chart)}
                    disabled={pending !== null}
                  >
                    {pending === `saved-${chart.id}` ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Plus className="size-3" />
                    )}
                    Add
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
