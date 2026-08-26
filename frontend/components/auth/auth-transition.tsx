"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Écran de transition premium pendant la finalisation d'une connexion externe (GitHub / Google).
 *
 * Deux phases : « authenticating » — anneau dégradé rotatif + halo pulsé autour du logo, et des
 * jalons qui se cochent un à un — puis « success » — le logo devient une coche verte (spring) et,
 * si le prénom est connu, un « Welcome back, … ». Fond « aurora » (nappes floues qui dérivent),
 * entièrement en Framer Motion + Tailwind : aucun script/CDN tiers (la CSP de prod les interdit).
 *
 * Le but n'est pas décoratif : la connexion sociale aboutit parfois en une fraction de seconde, et
 * un changement d'écran instantané donne l'impression que « rien ne s'est passé ». Les jalons + le
 * temps minimum d'affichage (imposé par l'appelant) laissent la personne VOIR qu'elle se connecte.
 */
const STEPS = ["Verifying your identity", "Loading your workspace", "Setting things up"] as const;

export function AuthTransition({
  phase,
  title,
  subtitle,
  userName,
}: {
  phase: "authenticating" | "success";
  title: string;
  subtitle: string;
  /** Prénom / nom affiché, récupéré à l'échange OAuth → « Welcome back, … » à la réussite. */
  userName?: string | null;
}) {
  const success = phase === "success";
  const [activeStep, setActiveStep] = useState(0);

  // Défilement des jalons pendant l'authentification (visuel : le vrai échange est rapide). À la
  // réussite, tout passe coché d'un coup.
  useEffect(() => {
    // À la réussite : pas de setState ici — l'effet s'arrête et le rendu marque tout coché via
    // `|| success`. Sinon, on avance un jalon toutes les ~0,5 s (purement visuel).
    if (success) return;
    const id = setInterval(() => {
      setActiveStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, 560);
    return () => clearInterval(id);
  }, [success]);

  return (
    <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border/60 bg-card/70 px-8 py-10 text-center shadow-xl backdrop-blur-xl">
      <AuroraBackdrop success={success} />

      <div className="relative z-10 flex flex-col items-center">
        {/* Logo + anneau */}
        <div className="relative flex h-20 w-20 items-center justify-center">
          {/* Halo pulsé (auth) */}
          {!success &&
            [0, 0.6, 1.2].map((delay) => (
              <motion.span
                key={delay}
                className="absolute inset-1 rounded-[1.3rem] border border-blue-400/40"
                initial={{ scale: 0.8, opacity: 0.45 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 1.8, repeat: Infinity, delay, ease: "easeOut" }}
              />
            ))}

          {/* Anneau dégradé rotatif (auth) */}
          {!success && (
            <motion.div
              className="absolute inset-0 rounded-[1.4rem]"
              style={{ background: "conic-gradient(from 0deg, #6366f1, #8b5cf6, #ec4899, #f59e0b, #6366f1)" }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "linear" }}
            />
          )}

          {/* Tuile centrale */}
          <motion.div
            className={cn(
              "absolute inset-[3px] flex items-center justify-center rounded-[1.25rem] transition-colors",
              success ? "bg-emerald-600" : "bg-background",
            )}
            animate={success ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={{ duration: 0.45 }}
          >
            <AnimatePresence mode="wait">
              {success ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 15 }}
                >
                  <Check className="h-8 w-8 text-white" strokeWidth={3} />
                </motion.span>
              ) : (
                <motion.span key="logo" exit={{ opacity: 0 }}>
                  <Image
                    src="/assets/logo/logo_taskforce_tp.png"
                    alt=""
                    width={40}
                    height={28}
                    priority
                    className="h-6 w-auto dark:invert"
                  />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Titre / sous-titre */}
        <motion.h1
          key={success ? "title-success" : "title-auth"}
          className="auth-title mt-6"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {success && userName ? `Welcome back, ${userName}` : title}
        </motion.h1>
        <motion.p
          key={success ? "sub-success" : "sub-auth"}
          className="auth-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          {subtitle}
        </motion.p>

        {/* Jalons */}
        <ul className="mt-6 flex w-full flex-col gap-2 text-left">
          {STEPS.map((label, i) => {
            const done = i < activeStep || success;
            const current = i === activeStep && !success;
            return (
              <li key={label} className="flex items-center gap-2.5 text-sm">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : current
                        ? "border-blue-400 text-blue-400"
                        : "border-border",
                  )}
                >
                  {done ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : current ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                  )}
                </span>
                <span className={cn("transition-colors", done || current ? "text-foreground" : "text-muted-foreground/60")}>
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Fond « aurora » : nappes de couleur floues qui dérivent lentement, clippées par le panneau. */
function AuroraBackdrop({ success }: { readonly success: boolean }) {
  const blobs = [
    { color: "rgba(99,102,241,0.45)", cls: "-left-10 -top-10 h-40 w-40" },
    { color: "rgba(236,72,153,0.40)", cls: "-right-12 top-6 h-44 w-44" },
    { color: success ? "rgba(16,185,129,0.45)" : "rgba(59,130,246,0.40)", cls: "-bottom-10 left-10 h-44 w-44" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-0 opacity-70">
      {blobs.map((b, i) => (
        <motion.div
          key={b.cls}
          className={cn("absolute rounded-full blur-3xl", b.cls)}
          style={{ background: b.color }}
          animate={{ x: [0, 12, -8, 0], y: [0, -10, 8, 0], scale: [1, 1.15, 0.95, 1] }}
          transition={{ duration: 9 + i * 2, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
