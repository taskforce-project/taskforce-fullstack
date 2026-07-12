"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Gauge, ExternalLink, Zap, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { useUpgradeStore } from "@/lib/store/upgrade-store"
import { getAiUsage, type AiUsage } from "@/lib/api/ai-usage-service"

/** Fenêtre de contexte du modèle local (approx. — sert la jauge « contexte de la conversation »). */
const CONTEXT_WINDOW = 32_768

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n)

const pctOf = (used: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0

function Bar({ pct, tone = "primary" }: { pct: number; tone?: "primary" | "amber" | "rose" }) {
  const color =
    tone === "rose" ? "bg-rose-500" : tone === "amber" ? "bg-amber-500" : "bg-primary"
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
        className={cn(pct >= 90 ? "stroke-rose-500" : pct >= 70 ? "stroke-amber-500" : "stroke-primary")}
        strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
      />
    </svg>
  )
}

/**
 * Modal « façon Claude » sous l'input du chat : jauge de **contexte** + **consommation IA**
 * (mois courant vs plafond du plan), avec CTA détails (Settings) et upgrade. Auto-porté (pas de
 * portail) pour rester positionné correctement dans le panneau flottant.
 */
export function CortexUsage({ sessionTokens, className }: { sessionTokens: number; className?: string }) {
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const openUpgrade = useUpgradeStore((s) => s.openUpgrade)

  const [open, setOpen] = useState(false)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !slug) return
    let alive = true
    getAiUsage(slug).then((u) => { if (alive) setUsage(u) }).catch(() => { /* non bloquant */ })
    return () => { alive = false }
  }, [open, slug])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const ctxPct = pctOf(sessionTokens, CONTEXT_WINDOW)
  const unlimited = usage ? usage.limitTokens < 0 : false
  const usePct = usage && !unlimited ? pctOf(usage.usedTokens, usage.limitTokens) : 0
  const useTone = usePct >= 90 ? "rose" : usePct >= 70 ? "amber" : "primary"

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Contexte & consommation IA"
      >
        <Ring pct={ctxPct} />
        <span className="font-medium">Cortex</span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg">
          {/* En-tête */}
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <Gauge className="size-3.5 text-primary" /> Cortex
            </span>
            {usage && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {usage.plan}
              </span>
            )}
          </div>

          {/* Contexte de la conversation */}
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Contexte de la conversation</span>
              <span className="tabular-nums font-medium">{fmt(sessionTokens)} / {fmt(CONTEXT_WINDOW)} <span className="text-muted-foreground">({ctxPct}%)</span></span>
            </div>
            <Bar pct={ctxPct} tone={ctxPct >= 90 ? "rose" : ctxPct >= 70 ? "amber" : "primary"} />
          </div>

          {/* Consommation IA du mois */}
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Consommation IA · ce mois</span>
              <span className="tabular-nums font-medium">
                {usage ? (unlimited
                  ? <>{fmt(usage.usedTokens)} <span className="text-muted-foreground">/ illimité</span></>
                  : <>{fmt(usage.usedTokens)} / {fmt(usage.limitTokens)} <span className="text-muted-foreground">({usePct}%)</span></>
                ) : "…"}
              </span>
            </div>
            <Bar pct={unlimited ? 4 : usePct} tone={unlimited ? "primary" : useTone} />
            {usage && (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
                <span className="tabular-nums">{usage.promptTokens.toLocaleString("fr-FR")}↑ · {usage.completionTokens.toLocaleString("fr-FR")}↓ · {usage.requestCount} req.</span>
                <span>Réinit. {usage.resetAt}</span>
              </div>
            )}
          </div>

          {/* CTAs */}
          <div className="flex items-center gap-2 border-t border-border pt-2.5">
            <Link
              href={slug ? `/${slug}/settings?section=usage` : "#"}
              onClick={() => setOpen(false)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted"
            >
              <ExternalLink className="size-3" /> Détails
            </Link>
            <button
              type="button"
              onClick={() => { setOpen(false); openUpgrade() }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Zap className="size-3" /> Améliorer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
