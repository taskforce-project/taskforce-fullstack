/**
 * Page d'annulation de paiement Stripe.
 *
 * <p>Reprend la direction artistique des pages d'erreur via {@link PaymentShell} (ton neutre : une
 * annulation n'est pas une erreur). Aucun débit n'a eu lieu ; l'upgrade reste possible depuis
 * Réglages → Facturation.</p>
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { XCircle, ArrowLeft } from "lucide-react";

import { PaymentShell } from "@/components/payment/payment-shell";
import { Button } from "@/components/ui/button";

export default function PaymentCancelPage() {
  const router = useRouter();

  // Upgrade in-app annulé : l'utilisateur est connecté et garde son forfait courant. On le ramène
  // simplement dans l'app (il pourra réessayer depuis Réglages → Facturation).
  const handleBack = () => {
    router.push("/");
  };

  return (
    <PaymentShell tone="muted">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <XCircle className="size-7" />
      </div>

      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Payment cancelled</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          No charge was made and you keep your current plan. You can upgrade anytime from
          Settings → Billing.
        </p>
      </div>

      <ul className="flex w-full flex-col gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-4 text-left">
        {[
          "Unlimited projects and advanced features",
          "Priority support and dedicated assistance",
          "Third-party integrations and custom reports",
        ].map((perk) => (
          <li key={perk} className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="text-primary">✓</span>
            {perk}
          </li>
        ))}
      </ul>

      <Button onClick={handleBack} size="lg" className="gap-2">
        <ArrowLeft className="size-4" />
        Back to TaskForce
      </Button>

      <div className="flex justify-center gap-4 text-xs text-muted-foreground/70">
        <Link href="/legal-notices" className="hover:text-foreground hover:underline">
          Terms of use
        </Link>
        <span>•</span>
        <Link href="/privacy-policy" className="hover:text-foreground hover:underline">
          Privacy policy
        </Link>
      </div>
    </PaymentShell>
  );
}
