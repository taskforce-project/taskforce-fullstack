/**
 * Page de retour de paiement Stripe (succès / erreur / vérification en cours).
 *
 * <p>Reprend la <b>direction artistique des pages d'erreur</b> de l'app (404/500) : fond
 * {@code bg-background}, motif rayé {@link StripedPattern}, fondu radial, lockup de marque et
 * jetons de couleur - au lieu du dégradé vert/rouge générique d'origine, hors charte.</p>
 */

"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle, ArrowLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

import { PaymentShell } from "@/components/payment/payment-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/contexts/auth-context";
import { stripeService } from "@/lib/api/stripe-service";

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
        toast.error("Error", { description: "No payment session found" });
        return;
      }

      try {
        // Vérifie le paiement côté serveur (via l'apiClient : base URL centralisée + enveloppe
        // ApiResponse). Le forfait est appliqué par le webhook Stripe ; cet appel le confirme et
        // couvre les environnements sans webhook. Un statut non-2xx lève et bascule sur l'écran d'erreur.
        const result = await stripeService.verifySession(sessionId);

        setVerificationStatus("success");

        // Rafraîchit les données utilisateur pour obtenir le nouveau plan
        refreshUser();

        toast.success("Payment successful!", {
          description: result.message || "Your subscription has been activated successfully",
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
      <PaymentShell tone="primary">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="flex max-w-sm flex-col gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Verifying payment</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Please wait while we confirm your payment…
            </p>
          </div>
        </div>
      </PaymentShell>
    );
  }

  if (verificationStatus === "error") {
    return (
      <PaymentShell tone="destructive">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="size-7" />
        </div>
        <div className="flex max-w-sm flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Verification error</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We couldn&apos;t verify your payment. It may still have gone through - contact our support
            with the reference below.
          </p>
          {sessionId && (
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground/50">ref: {sessionId}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back to TaskForce
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-2">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </PaymentShell>
    );
  }

  return (
    <PaymentShell tone="primary">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <CheckCircle2 className="size-7" />
      </div>
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Payment successful</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your subscription is now active. You have immediate access to every premium feature.
        </p>
      </div>

      <ul className="flex w-full flex-col gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-4 text-left">
        {[
          "Immediate access to all premium features",
          "Confirmation email sent to your address",
          "Automatic billing each period",
        ].map((perk) => (
          <li key={perk} className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 shrink-0 text-primary" />
            {perk}
          </li>
        ))}
      </ul>

      <Button onClick={handleContinue} size="lg" className="gap-2">
        Start using TaskForce
        <ArrowUpRight className="size-4" />
      </Button>

      {sessionId && (
        <p className="font-mono text-xs text-muted-foreground/50">Reference: {sessionId.slice(-12)}</p>
      )}
    </PaymentShell>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
