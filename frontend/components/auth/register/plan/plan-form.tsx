"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { getRegisterData, setRegisterData } from "@/lib/auth/register-storage";
import { EnterpriseContactDialog } from "@/components/sales/enterprise-contact-dialog";
import { EnterpriseConfirmationDialog } from "@/components/sales/enterprise-confirmation-dialog";

/** Identifiants du catalogue. `basic` et `business` sont les deux plans payants en self-service. */
type PlanId = "free" | "basic" | "business" | "enterprise";

type Plan = {
  id: PlanId;
  name: string;
  price: string;
  description: string;
  features: string[];
  recommended?: boolean;
};

const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "0€",
    description: "Pour découvrir TaskForce",
    features: [
      "Membres illimités",
      "2 workspaces",
      "250 issues",
      "Smart Assign",
      "100k tokens IA Cortex / mois",
    ],
  },
  {
    id: "basic",
    name: "Basic",
    price: "10€ / membre",
    description: "Pour les petites équipes",
    features: [
      "5 workspaces",
      "Issues illimitées",
      "Rôles administrateur",
      "500k tokens IA Cortex / mois",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: "16€ / membre",
    description: "Pour les équipes qui livrent",
    recommended: true,
    features: [
      "Workspaces illimités",
      "Analytics avancées + burndown",
      "Décisions & workflows IA",
      "Intégration GitHub",
      "2M tokens IA Cortex / mois",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Sur devis",
    description: "Pour les grandes organisations",
    features: [
      "SSO / SAML / SCIM",
      "Audit & conformité RGPD",
      "Déploiement on-premise",
      "Support dédié & accompagnement",
      "Tokens IA Cortex illimités",
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
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("free");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userFirstName, setUserFirstName] = useState<string>("");
  const [userLastName, setUserLastName] = useState<string>("");
  
  // États pour les dialogs ENTERPRISE
  const [showEnterpriseDialog, setShowEnterpriseDialog] = useState(false);
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);

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
    setUserFirstName(registerData.firstName || "");
    setUserLastName(registerData.lastName || "");
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsLoading(true);

    try {
      // Stocker le plan dans sessionStorage
      setRegisterData({ 
        planType: selectedPlan.toUpperCase(),
      });

      toast.success("Plan sélectionné", {
        description: "Un code de vérification va être envoyé à l'étape suivante",
      });

      // Redirection vers vérification (étape 3)
      router.push("/auth/register/verification");
    } catch (error: unknown) {
      toast.error(t.common.error, {
        description: error instanceof Error ? error.message : "Erreur lors de la sélection du plan",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Callback après soumission du formulaire ENTERPRISE
  const handleEnterpriseSuccess = () => {
    setShowConfirmationDialog(true);
  };

  // Callback si l'utilisateur accepte de créer un compte FREE
  const handleAcceptFreeAccount = () => {
    setShowConfirmationDialog(false);
    setSelectedPlan("free");
    toast.success("Plan gratuit sélectionné", {
      description: "Vous pourrez tester l'outil en attendant notre retour",
    });
    // Continuer le flow d'inscription avec FREE
    setRegisterData({ planType: "FREE" });
    router.push("/auth/register/verification");
  };

  // Callback si l'utilisateur refuse
  const handleDeclineFreeAccount = () => {
    setShowConfirmationDialog(false);
    toast.success("Demande enregistrée", {
      description: "Notre équipe vous contactera sous 48h",
    });
    // Rediriger vers landing page
    router.push("/");
  };

  return (
    <div className={cn("flex flex-col gap-5 w-full", className)} {...props}>
      {/* Le fil d'étapes vit désormais dans la page (AuthStepper) : la barre de progression et le
          « Étape 2 sur 3 » qui figuraient ici faisaient doublon. Le bouton retour était en position
          absolue en haut à gauche, où il recouvrait la marque de la barre supérieure — il est
          repassé dans le flux. */}
      <div className="flex flex-col items-center text-center">
        <h1 className="auth-title">Choisissez votre plan</h1>
        <p className="auth-subtitle max-w-md text-balance">
          Vous pourrez en changer à tout moment depuis votre espace de travail.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full">
        {/* Quatre plans : trois colonnes laissaient le dernier seul sur une deuxième ligne. */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              data-testid={`plan-card-${plan.id}`}
              className={cn(
                "relative cursor-pointer transition-all hover:shadow-lg",
                selectedPlan === plan.id && "ring-2 ring-primary",
                plan.recommended && "border-primary",
              )}
              onClick={() => {
                if (plan.id === "enterprise") {
                  // Ouvrir le dialog au lieu de sélectionner directement
                  setShowEnterpriseDialog(true);
                } else {
                  setSelectedPlan(plan.id);
                }
              }}
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

      {/* Dialogs ENTERPRISE */}
      <EnterpriseContactDialog
        open={showEnterpriseDialog}
        onClose={() => setShowEnterpriseDialog(false)}
        onSuccess={handleEnterpriseSuccess}
        initialEmail={userEmail}
        initialFirstName={userFirstName}
        initialLastName={userLastName}
      />

      <EnterpriseConfirmationDialog
        open={showConfirmationDialog}
        onClose={() => setShowConfirmationDialog(false)}
        onAccept={handleAcceptFreeAccount}
        onDecline={handleDeclineFreeAccount}
      />
    </div>
  );
}
