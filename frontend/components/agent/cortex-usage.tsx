"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useParams } from "next/navigation"
import { Sparkles, ExternalLink, Zap, ChevronDown, ChevronRight, RefreshCw } from "lucide-react"

import { cn } from "@/lib/utils"
import { useUpgradeStore } from "@/lib/store/upgrade-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { getAiUsage, type AiUsage } from "@/lib/api/ai-usage-service"

/** Fenêtre de contexte du modèle local (approx.) — sert la jauge « fenêtre de contexte ». */
const CONTEXT_WINDOW = 32_768

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n)

const pctOf = (used: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0

function Bar({ pct, tone = "blue" }: { pct: number; tone?: "blue" | "amber" | "rose" }) {
  const color =
    tone === "rose"
      ? "bg-rose-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-500 dark:to-blue-300"
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Anneau de progression compact pour le trigger (façon Claude, en bas à droite de l'input). */
function Ring({ pct }: { pct: number }) {
  const r = 6
  const c = 2 * Math.PI * r
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 -rotate-90">
      <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2" className="stroke-muted" />
      <circle
        cx="8" cy="8" r={r} fill="none" strokeWidth="2" strokeLinecap="round"
        className={cn(pct >= 90 ? "stroke-rose-500" : pct >= 70 ? "stroke-amber-500" : "stroke-blue-500 dark:stroke-blue-400")}
        strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
      />
    </svg>
  )
}

/**
 * Modal « façon Claude » sous l'input du chat : **fenêtre de contexte** + **utilisation du forfait**
 * (conso du mois vs plafond du plan, avec réinitialisation), modèle + refresh en pied, CTA détails/upgrade.
 * Auto-porté (pas de portail) pour rester bien positionné dans le panneau flottant.
 */
export function CortexUsage({ sessionTokens, className }: { sessionTokens: number; className?: string }) {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const openUpgrade = useUpgradeStore((s) => s.openUpgrade)
  const openSettings = useSettingsStore((s) => s.openSettings)

  const [open, setOpen] = useState(false)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)      // conteneur du trigger
  const popRef = useRef<HTMLDivElement>(null)   // popover (rendu en portail sur <body>)
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(null)

  // Position FIXE du popover, ancrée AU-DESSUS du trigger (bord droit aligné). Porté sur <body> (portail) :
  // sinon l'`overflow` du panneau flottant Cortex le ROGNE (il s'ouvre vers le haut) et il passe SOUS le
  // sheet. Fixed + portail = il flotte par-dessus tout, jamais clippé (retour user QA-47).
  const place = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setCoords({ left: r.right, bottom: window.innerHeight - r.top + 8 })
  }, [])

  // `minSpin` : durée minimale de l'animation, uniquement au clic manuel (pas à l'ouverture) — sinon un
  // refresh instantané ne laisse pas voir le spin et on ne « sent » pas que ça a rechargé.
  const load = useCallback(async (minSpin = false) => {
    if (!slug) return
    setRefreshing(true)
    try {
      await Promise.all([
        getAiUsage(slug).then(setUsage),
        minSpin ? new Promise((resolve) => setTimeout(resolve, 550)) : Promise.resolve(),
      ])
    } catch {
      /* non bloquant */
    } finally {
      setRefreshing(false)
    }
  }, [slug])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    place()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      // Clic hors du trigger ET hors du popover porté → ferme.
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      document.removeEventListener("mousedown", onDown)
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [open, place])

  const ctxPct = pctOf(sessionTokens, CONTEXT_WINDOW)
  const unlimited = usage ? usage.limitTokens < 0 : false
  const usePct = usage && !unlimited ? pctOf(usage.usedTokens, usage.limitTokens) : 0
  const useTone = usePct >= 90 ? "rose" : usePct >= 70 ? "amber" : "blue"
  const openDetails = () => { setOpen(false); openSettings("usage") }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Context window & usage"
      >
        <Ring pct={ctxPct} />
        <span className="font-medium">Cortex</span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && coords && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          style={{ position: "fixed", left: coords.left, bottom: coords.bottom, transform: "translateX(-100%)" }}
          className="z-[120] w-80 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {/* Fenêtre de contexte */}
          <div className="p-3">
            <button
              type="button"
              onClick={openDetails}
              className="flex w-full items-center justify-between text-left text-xs transition-colors hover:text-foreground"
            >
              <span className="text-muted-foreground">Context window</span>
              <span className="flex items-center gap-1 tabular-nums font-medium">
                {fmt(sessionTokens)} / {fmt(CONTEXT_WINDOW)} <span className="text-muted-foreground">({ctxPct}%)</span>
                <ChevronRight className="size-3 text-muted-foreground" />
              </span>
            </button>
            <div className="mt-1.5"><Bar pct={ctxPct} tone={ctxPct >= 90 ? "rose" : ctxPct >= 70 ? "amber" : "blue"} /></div>
          </div>

          <div className="h-px bg-border" />

          {/* Utilisation du forfait */}
          <div className="p-3">
            <button
              type="button"
              onClick={openDetails}
              className="flex w-full items-center justify-between text-left text-xs font-semibold transition-colors hover:text-foreground"
            >
              <span>Plan usage · <span className="uppercase text-muted-foreground">{usage?.plan ?? "…"}</span></span>
              <ChevronRight className="size-3 text-muted-foreground" />
            </button>

            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">This month</span>
                <span className="tabular-nums">
                  {usage
                    ? (unlimited
                      ? <>Resets {usage.resetAt} · <span className="font-medium">unlimited</span></>
                      : <>Resets {usage.resetAt} · <span className="font-medium">{usePct}%</span></>)
                    : "…"}
                </span>
              </div>
              <Bar pct={unlimited ? 4 : usePct} tone={unlimited ? "blue" : useTone} />
              {usage && (
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
                  <span className="tabular-nums">
                    {fmt(usage.usedTokens)} {unlimited ? "" : `/ ${fmt(usage.limitTokens)} `}tokens
                  </span>
                  <span className="tabular-nums">{usage.promptTokens.toLocaleString("en-US")}↑ · {usage.completionTokens.toLocaleString("en-US")}↓ · {usage.requestCount} req.</span>
                </div>
              )}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Pied : modèle + refresh + actions (façon Claude « Opus 4.8 Max ») */}
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Sparkles className="size-3.5 text-primary" /> Cortex
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void load(true)}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Actualiser"
              >
                <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              </button>
              <button
                type="button"
                onClick={openDetails}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
              >
                <ExternalLink className="size-3" /> Details
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); openUpgrade() }}
                className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Zap className="size-3" /> Upgrade
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
