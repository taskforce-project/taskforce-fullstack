"use client";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface PricingToggleProps {
  billingPeriod: "monthly" | "yearly";
  onToggle: (period: "monthly" | "yearly") => void;
  className?: string;
}

export function PricingToggle({
  billingPeriod,
  onToggle,
  className,
}: Readonly<PricingToggleProps>) {
  return (
    <div className={cn("flex items-center justify-center gap-3", className)}>
      <Label
        htmlFor="billing-toggle"
        className={cn(
          "text-base font-medium cursor-pointer transition-colors",
          billingPeriod === "monthly"
            ? "text-foreground"
            : "text-muted-foreground"
        )}
      >
        Mensuel
      </Label>
      <Switch
        id="billing-toggle"
        checked={billingPeriod === "yearly"}
        onCheckedChange={(checked) => onToggle(checked ? "yearly" : "monthly")}
      />
      <div className="flex items-center gap-2">
        <Label
          htmlFor="billing-toggle"
          className={cn(
            "text-base font-medium cursor-pointer transition-colors",
            billingPeriod === "yearly"
              ? "text-foreground"
              : "text-muted-foreground"
          )}
        >
          Annuel
        </Label>
        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          Économisez 14%
        </Badge>
      </div>
    </div>
  );
}
