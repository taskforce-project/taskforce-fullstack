"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { getRegisterData, setRegisterData } from "@/lib/auth/register-storage";
import { EnterpriseContactDialog } from "@/components/sales/enterprise-contact-dialog";
import { EnterpriseConfirmationDialog } from "@/components/sales/enterprise-confirmation-dialog";
import { PricingCardsEnhanced } from "@/components/pricing/pricing-cards-enhanced";
import { ComparisonTable } from "@/components/pricing/comparison-table";
import { ROICalculator } from "@/components/pricing/roi-calculator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, Calculator, Table } from "lucide-react";

interface RegisterPlanFormEnhancedProps {
  className?: string;
  showComparison?: boolean;
  showCalculator?: boolean;
}

export function RegisterPlanFormEnhanced({
  className,
  showComparison = true,
  showCalculator = true,
  ...props
}: RegisterPlanFormEnhancedProps &
  Omit<React.ComponentProps<"div">, keyof RegisterPlanFormEnhancedProps>) {
  const router = useRouter();
  const { t } = usePreferencesStore();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<
    "free" | "pro" | "enterprise"
  >("free");
  const [userEmail, setUserEmail] = useState<string>("");

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
        description:
          "Un code de vérification va être envoyé à l'étape suivante",
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

  // Callback pour la sélection de plan
  const handleSelectPlan = (planId: "free" | "pro" | "enterprise") => {
    if (planId === "enterprise") {
      // Ouvrir le dialog ENTERPRISE
      setShowEnterpriseDialog(true);
    } else {
      setSelectedPlan(planId);
      toast.success(`Plan ${planId === "free" ? "Gratuit" : "Pro"} sélectionné`);
    }
  };

  // Callback après soumission du formulaire ENTERPRISE
  const handleEnterpriseSuccess = (email: string) => {
    setShowEnterpriseDialog(false);
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
    <div className={cn("flex flex-col gap-6 w-full max-w-7xl mx-auto", className)} {...props}>
      {/* Bouton retour en haut à gauche */}
      <div className="absolute top-4 left-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push("/auth/register")}
          disabled={isLoading}
          className="gap-2"
        >
          ← Retour
        </Button>
      </div>

      {/* Progress indicator */}
      <div className="w-full space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Étape 2 sur 3</span>
          <span>66%</span>
        </div>
        <Progress value={66} />
      </div>

      {/* Header */}
      <div className="flex flex-col items-center text-center">
        <h1 className="text-3xl font-bold">Choisissez votre plan</h1>
        <p className="text-balance text-muted-foreground mt-2">
          Sélectionnez le plan qui correspond à vos besoins
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Vous pourrez changer de plan à tout moment depuis votre dashboard
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-8">
        {/* Tabs pour organiser le contenu */}
        <Tabs defaultValue="plans" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3">
            <TabsTrigger value="plans" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Plans
            </TabsTrigger>
            {showCalculator && (
              <TabsTrigger value="calculator" className="gap-2">
                <Calculator className="h-4 w-4" />
                Économies
              </TabsTrigger>
            )}
            {showComparison && (
              <TabsTrigger value="comparison" className="gap-2">
                <Table className="h-4 w-4" />
                Comparaison
              </TabsTrigger>
            )}
          </TabsList>

          {/* Tab: Plans */}
          <TabsContent value="plans" className="space-y-6 mt-8">
            <PricingCardsEnhanced
              onSelectPlan={handleSelectPlan}
              selectedPlan={selectedPlan}
              showCta={false}
            />
          </TabsContent>

          {/* Tab: Calculator */}
          {showCalculator && (
            <TabsContent value="calculator" className="mt-8">
              <ROICalculator />
            </TabsContent>
          )}

          {/* Tab: Comparison */}
          {showComparison && (
            <TabsContent value="comparison" className="mt-8">
              <ComparisonTable />
            </TabsContent>
          )}
        </Tabs>

        {/* Navigation buttons */}
        <div className="flex justify-between items-center pt-6 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/auth/register")}
            disabled={isLoading}
          >
            ← Retour
          </Button>
          <Button type="submit" disabled={isLoading} size="lg">
            {isLoading ? "Chargement..." : "Continuer →"}
          </Button>
        </div>
      </form>

      {/* Dialogs ENTERPRISE */}
      <EnterpriseContactDialog
        open={showEnterpriseDialog}
        onClose={() => setShowEnterpriseDialog(false)}
        onSuccess={handleEnterpriseSuccess}
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
