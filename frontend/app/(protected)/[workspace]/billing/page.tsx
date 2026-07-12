"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { CircleCheck, Zap, Sparkles, Building2, Loader2 } from "lucide-react"

import { PageContainer, PageHeader } from "@/components/layout/page-shell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useAuth } from "@/lib/contexts/auth-context"
import { stripeService, type SubscriptionInfo } from "@/lib/api/stripe-service"
import { getAiUsage, type AiUsage } from "@/lib/api/ai-usage-service"

type PlanKey = "FREE" | "PRO" | "ENTERPRISE"
type Tab = "individual" | "team"

/** Ordre des forfaits (pour décider upgrade vs rétrogradation). */
const RANK: Record<PlanKey, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 }

interface PlanDef {
  key: PlanKey
  name: string
  tab: Tab
  tagline: string
  /** Prix mensuel en € (0 = gratuit, null = sur devis). Le prix annuel = −17 %. */
  monthly: number | null
  /** Forfait dont celui-ci hérite (« Tout ce qui est dans X, plus : »). */
  inherits?: string
  features: string[]
  highlight?: boolean
}

/** Forfaits TaskForce — crédits IA alignés sur le quota par compte (cf. AiUsageService.limitFor). */
const PLANS: PlanDef[] = [
  {
    key: "FREE",
    name: "Free",
    tab: "individual",
    tagline: "Pour découvrir TaskForce, en solo ou à quelques-uns.",
    monthly: 0,
    features: [
      "2 workspaces",
      "Jusqu'à 5 membres",
      "Board, List & Cycles",
      "Smart Assign de base",
      "100 000 tokens IA Cortex / mois",
    ],
  },
  {
    key: "PRO",
    name: "Pro",
    tab: "individual",
    highlight: true,
    tagline: "Pour les équipes qui livrent au quotidien.",
    monthly: 12,
    inherits: "Free",
    features: [
      "10 workspaces",
      "Jusqu'à 50 membres",
      "1 000 000 tokens IA Cortex / mois",
      "Mémoire Cortex : le fil se souvient d'un tour à l'autre",
      "Analytics avancées + burndown",
      "Décisions & insights IA",
      "Intégration GitHub",
      "Support prioritaire",
    ],
  },
  {
    key: "ENTERPRISE",
    name: "Enterprise",
    tab: "team",
    tagline: "Pour les organisations : sécurité, conformité et déploiement dédié.",
    monthly: null,
    inherits: "Pro",
    features: [
      "Membres illimités",
      "Tokens IA Cortex illimités",
      "SSO / Keycloak dédié",
      "Audit & conformité RGPD",
      "Déploiement on-premise",
      "Accompagnement dédié",
    ],
  },
]

/**
 * Page **Facturation** dédiée — structure et workflow calqués sur une page d'abonnement moderne
 * (onglets Individuel / Team, bascule mensuel / annuel, comparatif de forfaits, CTA qui s'adaptent au
 * forfait courant, checkout Stripe direct). Barre compacte plan courant + consommation IA (par compte).
 */
