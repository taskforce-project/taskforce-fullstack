"use client";

import { useState } from "react";
import {
  ROICalculator,
  ComparisonTable,
  DeploymentOptions,
  TestimonialsSection,
  TrustSection,
  PricingFAQ,
} from "@/components/pricing";
import { PricingCardsPlane } from "@/components/pricing/pricing-cards-plane";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function PricingDemoPage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<
    "free" | "pro" | "enterprise"
  >("pro");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const [deploymentType, setDeploymentType] = useState<"cloud" | "self-hosted">(
    "cloud",
  );

  const handleSelectPlan = (planId: "free" | "pro" | "enterprise") => {
    setSelectedPlan(planId);
    console.log("Plan sélectionné:", planId);
  };

  return (
    <div className="min-h-screen bg-background">
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

      <div className="container mx-auto px-4 py-12 space-y-16">
        {/* Hero Section - Exact copy of Plane.so */}
        <section className="text-center space-y-8 max-w-4xl mx-auto">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              Commencez gratuitement, <br />
              évoluez confortablement
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Conçu pour les équipes modernes, chacun de nos plans débloque bien
              plus que les alternatives disponibles. Voyez par vous-même.
            </p>
          </div>

          {/* Double Toggle - Cloud/Self-hosted + Monthly/Yearly */}
          <div className="flex flex-col items-center gap-4">
            {/* Cloud/Self-hosted Toggle */}
            <Tabs
              value={deploymentType}
              onValueChange={(value) =>
                setDeploymentType(value as "cloud" | "self-hosted")
              }
              className="w-fit"
            >
              <TabsList className="bg-muted">
                <TabsTrigger value="cloud">Cloud</TabsTrigger>
                <TabsTrigger value="self-hosted">Auto-hébergé</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Monthly/Yearly Toggle */}
            <div className="flex items-center gap-3">
              <Tabs
                value={billingPeriod}
                onValueChange={(value) =>
                  setBillingPeriod(value as "monthly" | "yearly")
                }
                className="w-fit"
              >
                <TabsList className="bg-muted">
                  <TabsTrigger value="monthly">Mensuel</TabsTrigger>
                  <TabsTrigger value="yearly" className="relative">
                    Annuel
                    <Badge
                      variant="secondary"
                      className="ml-2 bg-green-500/10 text-green-600 border-green-500/20 text-xs"
                    >
                      -14%
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </section>

        {/* Pricing Cards - Exact Plane.so layout */}
        <section id="plans" className="max-w-7xl mx-auto">
          <PricingCardsPlane
            onSelectPlan={handleSelectPlan}
            selectedPlan={selectedPlan}
            billingPeriod={billingPeriod}
          />
        </section>

        {/* Deployment Options - "Run Plane your way" section */}
        <section id="deployment" className="max-w-7xl mx-auto">
          <DeploymentOptions />
        </section>

        {/* ROI Calculator - "Slash your bills" */}
        <section id="calculator" className="max-w-7xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">
              Réduisez vos factures de plus de 70%
            </h2>
            <p className="text-muted-foreground">
              Nous avons fait le calcul pour vous.
            </p>
          </div>
          <ROICalculator />
        </section>

        {/* Comparison Table - "Features that unlock" */}
        <section id="comparison" className="max-w-7xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">
              Fonctionnalités qui se débloquent quand vous en avez besoin
            </h2>
          </div>
          <ComparisonTable />
        </section>

        {/* Testimonials - "Chosen by ambitious teams" */}
        <section id="testimonials" className="max-w-7xl mx-auto">
          <TestimonialsSection />
        </section>

        {/* Trust & Security - Certifications */}
        <section id="trust" className="max-w-7xl mx-auto">
          <TrustSection />
        </section>

        {/* FAQ */}
        <section id="faq" className="max-w-4xl mx-auto">
          <PricingFAQ />
        </section>
      </div>
    </div>
  );
}
