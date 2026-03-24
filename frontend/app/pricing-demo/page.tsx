"use client";

import { useState } from "react";
import {
  PricingCardsEnhanced,
  ROICalculator,
  ComparisonTable,
  PricingToggle,
  DeploymentOptions,
  TestimonialsSection,
  TrustSection,
  PricingFAQ,
} from "@/components/pricing";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PricingDemoPage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<
    "free" | "pro" | "enterprise"
  >("pro");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly"
  );

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
        <section className="text-center space-y-6 max-w-3xl mx-auto">
          <h1 className="text-5xl font-extrabold tracking-tight bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Commencez gratuitement, évoluez confortablement
          </h1>
          <p className="text-xl text-muted-foreground">
            Des tarifs transparents et simples. Passez à un plan supérieur quand
            vous en avez besoin.
          </p>

          {/* Billing Toggle */}
          <div className="pt-6">
            <PricingToggle
              billingPeriod={billingPeriod}
              onToggle={setBillingPeriod}
            />
          </div>
        </section>

        {/* Pricing Cards */}
        <section id="plans">
          <PricingCardsEnhanced
            onSelectPlan={handleSelectPlan}
            selectedPlan={selectedPlan}
            showCta={true}
            billingPeriod={billingPeriod}
          />
        </section>

        {/* Deployment Options */}
        <section id="deployment">
          <DeploymentOptions />
        </section>

        {/* ROI Calculator */}
        <section id="calculator">
          <ROICalculator />
        </section>

        {/* Comparison Table */}
        <section id="comparison">
          <ComparisonTable />
        </section>

        {/* Testimonials */}
        <section id="testimonials">
          <TestimonialsSection />
        </section>

        {/* Trust & Security */}
        <section id="trust">
          <TrustSection />
        </section>

        {/* FAQ */}
        <section id="faq">
          <PricingFAQ />
        </section>
      </div>
    </div>
  );
}
