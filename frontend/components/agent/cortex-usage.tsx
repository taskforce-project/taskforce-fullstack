"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useParams } from "next/navigation"
import { Sparkles, ExternalLink, ChevronDown, ChevronRight, RefreshCw } from "lucide-react"

import { cn } from "@/lib/utils"
import { contextGauge, formatTokens, toneOf, type GaugeTone } from "@/lib/cortex/context-gauge"
import { fillText } from "@/lib/delivery/result-card"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { getAiUsage, type AiUsage } from "@/lib/api/ai-usage-service"

const pctOf = (used: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0

function Bar({ pct, tone = "blue" }: { pct: number; tone?: GaugeTone }) {
  const color =
    tone === "rose"
      ? "bg-shape-red"
      : tone === "amber"
        ? "bg-shape-yellow"
        : "bg-primary"
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
    <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2" className="stroke-muted" />
      <circle
        cx="8" cy="8" r={r} fill="none" strokeWidth="2" strokeLinecap="round"
        className={cn(pct >= 90 ? "stroke-shape-red" : pct >= 70 ? "stroke-shape-yellow" : "stroke-primary")}
        strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
      />
    </svg>
  )
}

/**
 * Modal « façon Claude » sous l'input du chat : la **fenêtre de contexte** et la **consommation du mois** (vs le plafond
 * de l'instance s'il y en a un, avec réinitialisation), modèle + refresh en pied. La jauge de contexte montre ce que Cortex
 * a envoyé au modèle pour sa dernière réponse, contre la fenêtre que la passerelle a donnée à cette requête, avec une
 * ligne qui dit ce que c'est (test du CEO du 05/11/2026 : le cumul de la conversation contre une fenêtre écrite en dur
 * donnait « 45k / 33k (100%) », sans rien dire).
 */
export function CortexUsage({ className }: { className?: string }) {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const openSettings = useSettingsStore((s) => s.openSettings)
  const t = usePreferencesStore((s) => s.t.cortex)
  const context = useCortexStore((s) => s.context)
  // La plus grande fenêtre que la passerelle donne au modèle de Cortex (Ollama), que la ligne de la jauge dit.
  const maximum = useAiStatusStore((s) => s.status?.fastContextWindow ?? s.status?.contextWindow ?? null)
  const fetchAiStatus = useAiStatusStore((s) => s.fetchStatus)

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

  // `minSpin` : durée minimale de l'animation, uniquement au clic manuel (pas à l'ouverture) - sinon un
  // refresh instantané ne laisse pas voir le spin et on ne « sent » pas que ça a rechargé.
  const load = useCallback(async (minSpin = false) => {
    if (!slug) return
    setRefreshing(true)
    try {
      await Promise.all([
        getAiUsage(slug).then(setUsage),
        fetchAiStatus(),
        minSpin ? new Promise((resolve) => setTimeout(resolve, 550)) : Promise.resolve(),
      ])
    } catch {
      /* non bloquant */
    } finally {
      setRefreshing(false)
    }
  }, [slug, fetchAiStatus])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    place()
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      // Clic hors du trigger ET hors du popover porté → ferme.
      if (!ref.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false)
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

  const gauge = contextGauge(context, maximum, t)
  const unlimited = usage ? usage.limitTokens < 0 : false
  const usePct = usage && !unlimited ? pctOf(usage.usedTokens, usage.limitTokens) : 0
  const openDetails = () => { setOpen(false); openSettings("usage") }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={t.usageTitle}
        aria-label={t.usageTitle}
      >
        <Ring pct={gauge.pct} />
        <span className="font-medium">Cortex</span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && coords && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          style={{ position: "fixed", left: coords.left, bottom: coords.bottom, transform: "translateX(-100%)" }}
          className="z-[120] w-80 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {/* Fenêtre de contexte : la dernière demande contre la fenêtre qu'elle a eue */}
          <div className="p-3">
            <div className="flex w-full items-center justify-between text-xs">
              <span className="text-muted-foreground">{t.contextTitle}</span>
              {gauge.value && <span className="tabular-nums font-medium">{gauge.value}</span>}
            </div>
            {gauge.value && context?.window ? <div className="mt-1.5"><Bar pct={gauge.pct} tone={gauge.tone} /></div> : null}
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{gauge.line}</p>
          </div>

          <div className="h-px bg-border" />

          {/* Utilisation du mois */}
          <div className="p-3">
            <button
              type="button"
              onClick={openDetails}
              className="flex w-full items-center justify-between text-left text-xs font-semibold transition-colors hover:text-foreground"
            >
              <span>{t.usageMonthly}</span>
              <ChevronRight className="size-3 text-muted-foreground" />
            </button>

            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{t.usageThisMonth}</span>
                <span className="tabular-nums">
                  {usage
                    ? <>{fillText(t.usageResets, { date: usage.resetAt })} · <span className="font-medium">{unlimited ? t.usageUnlimited : `${usePct}%`}</span></>
                    : "…"}
                </span>
              </div>
              <Bar pct={unlimited ? 4 : usePct} tone={unlimited ? "blue" : toneOf(usePct)} />
              {usage && (
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
                  <span className="tabular-nums">
                    {unlimited
                      ? fillText(t.usageTokens, { used: formatTokens(usage.usedTokens) })
                      : fillText(t.usageTokensOf, { used: formatTokens(usage.usedTokens), limit: formatTokens(usage.limitTokens) })}
                  </span>
                  <span className="tabular-nums">
                    {usage.promptTokens.toLocaleString("en-US")}↑ · {usage.completionTokens.toLocaleString("en-US")}↓ · {fillText(t.usageRequests, { count: usage.requestCount })}
                  </span>
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
                title={t.usageRefresh}
                aria-label={t.usageRefresh}
              >
                <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              </button>
              <button
                type="button"
                onClick={openDetails}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
              >
                <ExternalLink className="size-3" /> {t.usageDetails}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
