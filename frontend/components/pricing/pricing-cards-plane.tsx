"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Check, ArrowRight } from "lucide-react";
import { pricingPlans } from "@/lib/constants/pricing-data";

interface PricingCardsPlaneProps {
  onSelectPlan: (planId: "free" | "pro" | "enterprise") => void;
  selectedPlan?: string;
  billingPeriod?: "monthly" | "yearly";
  className?: string;
}

export function PricingCardsPlane({
  onSelectPlan,
  selectedPlan,
  billingPeriod = "monthly",
  className,
}: Readonly<PricingCardsPlaneProps>) {
  return (
    <div className={cn("grid gap-6 md:grid-cols-3 w-full", className)}>
      {pricingPlans.map((plan) => {
        // Calculate price display (EXACT Plane.so logic)
        const isYearly = billingPeriod === "yearly";
        let price = null;
        if (plan.id !== "free" && plan.id !== "enterprise") {
          price = isYearly ? plan.priceYearly : plan.priceMonthly;
        }

        return (
          <Card
            key={plan.id}
            className={cn(
              "relative flex flex-col border-2 transition-colors",
              selectedPlan === plan.id
                ? "border-primary shadow-lg"
                : "border-border hover:border-muted-foreground/30"
            )}
          >
            <CardHeader className="space-y-6 pb-6">
              {/* Plan Name */}
              <h3 className="text-2xl font-bold">{plan.name}</h3>

              {/* Price - Exact Plane.so style */}
              <div className="space-y-1">
                {plan.id === "free" && (
                  <>
                    <div className="text-5xl font-bold">$0</div>
                    <p className="text-sm text-muted-foreground">
                      pour toujours
                    </p>
                  </>
                )}

                {plan.id === "pro" && (
                  <>
                    <div className="text-5xl font-bold">${price}</div>
                    <p className="text-sm text-muted-foreground">
                      par utilisateur/mois
                      {isYearly && " (facturé annuellement)"}
                    </p>
                  </>
                )}

                {plan.id === "enterprise" && (
                  <div className="text-2xl font-semibold text-muted-foreground">
                    Tarif sur demande
                  </div>
                )}
              </div>

              {/* Description */}
              {plan.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {plan.description}
                </p>
              )}
            </CardHeader>

            <CardContent className="flex-1 space-y-6">
              {/* CTA Button (Plane.so puts it at top of content) */}
              <Button
                type="button"
                className={cn(
                  "w-full group",
                  plan.id === "pro" &&
                    "bg-foreground hover:bg-foreground/90 text-background",
                  plan.id === "enterprise" &&
                    "bg-foreground hover:bg-foreground/90 text-background"
                )}
                variant={plan.id === "free" ? "outline" : "default"}
                size="lg"
                onClick={() => onSelectPlan(plan.id)}
              >
                {plan.cta}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>

              {/* Key Features */}
              {plan.highlights && plan.highlights.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Fonctionnalités clés
                  </p>
                  <ul className="space-y-3">
                    {plan.highlights.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm text-muted-foreground">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>

            {/* Limits Footer */}
            <CardFooter className="border-t pt-6">
              <div className="w-full space-y-2">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground">
                  LIMITES
                </p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">
                      {plan.limits.users}
                    </span>{" "}
                    utilisateurs
                  </div>
                  <div>
                    <span className="font-medium text-foreground">
                      {plan.limits.projects}
                    </span>{" "}
                    projets
                  </div>
                  <div>
                    <span className="font-medium text-foreground">
                      {plan.limits.storage}
                    </span>{" "}
                    de stockage
                  </div>
                </div>
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
