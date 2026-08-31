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
import { STRIPE_ROUTES } from "@/lib/config/api-routes";

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
        toast.error("Error", {
          description: "No payment session found",
        });
        return;
      }

      try {
        // Appeler l'API backend pour vérifier le paiement et créer l'utilisateur
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${STRIPE_ROUTES.VERIFY_SESSION}?session_id=${sessionId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.message || "Error while verifying the payment");
        }
        
        setVerificationStatus("success");
        
        // Rafraîchir les données utilisateur pour obtenir le nouveau plan
        refreshUser();
        
        toast.success("Payment successful!", {
          description: data.data?.message || "Your subscription has been activated successfully",
        });
      } catch (error) {
        setVerificationStatus("error");
        toast.error("Verification error", {
          description: "Unable to verify the payment. Contact support.",
        });
        console.error("Payment verification error:", error);
      } finally {
        setIsVerifying(false);
      }
    };

    verifyPayment();
  }, [sessionId, refreshUser]);

  const handleContinue = () => {
    // Upgrade in-app : l'utilisateur est déjà connecté, on le renvoie dans l'app - son forfait est
    // désormais actif (appliqué par le webhook Stripe).
    router.push("/");
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-16 w-16 text-primary animate-spin" />
              <h2 className="text-2xl font-bold">Verifying payment</h2>
              <p className="text-muted-foreground">
                Please wait while we confirm your payment...
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
            <CardTitle className="text-2xl">Verification error</CardTitle>
            <CardDescription>
              We couldn&apos;t verify your payment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Your payment may have been processed, but we can&apos;t confirm it right now.
              Please contact our support with the following session reference:
            </p>
            {sessionId && (
              <div className="p-3 bg-muted rounded-md">
                <code className="text-xs break-all">{sessionId}</code>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Button onClick={handleContinue} variant="outline" className="w-full">
                Go to login
              </Button>
              <Button
                onClick={() => router.push("/")}
                variant="ghost"
                className="w-full"
              >
                Back to TaskForce
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
          <CardTitle className="text-3xl font-bold">Payment successful!</CardTitle>
          <CardDescription className="text-base">
            Your subscription has been activated successfully
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <p className="text-sm">Immediate access to all premium features</p>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <p className="text-sm">Confirmation email sent to your address</p>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <p className="text-sm">Automatic billing each period</p>
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              You can manage your subscription at any time from your account settings.
            </p>
          </div>

          <Button onClick={handleContinue} className="w-full" size="lg">
            Start using TaskForce
          </Button>

          {sessionId && (
            <p className="text-xs text-muted-foreground text-center">
              Transaction reference: {sessionId.slice(-12)}
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
