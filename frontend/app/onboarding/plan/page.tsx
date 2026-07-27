"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { useRequireAuth } from "@/lib/contexts/auth-context";
import { stripeService } from "@/lib/api/stripe-service";

/**
 * Interstitiel « choix du plan » — présenté APRÈS une inscription externe (GitHub), AVANT le wizard.
 *
 * <p>Une inscription classique choisit son plan dans le stepper d'inscription ; une inscription GitHub,
 * elle, n'a jamais vu cet écran (elle est créée en FREE). On l'insère donc ici, une fois le compte créé :
 * FREE → on continue vers le wizard ; BASIC / BUSINESS → checkout Stripe (flux d'upgrade existant, par
 * membre/mois), retour sur le wizard après paiement. La garde d'onboarding fera de toute façon passer
 * l'utilisateur par le wizard ensuite (le drapeau reste à false jusqu'à sa fin).</p>
 */

type SelfServe = "BASIC" | "BUSINESS";

interface PlanCard {
  key: "FREE" | SelfServe;
  name: string;
  price: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

// Aligné sur la page Facturation (source de vérité des paliers) — par membre/mois.
const PLANS: PlanCard[] = [
  {
    key: "FREE",
    name: "Free",
    price: "0 €",
    tagline: "Pour découvrir TaskForce.",
    features: ["Membres illimités", "2 workspaces", "250 issues", "Smart Assign"],
  },
  {
    key: "BASIC",
    name: "Basic",
    price: "10 €",
    tagline: "Pour les petites équipes qui démarrent.",
    features: ["5 workspaces", "Issues illimitées", "Rôles administrateur", "500k tokens IA / mois"],
  },
  {
    key: "BUSINESS",
    name: "Business",
    price: "16 €",
    tagline: "Pour les équipes qui livrent vite.",
    highlight: true,
    features: ["Workspaces illimités", "Analytics avancées", "Décisions & workflows IA", "2M tokens IA / mois"],
  },
];

export default function OnboardingPlanPage() {
  useRequireAuth();
  const router = useRouter();
  const [loading, setLoading] = useState<SelfServe | null>(null);

  function continueFree() {
    router.push("/onboarding");
  }

  async function choosePaid(plan: SelfServe) {
    setLoading(plan);
    try {
      const origin = window.location.origin;
      // Après paiement → wizard ; annulation → retour sur ce choix de plan.
      const { checkoutUrl } = await stripeService.createCheckoutSession(
        plan,
        `${origin}/onboarding`,
        `${origin}/onboarding/plan`
      );
      window.location.href = checkoutUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'ouvrir le paiement. Réessaie.");
      setLoading(null);
    }
  }

  return (
    <div className="grid min-h-svh place-items-center px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--label-primary)" }}>
            Choisis ton offre
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--label-tertiary)" }}>
            Tu démarres gratuitement et tu peux changer à tout moment. Par membre / mois.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const isFree = plan.key === "FREE";
            const isLoading = loading === plan.key;
            return (
              <div
                key={plan.key}
                className="flex flex-col rounded-2xl border p-5"
                style={{
                  borderColor: plan.highlight ? "var(--accent-purple)" : "var(--border)",
                  background: "var(--surface, var(--background))",
                  boxShadow: plan.highlight ? "0 0 0 1px var(--accent-purple)" : "none",
                }}
              >
                <div className="mb-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-semibold" style={{ color: "var(--label-primary)" }}>
                      {plan.name}
                    </span>
                    {plan.highlight && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                        style={{ background: "var(--accent-purple)" }}
                      >
                        Populaire
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    <span className="text-xl font-semibold" style={{ color: "var(--label-primary)" }}>
                      {plan.price}
                    </span>
                    {!isFree && (
                      <span className="text-xs" style={{ color: "var(--label-tertiary)" }}>
                        {" "}
                        /membre/mois
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--label-tertiary)" }}>
                    {plan.tagline}
                  </p>
                </div>

                <ul className="mb-5 flex-1 space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs" style={{ color: "var(--label-secondary)" }}>
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent-green)" }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {isFree ? (
                  <button
                    type="button"
                    onClick={continueFree}
                    disabled={loading !== null}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--label-primary)" }}
                  >
                    Continuer en Gratuit <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => choosePaid(plan.key as SelfServe)}
                    disabled={loading !== null}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
                    style={{ background: "var(--accent-purple)" }}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Choisir {plan.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={continueFree}
            disabled={loading !== null}
            className="text-xs underline underline-offset-2 disabled:opacity-50"
            style={{ color: "var(--label-tertiary)" }}
          >
            Plus tard — continuer en Gratuit
          </button>
        </div>
      </div>
    </div>
  );
}
