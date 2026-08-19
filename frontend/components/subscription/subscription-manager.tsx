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
  BASIC: Sparkles,
  BUSINESS: Crown,
  ENTERPRISE: Building2,
};

const PLAN_COLORS = {
  FREE: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
  BASIC: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  BUSINESS: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
  ENTERPRISE: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
};

export function SubscriptionManager() {
  const { refreshUser } = useAuth();
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
      toast.error("Error", {
        description: "Unable to load subscription information",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async (plan: "BASIC" | "BUSINESS") => {
    try {
      const { checkoutUrl } = await stripeService.createCheckoutSession(plan);
      window.location.href = checkoutUrl;
    } catch (error) {
      toast.error("Error", {
        description: "Unable to create payment session",
      });
      console.error("Upgrade error:", error);
    }
  };

  const handleCancel = async (immediately: boolean = false) => {
    try {
      setIsCancelling(true);
      await stripeService.cancelSubscription(immediately);
      
      toast.success("Subscription cancelled", {
        description: immediately 
          ? "Your subscription has been cancelled immediately"
          : "Your subscription will be cancelled at the end of the current period",
      });
      
      // Rafraîchir les données
      await loadSubscription();
      refreshUser();
    } catch (error) {
      toast.error("Error", {
        description: "Unable to cancel subscription",
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
            <CardTitle>Error</CardTitle>
          </div>
          <CardDescription>
            Unable to load subscription information
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={loadSubscription} variant="outline">
            Retry
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
              Manage your subscription and billing options
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
            <span className="text-muted-foreground">/month</span>
          </div>
        )}

        {subscription.currentPeriodEnd && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Next billing</p>
            <p className="text-sm text-muted-foreground">
              {new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US", {
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
              Your subscription will be cancelled at the end of the current period
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        {subscription.planType === "FREE" && (
          <>
            <Button onClick={() => handleUpgrade("BASIC")} variant="outline" className="flex-1">
              Upgrade to Basic
            </Button>
            <Button onClick={() => handleUpgrade("BUSINESS")} className="flex-1">
              Upgrade to Business
            </Button>
          </>
        )}

        {(subscription.planType === "BASIC" || subscription.planType === "BUSINESS") && (
          <>
            {subscription.planType === "BASIC" && (
              <Button onClick={() => handleUpgrade("BUSINESS")} className="flex-1">
                Upgrade to Business
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isCancelling} className="flex-1">
                  {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel subscription"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm cancellation</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleCancel(false)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Cancel at end of period
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
                {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel subscription"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm cancellation</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to cancel your Enterprise subscription? You will lose access to all advanced features at the end of your billing period.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCancel(false)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Cancel at end of period
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardFooter>
    </Card>
  );
}
