/**
 * Page de succès de paiement
 * Affichée après un paiement Stripe réussi
 */

"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/contexts/auth-context";

function PaymentSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const [isVerifying, setIsVerifying] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<"success" | "error" | "pending">("pending");
  
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    const verifyPayment = async () => {
      if (!sessionId) {
        setVerificationStatus("error");
        setIsVerifying(false);
        toast.error("Erreur", {
          description: "Aucune session de paiement trouvée",
        });
        return;
      }

      try {
        // TODO: Appel API pour vérifier le paiement côté backend
        // const response = await fetch(`/api/stripe/verify-session?session_id=${sessionId}`, {
        //   method: 'GET',
        //   headers: {
        //     'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        //   }
        // });
        
        // Simuler la vérification (à remplacer par l'appel API réel)
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        setVerificationStatus("success");
        
        // Rafraîchir les données utilisateur pour obtenir le nouveau plan
        refreshUser();
        
        toast.success("Paiement réussi !", {
          description: "Votre abonnement a été activé avec succès",
        });
      } catch (error) {
        setVerificationStatus("error");
        toast.error("Erreur de vérification", {
          description: "Impossible de vérifier le paiement. Contactez le support.",
        });
        console.error("Payment verification error:", error);
      } finally {
        setIsVerifying(false);
      }
    };

    verifyPayment();
  }, [sessionId, refreshUser]);

  const handleContinue = () => {
    router.push("/dashboard");
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-16 w-16 text-primary animate-spin" />
              <h2 className="text-2xl font-bold">Vérification du paiement</h2>
              <p className="text-muted-foreground">
                Veuillez patienter pendant que nous confirmons votre paiement...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (verificationStatus === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-50 to-orange-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md border-destructive">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <AlertCircle className="h-16 w-16 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Erreur de vérification</CardTitle>
            <CardDescription>
              Nous n'avons pas pu vérifier votre paiement
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Votre paiement a peut-être été traité, mais nous ne pouvons pas le confirmer actuellement.
              Veuillez contacter notre support avec la référence de session suivante :
            </p>
            {sessionId && (
              <div className="p-3 bg-muted rounded-md">
                <code className="text-xs break-all">{sessionId}</code>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Button onClick={handleContinue} variant="outline" className="w-full">
                Aller au tableau de bord
              </Button>
              <Button 
                onClick={() => router.push("/auth/register/plan")} 
                variant="ghost"
                className="w-full"
              >
                Retour à la sélection de plan
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md border-green-500">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
              <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">Paiement réussi !</CardTitle>
          <CardDescription className="text-base">
            Votre abonnement a été activé avec succès
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <p className="text-sm">Accès immédiat à toutes les fonctionnalités premium</p>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <p className="text-sm">Email de confirmation envoyé à votre adresse</p>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <p className="text-sm">Facturation automatique à chaque période</p>
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              Vous pouvez gérer votre abonnement à tout moment depuis les paramètres de votre compte.
            </p>
          </div>

          <Button onClick={handleContinue} className="w-full" size="lg">
            Commencer à utiliser TaskForce
          </Button>

          {sessionId && (
            <p className="text-xs text-muted-foreground text-center">
              Référence de transaction : {sessionId.slice(-12)}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
