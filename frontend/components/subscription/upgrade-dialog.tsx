"use client"

import * as React from "react"
import { Check, Sparkles, Loader2, Building2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { stripeService } from "@/lib/api/stripe-service"
import { useUpgradeStore } from "@/lib/store/upgrade-store"
import { useUserStore } from "@/lib/store/user-store"

type PlanKey = "FREE" | "PRO" | "ENTERPRISE"

interface PlanDef {
  readonly key: PlanKey
  readonly name: string
  readonly price: string
  readonly period?: string
  readonly tagline: string
  readonly features: readonly string[]
  readonly highlight?: boolean
}

const PLANS: readonly PlanDef[] = [
  {
    key: "FREE",
    name: "Free",
    price: "0 €",
    period: "/mois",
    tagline: "Pour démarrer et tester.",
    features: ["2 workspaces", "Jusqu'à 5 membres", "Board, List, Cycles", "Smart Assign de base"],
  },
  {
    key: "PRO",
    name: "Pro",
    price: "12 €",
    period: "/mois",
    tagline: "Pour les équipes qui livrent.",
    highlight: true,
    features: [
      "10 workspaces",
      "Jusqu'à 50 membres",
      "Analytics avancées + burndown",
      "Assistant IA & insights",
      "Intégrations (GitHub)",
      "Support prioritaire",
    ],
  },
  {
    key: "ENTERPRISE",
    name: "Enterprise",
    price: "Sur devis",
    tagline: "Sécurité, SSO & on-premise.",
    features: ["Membres illimités", "SSO / Keycloak dédié", "Audit & RGPD avancés", "Déploiement on-premise", "Accompagnement dédié"],
  },
]

/**
 * Modal d'upgrade dédié, attractif (style « website ») — QA2-19.
 * Monté une fois globalement (AppShell), piloté par `useUpgradeStore`.
 * Le CTA Pro lance directement le checkout Stripe (pas de détour par les Settings).
 */
export function UpgradeDialog() {
  const open = useUpgradeStore((s) => s.open)
  const closeUpgrade = useUpgradeStore((s) => s.closeUpgrade)
  const planType = useUserStore((s) => s.user?.planType) ?? "FREE"
  const [loading, setLoading] = React.useState(false)

  async function upgradeToPro() {
    setLoading(true)
    try {
      const { checkoutUrl } = await stripeService.createCheckoutSession("PRO")
      window.location.href = checkoutUrl
    } catch {
      toast.error("Impossible de démarrer le paiement pour le moment. Réessayez plus tard.")
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeUpgrade() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-1 flex size-10 items-center justify-center rounded-full bg-amber-500/15">
            <Sparkles className="size-5 text-amber-500" />
          </div>
          <DialogTitle className="text-xl">Passez à la vitesse supérieure</DialogTitle>
          <DialogDescription>
            Débloquez l&apos;IA, les analytics avancées et les intégrations. Annulable à tout moment.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.key === planType
            return (
              <div
                key={plan.key}
                className={cn(
                  "relative flex flex-col rounded-xl border p-4",
                  plan.highlight ? "border-primary/50 shadow-md" : "border-border"
                )}
              >
                {plan.highlight && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                    Recommandé
                  </Badge>
                )}
                <div className="mb-3">
                  <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>
                  <p className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-semibold tracking-tight">{plan.price}</span>
                    {plan.period && <span className="text-xs text-muted-foreground">{plan.period}</span>}
                  </p>
                </div>

                <ul className="mb-4 flex flex-1 flex-col gap-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button variant="outline" size="sm" className="w-full" disabled>
                    Plan actuel
                  </Button>
                ) : plan.key === "PRO" ? (
                  <Button size="sm" className="w-full gap-1.5" onClick={upgradeToPro} disabled={loading}>
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    Passer à Pro
                  </Button>
                ) : plan.key === "ENTERPRISE" ? (
                  <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                    <a href="mailto:sales@taskforce.dev?subject=Demande%20Enterprise%20TaskForce">
                      <Building2 className="size-3.5" /> Nous contacter
                    </a>
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="w-full" onClick={closeUpgrade}>
                    Continuer en Free
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