export default function BillingPage() {
  const { user } = useAuth()
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const current = (user?.planType ?? "FREE") as PlanKey

  const [tab, setTab] = useState<Tab>("individual")
  const [annual, setAnnual] = useState(false)
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (current === "FREE") return
    let alive = true
    stripeService.getSubscriptionInfo().then((s) => { if (alive) setSub(s) }).catch(() => { /* non bloquant */ })
    return () => { alive = false }
  }, [current])

  useEffect(() => {
    if (!slug) return
    let alive = true
    getAiUsage(slug).then((u) => { if (alive) setUsage(u) }).catch(() => { /* non bloquant */ })
    return () => { alive = false }
  }, [slug])

  const renewLabel = (() => {
    if (current === "FREE") return "Forfait gratuit"
    if (!sub?.currentPeriodEnd) return "Abonnement actif"
    const date = new Date(sub.currentPeriodEnd).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    return sub.cancelAtPeriodEnd ? `Se termine le ${date}` : `Renouvellement le ${date}`
  })()

  const unlimited = usage ? usage.limitTokens < 0 : false
  const usePct = usage && !unlimited ? Math.min(100, Math.round((usage.usedTokens / usage.limitTokens) * 100)) : 0

  async function openPortal() {
    setBusy(true)
    try {
      await stripeService.openBillingPortal() // redirige vers le portail Stripe
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Portail de facturation indisponible pour le moment")
      setBusy(false)
    }
  }

  async function checkoutPro() {
    setBusy(true)
    try {
      const { checkoutUrl } = await stripeService.createCheckoutSession("PRO")
      window.location.href = checkoutUrl
    } catch {
      toast.error("Impossible de démarrer le paiement pour le moment. Réessayez plus tard.")
      setBusy(false)
    }
  }

  function priceFor(p: PlanDef): { big: string; per: string; note: string } {
    if (p.monthly === null) return { big: "Sur devis", per: "", note: "Facturation annuelle" }
    if (p.monthly === 0) return { big: "0 €", per: "/ mois", note: "Gratuit pour toujours" }
    const perMonth = annual ? Math.round(p.monthly * 0.83) : p.monthly
    return { big: `${perMonth} €`, per: "/ mois", note: annual ? "Facturé annuellement · −17 %" : "Facturé mensuellement" }
  }

  function renderCta(p: PlanDef) {
    const base = "h-10 w-full font-medium"
    if (p.key === current) {
      return current === "FREE"
        ? <Button variant="secondary" className={base} disabled>Forfait actuel</Button>
        : <Button variant="outline" className={base} onClick={openPortal} disabled={busy}>{busy ? "Ouverture…" : "Gérer la facturation"}</Button>
    }
    if (p.key === "ENTERPRISE") {
      return (
        <Button asChild variant="outline" className={cn(base, "gap-1.5")}>
          <a href="mailto:sales@taskforce.dev?subject=Demande%20Enterprise%20TaskForce">
            <Building2 className="size-4" /> Nous contacter
          </a>
        </Button>
      )
    }
    if (RANK[p.key] < RANK[current]) {
      return <Button variant="ghost" className={cn(base, "text-muted-foreground hover:text-foreground")} onClick={openPortal} disabled={busy}>Rétrograder vers {p.name}</Button>
    }
    return (
      <Button
        variant={p.highlight ? "default" : "outline"}
        className={cn(base, "gap-1.5")}
        onClick={p.key === "PRO" ? checkoutPro : undefined}
        disabled={busy}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Passer à {p.name}
      </Button>
    )
  }

  const shown = PLANS.filter((p) => p.tab === tab)

  return (
    <PageContainer>
      <PageHeader title="Facturation" description="Votre forfait, votre consommation IA et les options d'évolution." />

      {/* Barre compacte : forfait courant + consommation IA (agrégée par compte) */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Zap className="size-4" />
          </div>
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Forfait <span className="capitalize">{current.toLowerCase()}</span>
              {current !== "FREE" && (
                <Badge variant="outline" className="border-amber-500/20 bg-amber-500/15 text-amber-500">Active</Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {renewLabel}
              {usage && ` · Cortex ce mois : ${usage.usedTokens.toLocaleString("fr-FR")}${unlimited ? " tokens" : ` / ${usage.limitTokens.toLocaleString("fr-FR")} (${usePct}%)`}`}
            </p>
          </div>
        </div>
        {current !== "FREE" && (
          <Button variant="outline" size="sm" onClick={openPortal} disabled={busy}>{busy ? "Ouverture…" : "Gérer la facturation"}</Button>
        )}
      </div>

      {/* Section forfaits — page dédiée */}
      <div className="mt-8 flex flex-col items-center text-center">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Trouvez le forfait adapté à votre équipe</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Changez de forfait à tout moment. Sans engagement, annulable quand vous voulez.</p>

        {/* Onglet Individuel / Team */}
        <div className="mt-6 inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-sm">
          {([["individual", "Individuel"], ["team", "Team et Enterprise"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "rounded-md px-4 py-1.5 font-medium transition-colors",
                tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Bascule Mensuel / Annuel (forfaits individuels) */}
        {tab === "individual" && (
          <div className="mt-3 inline-flex items-center rounded-full border border-border bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={cn("rounded-full px-3 py-1 font-medium transition-colors", !annual ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              Mensuel
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={cn("rounded-full px-3 py-1 font-medium transition-colors", annual ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              Annuel <span className="text-blue-500">· −17 %</span>
            </button>
          </div>
        )}
      </div>

      {/* Forfaits — colonnes séparées par un filet (style épuré) */}
      <div
        className={cn(
          "mx-auto mt-8 overflow-hidden rounded-2xl border border-border bg-card/40",
          tab === "individual"
            ? "grid max-w-4xl divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0"
            : "max-w-md",
        )}
      >
        {shown.map((p) => {
          const price = priceFor(p)
          const feats: { label: string; head: boolean }[] = [
            ...(p.inherits ? [{ label: `Tout ce qui est dans ${p.inherits}`, head: true }] : []),
            ...p.features.map((f) => ({ label: f, head: false })),
          ]
          return (
            <div
              key={p.key}
              className={cn("flex flex-col p-8", p.highlight && "bg-gradient-to-b from-primary/[0.06] to-transparent")}
            >
              <div className="flex items-center gap-2.5">
                <h3 className="text-2xl font-semibold tracking-tight text-foreground">{p.name}</h3>
                {p.highlight && (
                  <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Recommandé</span>
                )}
              </div>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">{price.big}</span>
                {price.per && <span className="text-sm text-muted-foreground">{price.per}</span>}
              </div>
              <p className="mt-1 h-4 text-xs text-muted-foreground">{price.note}</p>

              <p className="mt-4 min-h-[2.5rem] text-sm leading-relaxed text-muted-foreground">{p.tagline}</p>

              <div className="mt-5">{renderCta(p)}</div>

              <div className="mt-8 flex flex-col gap-3.5">
                {feats.map((f) => (
                  <div key={f.label} className="flex items-center gap-2.5 text-sm">
                    <CircleCheck className={cn("size-[18px] shrink-0", p.highlight ? "text-primary" : "text-muted-foreground/60")} />
                    <span className={f.head ? "font-medium text-foreground" : "text-muted-foreground"}>{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-muted-foreground">
        Les prix et forfaits sont indicatifs (placeholders) et seront ajustés avec la grille tarifaire finale de TaskForce.
        Des limites d&apos;utilisation s&apos;appliquent.
      </p>
    </PageContainer>
  )
}
