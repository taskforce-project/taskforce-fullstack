"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShieldCheck,
  Award,
  Lock,
  Database,
  Activity,
  HeadphonesIcon,
} from "lucide-react";
import { trustBadges } from "@/lib/constants/pricing-data";

// Map des icônes Lucide
const iconMap = {
  ShieldCheck,
  Award,
  Lock,
  Database,
  Activity,
  HeadphonesIcon,
};

interface TrustSectionProps {
  className?: string;
}

export function TrustSection({ className }: Readonly<TrustSectionProps>) {
  return (
    <section className={cn("w-full space-y-8", className)}>
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">
          Sécurité et conformité
        </h2>
        <p className="text-muted-foreground">
          Vos données protégées selon les plus hauts standards de sécurité
        </p>
      </div>

      {/* Trust Badges Grid */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {trustBadges.map((badge) => {
          const Icon = iconMap[badge.icon as keyof typeof iconMap];
          return (
            <Card
              key={badge.id}
              className="border-2 hover:border-primary/50 transition-colors"
            >
              <CardContent className="pt-6 text-center space-y-3">
                <div className="flex justify-center">
                  <div className="p-3 rounded-full bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1">{badge.name}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {badge.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
