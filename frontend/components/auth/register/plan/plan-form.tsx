"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { getRegisterData, setRegisterData } from "@/lib/auth/register-storage";

type Plan = {
  id: string;
  name: string;
  price: string;
  description: string;
  features: string[];
  recommended?: boolean;
};

const plans: Plan[] = [
  {
    id: "free",
    name: "Gratuit",
    price: "0€",
    description: "Parfait pour démarrer",
    recommended: true,
    features: [
      "5 projets maximum",
      "10 membres par projet",
      "Support communautaire",
      "Fonctionnalités de base",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "29€",
    description: "Pour les équipes en croissance",
    features: [
      "Projets illimités",
      "50 membres par projet",
      "Support prioritaire",
      "Fonctionnalités avancées",
      "Intégrations tierces",
      "Rapports personnalisés",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Sur devis",
    description: "Pour les grandes organisations",
    features: [
      "Tout du plan Pro",
      "Membres illimités",
      "Support dédié 24/7",
      "SLA garanti",
      "Personnalisation complète",
      "Formation sur mesure",
    ],
  },
];

export function RegisterPlanForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const { t } = usePreferencesStore();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<
    "free" | "pro" | "enterprise"
  >("free");
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    // Récupérer les données de la première étape
    const registerData = getRegisterData();
    if (!registerData) {
      toast.error("Session expirée", {
        description: "Veuillez recommencer le processus d'inscription",
      });
      router.push("/auth/register");
      return;
    }

    setUserEmail(registerData.email);
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Stocker le plan sélectionné dans sessionStorage uniquement
      // L'API sera appelée à l'étape 3 avec toutes les données
      setRegisterData({ planType: selectedPlan.toUpperCase() });

      toast.success("Plan sélectionné", {
        description: "Un code de vérification va être envoyé à l'étape suivante",
      });

      // Redirection vers vérification (étape 3)
      router.push("/auth/register/verification");
    } catch (error: any) {
      toast.error(t.common.error, {
        description: error.message || "Erreur lors de la sélection du plan",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6 w-full", className)} {...props}>
      {/* Progress indicator */}
      <div className="w-full space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Étape 2 sur 3</span>
          <span>66%</span>
        </div>
        <Progress value={66} />
      </div>

      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl font-bold">Choisissez votre plan</h1>
        <p className="text-balance text-muted-foreground">
          Étape 2 sur 3 : Sélectionnez le plan qui vous convient
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Vous pourrez changer de plan à tout moment depuis votre dashboard
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full">
        <div className="grid gap-6 md:grid-cols-3 mb-6">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={cn(
                "relative cursor-pointer transition-all hover:shadow-lg",
                selectedPlan === plan.id && "ring-2 ring-primary",
                plan.recommended && "border-primary",
              )}
              onClick={() =>
                setSelectedPlan(plan.id as "free" | "pro" | "enterprise")
              }
            >
              {plan.recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    Recommandé
                  </Badge>
                </div>
              )}

              <CardContent className="p-6">
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    {plan.id !== "enterprise" && (
                      <span className="text-muted-foreground">/mois</span>
                    )}
                  </div>

                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-between items-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/auth/register")}
            disabled={isLoading}
          >
            Retour
          </Button>

          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Chargement..." : "Continuer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
