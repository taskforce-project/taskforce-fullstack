"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Euro } from "lucide-react";
import { pricingPlans, type PlanDetails } from "@/lib/constants/pricing-data";

interface PricingCardsEnhancedProps {
  onSelectPlan: (planId: "free" | "pro" | "enterprise") => void;
  selectedPlan?: string;
  showCta?: boolean;
  variant?: "default" | "compact";
  billingPeriod?: "monthly" | "yearly";
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

  // Calcul du prix dynamique
  const price = (() => {
    if (plan.id === "free" || plan.id === "enterprise") return plan.price;
    const amount =
      billingPeriod === "yearly" ? plan.priceYearly : plan.priceMonthly;
    return amount;
  })();

  const priceDisplay = (() => {
    if (plan.id === "free") return "Gratuit";
    if (plan.id === "enterprise") return "Sur mesure";
    return (
      <span className="flex items-center gap-1">
        {price}
        <Euro className="h-6 w-6" />
      </span>
    );
  })();

  const priceDetail = (() => {
    if (plan.id === "free" || plan.id === "enterprise") return plan.priceDetail;
    return billingPeriod === "yearly" ? "/mois (facturé annuellement)" : "/mois";
  })();

  return (
    <Card
      className={cn(
        "relative cursor-pointer transition-all duration-300",
        "hover:shadow-xl hover:scale-105",
        isSelected && "ring-2 ring-primary shadow-xl scale-105",
        plan.recommended && "border-primary border-2",
        plan.id === "pro" &&
          "bg-linear-to-br from-primary/5 via-transparent to-transparent",
      )}
      onClick={onSelect}
    >
      {/* Badge en haut */}
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <Badge
            className={cn(
              "shadow-lg",
              plan.id === "pro"
                ? "bg-primary text-primary-foreground"
                : "bg-linear-to-r from-purple-600 to-pink-600 text-white",
            )}
          >
            {plan.recommended && <Sparkles className="h-3 w-3 mr-1" />}
            {plan.badge}
          </Badge>
        </div>
      )}

      <CardHeader className="space-y-4 pb-4">
        {/* Nom et prix */}
        <div>
          <h3 className="text-2xl font-bold tracking-tight">{plan.name}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {plan.description}
          </p>
        </div>

        {/* Prix */}
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-extrabold tracking-tight">
            {priceDisplay}
          </span>
          {priceDetail && (
            <span className="text-sm text-muted-foreground">
              {priceDetail}
            </span>
          )}
        </div>

        {/* CTA Button */}
        {showCta && (
          <Button
            type="button"
            className={cn(
              "w-full",
              plan.id === "pro" && "bg-primary hover:bg-primary/90",
              plan.id === "enterprise" &&
                "bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700",
            )}
            variant={plan.id === "free" ? "outline" : "default"}
            size="lg"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            {plan.cta}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-6 pt-6 border-t">
        {/* Limites/Quotas */}
        {!isCompact && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Limites
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <LimitBadge
                label="Projets"
                value={plan.limits.projects}
                unlimited={plan.limits.projects
                  .toLowerCase()
                  .includes("illimité")}
              />
              <LimitBadge
                label="Utilisateurs"
                value={plan.limits.users}
                unlimited={plan.limits.users.toLowerCase().includes("illimité")}
              />
              <LimitBadge
                label="Stockage"
                value={plan.limits.storage}
                unlimited={plan.limits.storage
                  .toLowerCase()
                  .includes("personnalisé")}
              />
              {plan.limits.apiCalls && (
                <LimitBadge
                  label="API"
                  value={plan.limits.apiCalls}
                  unlimited={plan.limits.apiCalls
                    .toLowerCase()
                    .includes("illimité")}
                />
              )}
            </div>
          </div>
        )}

        {/* Features principales */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Fonctionnalités clés
          </h4>
          <ul className="space-y-2">
            {plan.highlights.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm leading-relaxed">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

interface LimitBadgeProps {
  label: string;
  value: string;
  unlimited?: boolean;
}

function LimitBadge({ label, value, unlimited }: Readonly<LimitBadgeProps>) {
  return (
    <div
      className={cn(
        "rounded-lg border p-2 text-center space-y-1",
        unlimited && "bg-primary/5 border-primary/20",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold", unlimited && "text-primary")}>
        {value}
      </div>
    </div>
  );
}
