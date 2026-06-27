"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { StripedPattern } from "@/components/magicui/striped-pattern";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col items-center justify-center overflow-hidden">
      {/* Striped background */}
      <StripedPattern
        direction="left"
        width={32}
        height={32}
        className="text-muted-foreground/10"
      />

      {/* Radial fade overlay */}
      <div className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,transparent_20%,hsl(var(--background))_80%)]" />

      {/* Content */}
      <div className="relative z-30 flex flex-col items-center gap-8 px-6 text-center">
        {/* Logo */}
        <div className="flex items-center gap-3 text-foreground/90">
          <Image
            src="/assets/logo/logo_taskforce_tp.png"
            alt="TaskForce"
            width={44}
            height={44}
            className="h-11 w-11 object-contain"
          />
          <span className="text-lg font-semibold tracking-wide uppercase">
            TaskForce
          </span>
        </div>

        {/* Error code */}
        <div className="relative select-none">
          <span className="text-[clamp(7rem,22vw,14rem)] font-black leading-none tracking-tighter text-foreground/6">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[clamp(4rem,12vw,8rem)] font-black leading-none tracking-tighter bg-linear-to-b from-foreground to-foreground/50 bg-clip-text text-transparent">
              404
            </span>
          </div>
        </div>

        {/* Message */}
        <div className="flex flex-col gap-2 max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">
            Page introuvable
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Cette page n&apos;existe pas ou a été déplacée. Revenez au tableau
            de bord pour continuer.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
          <Button asChild size="sm" className="gap-2">
            <Link href="/dashboard">Tableau de bord</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
