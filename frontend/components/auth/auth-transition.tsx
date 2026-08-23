"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Écran de transition premium pendant la finalisation d'une connexion externe (GitHub / Google).
 *
 * Deux phases : « authenticating » — anneaux qui pulsent autour du logo — puis « success » — le logo
 * se change en coche verte qui ressort (spring). Animé avec **Framer Motion**, sans aucune dépendance
 * ni fichier d'animation externe : la CSP de production interdit les scripts/CDN tiers.
 *
 * Le but n'est pas décoratif : la connexion sociale peut aboutir en une fraction de seconde, et un
 * changement d'écran instantané donne l'impression que « rien ne s'est passé ». Un court temps
 * d'affichage minimum (imposé par l'appelant) laisse la personne VOIR qu'elle est bien en train
 * d'être connectée.
 */
export function AuthTransition({
  phase,
  title,
  subtitle,
}: {
  phase: "authenticating" | "success";
  title: string;
  subtitle: string;
}) {
  return (
    <div className="auth-panel flex flex-col items-center justify-center py-10 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        {phase === "authenticating" &&
          [0, 0.5, 1].map((delay) => (
            <motion.span
              key={delay}
              className="absolute inset-0 rounded-full border border-blue-400/50"
              initial={{ scale: 0.7, opacity: 0.5 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={{ duration: 1.6, repeat: Infinity, delay, ease: "easeOut" }}
            />
          ))}

        <motion.div
          className={cn(
            "relative flex h-14 w-14 items-center justify-center rounded-2xl transition-colors",
            phase === "success" ? "bg-green-600" : "bg-blue-50 dark:bg-blue-950/40",
          )}
          animate={phase === "success" ? { scale: [1, 1.12, 1] } : { scale: 1 }}
          transition={{ duration: 0.45 }}
        >
          {phase === "success" ? (
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 16 }}
            >
              <Check className="h-7 w-7 text-white" strokeWidth={3} />
            </motion.span>
          ) : (
            <Image
              src="/assets/logo/logo_taskforce_tp.png"
              alt=""
              width={40}
              height={28}
              priority
              className="h-6 w-auto dark:invert"
            />
          )}
        </motion.div>
      </div>

      <motion.h1
        key={title}
        className="auth-title mt-6"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {title}
      </motion.h1>
      <motion.p
        key={subtitle}
        className="auth-subtitle"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        {subtitle}
      </motion.p>
    </div>
  );
}
