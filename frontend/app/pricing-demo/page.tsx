"use client";

import { useState } from "react";
import { PricingCardsEnhanced } from "@/components/pricing/pricing-cards-enhanced";
import { ROICalculator } from "@/components/pricing/roi-calculator";
import { ComparisonTable } from "@/components/pricing/comparison-table";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PricingDemoPage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<
    "free" | "pro" | "enterprise"
  >("pro");

  const handleSelectPlan = (planId: "free" | "pro" | "enterprise") => {
    setSelectedPlan(planId);
    console.log("Plan sélectionné:", planId);
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-background to-muted/20">
      {/* Header avec retour */}
      <div className="container mx-auto px-4 py-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
      </div>

      <div className="container mx-auto px-4 py-12 space-y-24">
        {/* Hero Section */}
        <section className="text-center space-y-4 max-w-3xl mx-auto">
          <h1 className="text-5xl font-extrabold tracking-tight">
            Choisissez le plan parfait pour votre équipe
          </h1>
          <p className="text-xl text-muted-foreground">
            Des tarifs transparents et simples. Passez à un plan supérieur quand
            vous voulez.
          </p>
        </section>

        {/* Pricing Cards */}
        <section id="plans">
          <PricingCardsEnhanced
            onSelectPlan={handleSelectPlan}
            selectedPlan={selectedPlan}
            showCta={true}
          />
        </section>

        {/* ROI Calculator */}
        <section id="calculator" className="py-12">
          <ROICalculator />
        </section>

        {/* Comparison Table */}
        <section id="comparison" className="py-12">
          <ComparisonTable />
        </section>

        {/* FAQ Section (placeholder) */}
        <section className="text-center space-y-6 py-12">
          <h2 className="text-3xl font-bold">Questions fréquentes</h2>
          <div className="max-w-2xl mx-auto space-y-4 text-left">
            <details className="group rounded-lg border p-4">
              <summary className="font-semibold cursor-pointer">
                Puis-je changer de plan à tout moment ?
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                Oui ! Vous pouvez upgrader ou downgrader votre plan à tout
                moment depuis votre tableau de bord. Les changements sont
                effectifs immédiatement.
              </p>
            </details>
            <details className="group rounded-lg border p-4">
              <summary className="font-semibold cursor-pointer">
                Y a-t-il une période d'essai ?
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                Le plan Gratuit est disponible sans limite de temps. Le plan Pro
                offre un essai gratuit de 14 jours, sans carte bancaire requise.
              </p>
            </details>
            <details className="group rounded-log border p-4">
              <summary className="font-semibold cursor-pointer">
                Comment fonctionne le plan Enterprise ?
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                Le plan Enterprise est personnalisé selon vos besoins. Contactez
                notre équipe pour discuter de vos exigences et obtenir un devis
                sur mesure.
              </p>
            </details>
          </div>
        </section>
      </div>
    </div>
  );
}
