"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
} from "@/components/ui/card";
import { Check, ArrowRight } from "lucide-react";
import { pricingPlans, type PlanDetails } from "@/lib/constants/pricing-data";

interface PricingCardsEnhancedProps {
  onSelectPlan: (planId: "free" | "pro" | "enterprise") => void;
  selectedPlan?: string;
  showCta?: boolean;
  variant?: "default" | "compact";
  billingPeriod?: "monthly" | "yearly";
  deploymentType?: "cloud" | "self-hosted";
}

export function PricingCardsEnhanced({
  onSelectPlan,
  selectedPlan,
  showCta = true,
  variant = "default",
  billingPeriod = "monthly",
}: Readonly<PricingCardsEnhancedProps>) {
  return (
    <div className="grid gap-6 md:grid-cols-3 w-full">
      {pricingPlans.map((plan) => (
        <PricingCard
          key={plan.id}
          plan={plan}
          isSelected={selectedPlan === plan.id}
          onSelect={() => onSelectPlan(plan.id)}
          showCta={showCta}
          variant={variant}
          billingPeriod={billingPeriod}
        />
      ))}
    </div>
  );
}

interface PricingCardProps {
  plan: PlanDetails;
  isSelected: boolean;
  onSelect: () => void;
  showCta: boolean;
  variant: "default" | "compact";
  billingPeriod: "monthly" | "yearly";
}

function PricingCard({
  plan,
  isSelected,
  onSelect,
  showCta,
  variant,
  billingPeriod,
}: Readonly<PricingCardProps>) {
  const isCompact = variant === "compact";

  // Calcul du prix dynamique (Plane.so style)
  const getPriceDisplay = () => {
    if (plan.id === "free") {
      return (
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-bold">$0</span>
        </div>
      );
    }

    if (plan.id === "enterprise") {
      return (
        <div className="text-2xl font-semibold text-muted-foreground">
          Tarif sur demande
        </div>
      );
    }

    // Pro plan - responsive au billing period
    const price =
      billingPeriod === "yearly" ? plan.priceYearly : plan.priceMonthly;
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-bold">${price}</span>
      </div>
    );
  };

  const getPriceDetail = () => {
    if (plan.id === "free") return "pour toujours";
    if (plan.id === "enterprise") return "";
    return billingPeriod === "yearly"
      ? "par utilisateur/mois (facturé annuellement)"
      : "par utilisateur/mois";
  };

  return (
    <Card
      className={cn(
        "relative flex flex-col",
        "border-2 transition-all duration-200",
        isSelected && "border-primary shadow-lg",
        !isSelected && "border-border hover:border-muted-foreground/20",
      )}
    >
      <CardHeader className="space-y-6 pb-6">
        {/* Plan Name */}
        <div>
          <h3 className="text-2xl font-bold">{plan.name}</h3>
        </div>

        {/* Price */}
        <div className="space-y-1">
          {getPriceDisplay()}
          {getPriceDetail() && (
            <p className="text-sm text-muted-foreground">{getPriceDetail()}</p>
          )}
        </div>

        {/* Description */}
        {plan.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {plan.description}
          </p>
        )}
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {/* CTA Button on top (Plane.so style) */}
        {showCta && (
          <Button
            type="button"
            className={cn(
              "w-full group",
              plan.id === "pro" && "bg-primary hover:bg-primary/90",
              plan.id === "free" && "",
              plan.id === "enterprise" &&
                "bg-foreground hover:bg-foreground/90",
            )}
            variant={plan.id === "free" ? "outline" : "default"}
            size="lg"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            {plan.cta}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        )}

        {/* Key Features avec icône */}
        {!isCompact && plan.highlights && (
          <div className="space-y-3 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fonctionnalités clés
            </p>
            <ul className="space-y-3">
              {plan.highlights.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground leading-relaxed">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      {/* Limits at bottom (Plane.so shows this subtly) */}
      {!isCompact && (
        <CardFooter className="border-t pt-6">
          <div className="w-full space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Limites
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>
                <span className="font-medium">{plan.limits.users}</span>{" "}
                utilisateurs
              </div>
              <div>
                <span className="font-medium">{plan.limits.projects}</span>{" "}
                projets
              </div>
              <div className="col-span-2">
                <span className="font-medium">{plan.limits.storage}</span> de
                stockage
              </div>
            </div>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}


