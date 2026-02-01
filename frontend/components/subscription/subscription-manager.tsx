/**
 * Composant de gestion d'abonnement
 * Affiche les informations d'abonnement et permet de gérer le plan
 */

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Crown, Sparkles, Building2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { stripeService, type SubscriptionInfo } from "@/lib/api/stripe-service";
import { useAuth } from "@/lib/contexts/auth-context";

const PLAN_ICONS = {
  FREE: Sparkles,
  PRO: Crown,
  ENTERPRISE: Building2,
};

const PLAN_COLORS = {
  FREE: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
  PRO: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
  ENTERPRISE: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
};

export function SubscriptionManager() {
  const { user, refreshUser } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      setIsLoading(true);
      const data = await stripeService.getSubscriptionInfo();
      setSubscription(data);
    } catch (error) {
      console.error("Error loading subscription:", error);
      toast.error("Erreur", {
        description: "Impossible de charger les informations d'abonnement",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async (plan: "PRO" | "ENTERPRISE") => {
    try {
      const { checkoutUrl } = await stripeService.createCheckoutSession(plan);
      window.location.href = checkoutUrl;
    } catch (error) {
      toast.error("Erreur", {
        description: "Impossible de créer la session de paiement",
      });
      console.error("Upgrade error:", error);
    }
  };

  const handleCancel = async (immediately: boolean = false) => {
    try {
      setIsCancelling(true);
      await stripeService.cancelSubscription(immediately);
      
      toast.success("Abonnement annulé", {
        description: immediately 
          ? "Votre abonnement a été annulé immédiatement"
          : "Votre abonnement sera annulé à la fin de la période en cours",
      });
      
      // Rafraîchir les données
      await loadSubscription();
      refreshUser();
    } catch (error) {
      toast.error("Erreur", {
        description: "Impossible d'annuler l'abonnement",
      });
      console.error("Cancel error:", error);
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!subscription) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle>Erreur</CardTitle>
          </div>
          <CardDescription>
            Impossible de charger les informations d'abonnement
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={loadSubscription} variant="outline">
            Réessayer
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const PlanIcon = PLAN_ICONS[subscription.planType];
  const planColor = PLAN_COLORS[subscription.planType];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <PlanIcon className="h-5 w-5" />
              Plan {subscription.planType}
            </CardTitle>
            <CardDescription>
              Gérez votre abonnement et vos options de facturation
            </CardDescription>
          </div>
          <Badge className={planColor} variant="secondary">
            {subscription.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {subscription.planType !== "FREE" && subscription.amount && (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">
              {subscription.amount} {subscription.currency?.toUpperCase()}
            </span>
            <span className="text-muted-foreground">/mois</span>
          </div>
        )}

        {subscription.currentPeriodEnd && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Prochaine facturation</p>
            <p className="text-sm text-muted-foreground">
              {new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        )}

        {subscription.cancelAtPeriodEnd && (
          <div className="p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-md">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              Votre abonnement sera annulé à la fin de la période en cours
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        {subscription.planType === "FREE" && (
          <>
            <Button onClick={() => handleUpgrade("PRO")} className="flex-1">
              Passer à Pro
            </Button>
            <Button onClick={() => handleUpgrade("ENTERPRISE")} variant="outline" className="flex-1">
              Passer à Enterprise
            </Button>
          </>
        )}

        {subscription.planType === "PRO" && (
          <>
            <Button onClick={() => handleUpgrade("ENTERPRISE")} className="flex-1">
              Passer à Enterprise
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isCancelling} className="flex-1">
                  {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Annuler l'abonnement"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmer l'annulation</AlertDialogTitle>
                  <AlertDialogDescription>
                    Êtes-vous sûr de vouloir annuler votre abonnement ? Vous perdrez l'accès aux fonctionnalités premium à la fin de votre période de facturation.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Conserver l'abonnement</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleCancel(false)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Annuler à la fin de la période
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}

        {subscription.planType === "ENTERPRISE" && !subscription.cancelAtPeriodEnd && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isCancelling} className="w-full">
                {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Annuler l'abonnement"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmer l'annulation</AlertDialogTitle>
                <AlertDialogDescription>
                  Êtes-vous sûr de vouloir annuler votre abonnement Enterprise ? Vous perdrez l'accès à toutes les fonctionnalités avancées à la fin de votre période de facturation.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Conserver l'abonnement</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCancel(false)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Annuler à la fin de la période
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardFooter>
    </Card>
  );
}
