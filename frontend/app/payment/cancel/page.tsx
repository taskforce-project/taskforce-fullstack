/**
 * Page d'annulation de paiement
 * Affichée quand l'utilisateur annule le paiement Stripe
 */

"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, ArrowLeft, HelpCircle } from "lucide-react";
import Link from "next/link";

export default function PaymentCancelPage() {
  const router = useRouter();

  const handleRetry = () => {
    router.push("/auth/register/plan");
  };

  const handleContinueFree = () => {
    router.push("/auth/register/verification");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-50 to-yellow-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md border-orange-300">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-orange-100 dark:bg-orange-900 p-3">
              <XCircle className="h-16 w-16 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Paiement annulé</CardTitle>
          <CardDescription className="text-base">
            Vous avez annulé le processus de paiement
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Ne vous inquiétez pas ! Vous pouvez toujours :
            </p>

            <div className="space-y-2">
              <Button onClick={handleRetry} className="w-full" size="lg">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Réessayer le paiement
              </Button>

              <Button 
                onClick={handleContinueFree} 
                variant="outline" 
                className="w-full"
                size="lg"
              >
                Continuer avec le plan gratuit
              </Button>
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-start gap-3">
              <HelpCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Besoin d'aide ?</p>
                <p className="text-xs text-muted-foreground">
                  Si vous rencontrez des difficultés avec le paiement, notre équipe support est disponible pour vous aider.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <p className="text-xs font-medium text-center">Pourquoi choisir un plan premium ?</p>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>Projets illimités et fonctionnalités avancées</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>Support prioritaire et assistance dédiée</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>Intégrations tierces et rapports personnalisés</span>
              </li>
            </ul>
          </div>

          <div className="flex justify-center gap-4 text-xs text-muted-foreground pt-4 border-t">
            <Link href="/legal-notices" className="hover:underline">
              Conditions d'utilisation
            </Link>
            <span>•</span>
            <Link href="/privacy-policy" className="hover:underline">
              Politique de confidentialité
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
