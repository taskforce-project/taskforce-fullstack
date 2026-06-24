"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { StripedPattern } from "@/components/magicui/striped-pattern";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw } from "lucide-react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: Readonly<ErrorPageProps>) {
  useEffect(() => {
    toast.error("Une erreur inattendue s'est produite", {
      description: error.message || "Essayez de recharger la page.",
      duration: 6000,
    });
  }, [error]);

  const digest = error.digest;

  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col items-center justify-center overflow-hidden">
      {/* Striped background */}
      <StripedPattern
        direction="right"
        width={32}
        height={32}
        className="text-destructive/10"
      />

      {/* Radial fade overlay */}
      <div className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,transparent_20%,hsl(var(--background))_80%)]" />

      {/* Content */}
      <div className="relative z-30 flex flex-col items-center gap-8 px-6 text-center">
        {/* Logo */}
        <div className="flex items-center gap-2 text-muted-foreground/80">
          <Image
            src="/assets/logo/logo_taskforce_tp.png"
            alt="TaskForce"
            width={20}
            height={20}
            className="h-5 w-5 object-contain"
          />
          <span className="text-sm font-medium tracking-widest uppercase">
            TaskForce
          </span>
        </div>

        {/* Error code */}
        <div className="relative select-none">
          <span className="text-[clamp(7rem,22vw,14rem)] font-black leading-none tracking-tighter text-foreground/6">
            500
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[clamp(4rem,12vw,8rem)] font-black leading-none tracking-tighter bg-linear-to-b from-destructive/80 to-destructive/30 bg-clip-text text-transparent">
              500
            </span>
          </div>
        </div>

        {/* Message */}
        <div className="flex flex-col gap-2 max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">
            Erreur inattendue
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Quelque chose s&apos;est mal passé côté serveur. Vous pouvez
            réessayer ou revenir au tableau de bord.
          </p>
          {digest && (
            <p className="text-xs text-muted-foreground/50 font-mono mt-1">
              ref: {digest}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Tableau de bord
            </Link>
          </Button>
          <Button size="sm" className="gap-2" onClick={reset}>
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
        </div>
      </div>
    </div>
  );
}
