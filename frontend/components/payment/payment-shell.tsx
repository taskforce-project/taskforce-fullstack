"use client";

import Image from "next/image";

import { StripedPattern } from "@/components/magicui/striped-pattern";

/**
 * Coquille commune aux pages de retour de paiement (succès / erreur / annulation).
 *
 * <p>Reprend la <b>direction artistique des pages d'erreur</b> de l'app ({@code not-found.tsx} /
 * {@code error.tsx}) - fond {@code bg-background}, motif rayé {@link StripedPattern} teinté selon le
 * ton, fondu radial, lockup de marque et contenu centré - à la place des dégradés génériques
 * (vert/rouge/orange) qui juraient avec la charte.</p>
 */
export function PaymentShell({
  tone,
  children,
}: {
  readonly tone: "primary" | "destructive" | "muted";
  readonly children: React.ReactNode;
}) {
  const stripe =
    tone === "destructive"
      ? "text-destructive/10"
      : tone === "muted"
        ? "text-muted-foreground/10"
        : "text-primary/10";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background text-foreground">
      <StripedPattern
        direction={tone === "destructive" ? "right" : "left"}
        width={32}
        height={32}
        className={stripe}
      />
      {/* Fondu radial : la matière s'efface vers les bords (identique aux pages d'erreur). */}
      <div className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,transparent_20%,hsl(var(--background))_80%)]" />

      <div className="relative z-30 flex w-full max-w-md flex-col items-center gap-8 px-6 text-center">
        <div className="flex items-center gap-3 text-foreground/90">
          <Image
            src="/assets/logo/logo_taskforce_tp.png"
            alt="TaskForce"
            width={44}
            height={44}
            priority
            className="h-11 w-11 object-contain dark:invert"
          />
          <span className="text-lg font-semibold uppercase tracking-wide">TaskForce</span>
        </div>
        {children}
      </div>
    </div>
  );
}
