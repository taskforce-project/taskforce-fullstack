"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { CircleCheck, Zap, Sparkles, Building2, Loader2, ArrowDownCircle } from "lucide-react"

import { PageContainer, PageHeader } from "@/components/layout/page-shell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useAuth } from "@/lib/contexts/auth-context"
import { getErrorStatus, getErrorMessage } from "@/lib/api/client"
import { stripeService, type SubscriptionInfo } from "@/lib/api/stripe-service"
import { getAiUsage, type AiUsage } from "@/lib/api/ai-usage-service"

type PlanKey = "FREE" | "BASIC" | "BUSINESS" | "ENTERPRISE"
type SelfServe = "BASIC" | "BUSINESS"

/** Ordre des forfaits (pour décider upgrade vs rétrogradation). */
const RANK: Record<PlanKey, number> = { FREE: 0, BASIC: 1, BUSINESS: 2, ENTERPRISE: 3 }

interface PlanDef {
  key: PlanKey
  name: string
  tagline: string
  /** Prix mensuel PAR MEMBRE en € (0 = gratuit, null = sur devis). Prix annuel = −17 %. */
  monthly: number | null
  /** Forfait dont celui-ci hérite (« Tout ce qui est dans X, plus : »). */
  inherits?: string
  features: string[]
  highlight?: boolean
}

/** Forfaits TaskForce (par membre/mois) - crédits IA alignés sur le quota par compte (AiUsageService.limitFor). */
const PLANS: PlanDef[] = [
  {
    key: "FREE",
    name: "Free",
    tagline: "To explore TaskForce.",
    monthly: 0,
    features: [
      "Unlimited members",
      "2 workspaces",
      "250 issues",
      "Board, List & Cycles",
      "Smart Assign",
      "50,000 Cortex AI tokens / month",
    ],
  },
  {
    key: "BASIC",
    name: "Basic",
    tagline: "For small teams getting started.",
    monthly: 10,
    inherits: "Free",
    features: [
      "5 workspaces",
      "Unlimited issues",
      "Unlimited file uploads",
      "Admin roles",
      "300,000 Cortex AI tokens / month",
    ],
  },
  {
    key: "BUSINESS",
    name: "Business",
    tagline: "For teams that ship fast.",
    monthly: 16,
    inherits: "Basic",
    highlight: true,
    features: [
      "Unlimited workspaces",
      "Guests & private projects",
      "Advanced analytics + burndown",
      "AI decisions & workflows",
      "GitHub integration",
      "800,000 Cortex AI tokens / month",
    ],
  },
  {
    key: "ENTERPRISE",
    name: "Enterprise",
    tagline: "Security, compliance and dedicated deployment.",
    monthly: null,
    inherits: "Business",
    features: [
      "SSO / SAML / SCIM",
      "Granular admin controls",
      "Audit & GDPR compliance",
      "On-premise deployment",
      "Priority support & guidance",
      "Unlimited Cortex AI tokens",
    ],
  },
]

/** Petit interrupteur « façon Linear » (pilule bleue + point blanc). */
function YearlyToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
      <span className={cn("relative h-4 w-7 rounded-full transition-colors", on ? "bg-blue-500" : "bg-muted-foreground/30")}>
        <span className={cn("absolute top-0.5 size-3 rounded-full bg-white transition-all", on ? "left-3.5" : "left-0.5")} />
      </span>
      Billed annually
    </button>
  )
}

/**
 * Page **Facturation** - grille d'offres à 4 forfaits (par membre/mois), présentée en colonnes façon
 * page d'abonnement moderne. Barre compacte plan courant + consommation IA (agrégée par compte).
 */
export default function BillingPage() {
  const { user, refreshUser } = useAuth()
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const current = (user?.planType ?? "FREE") as PlanKey

  const [annual, setAnnual] = useState(false)
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [busy, setBusy] = useState(false)
  /** Rétrogradation en attente de confirmation (BUSINESS -> BASIC) - null = pas de dialog ouvert. */
  const [pendingDowngrade, setPendingDowngrade] = useState<SelfServe | null>(null)

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
    if (current === "FREE") return "Free plan"
    if (!sub?.currentPeriodEnd) return "Active subscription"
    const date = new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
    return sub.cancelAtPeriodEnd ? `Ends on ${date}` : `Renews on ${date}`
  })()

  const unlimited = usage ? usage.limitTokens < 0 : false
  const usePct = usage && !unlimited ? Math.min(100, Math.round((usage.usedTokens / usage.limitTokens) * 100)) : 0

  async function openPortal() {
    setBusy(true)
    try {
      await stripeService.openBillingPortal()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Billing portal unavailable right now")
      setBusy(false)
    }
  }

  async function checkout(plan: SelfServe) {
    setBusy(true)
    try {
      const { checkoutUrl } = await stripeService.createCheckoutSession(plan, undefined, undefined, annual ? "year" : "month")
      window.location.assign(checkoutUrl)
    } catch (e) {
      // 409 = règle métier claire (ex. forfait pas encore configuré côté Stripe) → on montre le message
      // serveur ; tout autre cas (réseau, 502 Stripe) reste un message générique.
      toast.error(getErrorStatus(e) === 409 ? getErrorMessage(e) : "Could not start payment right now. Please try again later.")
      setBusy(false)
    }
  }

  /**
   * Change le forfait d'un abonnement EXISTANT sans quitter l'app (upgrade ou rétrogradation entre plans
   * payants) : le back remplace le prix avec proration et reflète le plan aussitôt. On rafraîchit ensuite
   * l'utilisateur (met à jour `current`) et l'abonnement affiché.
   */
  async function doChangePlan(plan: SelfServe) {
    setBusy(true)
    try {
      const updated = await stripeService.changePlan(plan, annual ? "year" : "month")
      setSub(updated)
      await refreshUser()
      toast.success(`You are now on the ${plan === "BASIC" ? "Basic" : "Business"} plan.`)
    } catch (e) {
      // Le service a déjà extrait le message serveur (ex. 502 Stripe indisponible) → on l'affiche tel quel.
      toast.error(e instanceof Error ? e.message : "Could not change your plan right now. Please try again later.")
    } finally {
      setBusy(false)
    }
  }

  function priceFor(p: PlanDef): { big: string; per: string } {
    if (p.monthly === null) return { big: "Custom", per: "" }
    if (p.monthly === 0) return { big: "$0", per: "" }
    // Annuel : reduction FIXE de -2 USD/mois (facture a l'annee). Aligne sur les prix Stripe.
    const perMonth = annual ? p.monthly - 2 : p.monthly
    return { big: `$${perMonth}`, per: annual ? "per member / month, billed yearly" : "per member / month" }
  }

  function renderCta(p: PlanDef) {
    const base = "h-10 w-full font-medium"

    // Forfait courant : gérer l'abonnement (portail Stripe : moyen de paiement, factures) ou badge FREE.
    if (p.key === current) {
      return current === "FREE"
        ? <Button variant="secondary" className={base} disabled>Current plan</Button>
        : <Button variant="outline" className={base} onClick={openPortal} disabled={busy}>{busy ? "Opening…" : "Manage"}</Button>
    }

    // Enterprise : sur devis (contact commercial).
    if (p.key === "ENTERPRISE") {
      return (
        <Button asChild variant="outline" className={cn(base, "gap-1.5")}>
          <a href="mailto:contact@taskforce-project.fr?subject=Demande%20Enterprise%20TaskForce">
            <Building2 className="size-4" /> Contact us
          </a>
        </Button>
      )
    }

    // Retour au gratuit depuis un plan payant = résiliation (accès conservé jusqu'à la fin de période).
    // On passe par le portail Stripe (annulation en fin de période + réactivation possible), pas un change
    // de prix - la sémantique « garde ton accès jusqu'à la fin » est différente d'une bascule de forfait.
    if (p.key === "FREE") {
      return <Button variant="ghost" className={cn(base, "text-muted-foreground hover:text-foreground")} onClick={openPortal} disabled={busy}>{busy ? "Opening…" : "Cancel plan"}</Button>
    }

    // Depuis FREE (aucun abonnement) : nouvel abonnement via Checkout Stripe.
    if (current === "FREE") {
      return (
        <Button variant={p.highlight ? "default" : "outline"} className={cn(base, "gap-1.5")} onClick={() => checkout(p.key as SelfServe)} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Upgrade to {p.name}
        </Button>
      )
    }

    // Entre plans payants (BASIC <-> BUSINESS) : changement de prix IN-APP avec proration, sans portail.
    // Rétrogradation -> dialog de confirmation (features/limites réduites) ; montée en gamme -> immédiate.
    if (RANK[p.key] < RANK[current]) {
      return (
        <Button variant="ghost" className={cn(base, "gap-1.5 text-muted-foreground hover:text-foreground")} onClick={() => setPendingDowngrade(p.key as SelfServe)} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowDownCircle className="size-4" />} Downgrade to {p.name}
        </Button>
      )
    }
    return (
      <Button variant={p.highlight ? "default" : "outline"} className={cn(base, "gap-1.5")} onClick={() => doChangePlan(p.key as SelfServe)} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Upgrade to {p.name}
      </Button>
    )
  }

  return (
    <PageContainer>
      <PageHeader title="Billing" description="Your plan, your AI usage and upgrade options." />

      {/* Barre compacte : forfait courant + consommation IA (agrégée par compte) */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Zap className="size-4" />
          </div>
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Plan <span className="capitalize">{current.toLowerCase()}</span>
              {current !== "FREE" && (
                <Badge variant="outline" className="border-amber-500/20 bg-amber-500/15 text-amber-500">Active</Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {renewLabel}
              {usage && ` · Cortex this month: ${usage.usedTokens.toLocaleString("en-US")}${unlimited ? " tokens" : ` / ${usage.limitTokens.toLocaleString("en-US")} (${usePct}%)`}`}
            </p>
          </div>
        </div>
        {current !== "FREE" && (
          <Button variant="outline" size="sm" onClick={openPortal} disabled={busy}>{busy ? "Opening…" : "Manage billing"}</Button>
        )}
      </div>

      {/* Titre section */}
      <div className="mt-8 text-center">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Plans that grow with your team</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Per-member pricing. Change anytime, no commitment.</p>
      </div>

      {/* Grille responsive : 1 colonne (mobile) → 2 (tablette) → 4 (desktop). Cartes bordées avec
          gap : le layout `divide-*` (basé sur l'ordre DOM) ne sait pas faire un 2 colonnes propre. */}
      <div className="mx-auto mt-6 grid w-full max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => {
          const price = priceFor(p)
          const feats: { label: string; head: boolean }[] = [
            ...(p.inherits ? [{ label: `Everything in ${p.inherits}`, head: true }] : []),
            ...p.features.map((f) => ({ label: f, head: false })),
          ]
          const paid = p.monthly !== null && p.monthly > 0
          return (
            <div
              key={p.key}
              className={cn(
                "flex flex-col rounded-2xl border border-border bg-card p-6",
                p.highlight && "border-primary/30 bg-gradient-to-b from-primary/[0.06] to-transparent ring-1 ring-primary/20",
              )}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold tracking-tight text-foreground">{p.name}</h3>
                {p.highlight && (
                  <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Popular</span>
                )}
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">{price.big}</span>
                {price.per && <span className="text-xs text-muted-foreground">{price.per}</span>}
              </div>

              {/* Toggle annuel (forfaits payants) - sinon ligne d'équilibre */}
              <div className="mt-3 flex h-5 items-center">
                {paid ? <YearlyToggle on={annual} onToggle={() => setAnnual((v) => !v)} /> : (
                  <span className="text-xs text-muted-foreground">
                    {p.monthly === 0 ? "Free forever" : "Annual billing"}
                  </span>
                )}
              </div>

              <p className="mt-3 min-h-[2.5rem] text-sm leading-relaxed text-muted-foreground">{p.tagline}</p>

              <div className="mt-4">{renderCta(p)}</div>

              <div className="mt-7 flex flex-col gap-3">
                {feats.map((f) => (
                  <div key={f.label} className="flex items-start gap-2.5 text-sm">
                    <CircleCheck className={cn("mt-px size-[18px] shrink-0", p.highlight ? "text-primary" : "text-muted-foreground/60")} />
                    <span className={f.head ? "font-medium text-foreground" : "text-muted-foreground"}>{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mx-auto mt-6 max-w-6xl text-center text-xs text-muted-foreground">
        Per-member pricing in USD. During the closed beta, payments run in Stripe test mode (no real charge).
        Change or cancel your plan anytime; usage limits apply.
      </p>

      {/* Confirmation de rétrogradation (changement de prix in-app, proration Stripe). */}
      <AlertDialog
        open={pendingDowngrade !== null}
        onOpenChange={(open) => { if (!open && !busy) setPendingDowngrade(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Downgrade to {pendingDowngrade === "BUSINESS" ? "Business" : "Basic"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your plan changes right away. Stripe credits the unused time on your current plan against the new
              one (proration), so you are not charged twice. Features and limits above the new plan no longer apply.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep my plan</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault() // garde le dialog ouvert pendant l'appel (retour visuel), fermé ensuite
                const target = pendingDowngrade
                if (!target) return
                await doChangePlan(target)
                setPendingDowngrade(null)
              }}
              disabled={busy}
            >
              {busy ? "Downgrading…" : "Confirm downgrade"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}
