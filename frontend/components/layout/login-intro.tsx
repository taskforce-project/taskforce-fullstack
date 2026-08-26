"use client"

import { motion } from "framer-motion"
import Image from "next/image"

/**
 * Intro de connexion « façon ElevenLabs » : le logo TaskForce s'illumine, une **vague (blow-up)**
 * jaillit et **ouvre l'app** — pendant que le dashboard charge <b>dessous</b> (l'intro est un overlay,
 * pas un écran isolé avant une navigation). Pas de loader, pas de coupure : la dissolution révèle
 * l'app déjà montée.
 *
 * Deux temps, de part et d'autre du rechargement post-OAuth (le rechargement dur reconstruit les
 * stores Zustand) — la frame de jointure (logo illuminé sur le fond de l'app) est identique des deux
 * côtés, donc le rechargement est **invisible** :
 * - `hold`   : sur `/auth/callback` pendant l'échange du code — le logo apparaît et s'illumine, en boucle douce.
 * - `reveal` : monté par l'`AppShell` juste après connexion — vague + dissolution/zoom qui révèle l'app, puis {@link onDone}.
 *
 * Fond = `--background` (blanc en clair, sombre en sombre) : la dissolution se fond dans l'app, aucun flash.
 */
export function LoginIntro({
  phase,
  onDone,
}: {
  readonly phase: "hold" | "reveal"
  readonly onDone?: () => void
}) {
  const reveal = phase === "reveal"

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
      style={{ transformOrigin: "center" }}
      initial={{ opacity: 1, scale: 1 }}
      animate={reveal ? { opacity: [1, 1, 1, 0], scale: [1, 1.01, 1.03, 1.09] } : { opacity: 1 }}
      transition={reveal ? { duration: 2.8, times: [0, 0.35, 0.7, 1], ease: [0.4, 0, 0.2, 1] } : { duration: 0 }}
      onAnimationComplete={() => { if (reveal) onDone?.() }}
      aria-hidden="true"
    >
      {/* Halo — la lumière qui « allume » le logo, puis bloom pendant le reveal */}
      <motion.div
        className="pointer-events-none absolute h-[46vmin] w-[46vmin] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(99,102,241,0.18), rgba(99,102,241,0) 68%)" }}
        initial={{ opacity: reveal ? 0.75 : 0, scale: reveal ? 1 : 0.6 }}
        animate={
          reveal
            ? { opacity: [0.75, 1, 0], scale: [1, 1.5, 3] }
            : { opacity: [0, 0.8, 0.6], scale: [0.6, 1, 0.94] }
        }
        transition={
          reveal
            ? { duration: 1.9, times: [0, 0.4, 1], ease: "easeOut" }
            : { duration: 2.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }
        }
      />

      {/* Vague (blow-up) — anneaux concentriques qui s'ouvrent, uniquement au reveal */}
      {reveal && [0, 0.16, 0.34].map((d) => (
        <motion.span
          key={d}
          className="pointer-events-none absolute rounded-full border border-indigo-400/45 dark:border-indigo-300/40"
          style={{ width: "22vmin", height: "22vmin" }}
          initial={{ scale: 0.28, opacity: 0.55 }}
          animate={{ scale: 4.2, opacity: 0 }}
          transition={{ duration: 1.6, delay: d, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}

      {/* Logo TaskForce — apparaît, s'illumine (halo + légère respiration) */}
      <motion.div
        className="relative"
        initial={reveal ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
        animate={
          reveal
            ? { opacity: [1, 1, 0], scale: [1, 1.05, 1.14] }
            : { opacity: 1, scale: [0.9, 1.0, 0.985] }
        }
        transition={
          reveal
            ? { duration: 1.95, times: [0, 0.5, 1], ease: "easeInOut" }
            : { opacity: { duration: 1.2, ease: "easeOut" }, scale: { duration: 3.2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } }
        }
      >
        <Image
          src="/assets/logo/logo_taskforce_tp.png"
          alt="TaskForce"
          width={240}
          height={160}
          priority
          className="h-[14vmin] max-h-[130px] w-auto drop-shadow-[0_10px_36px_rgba(79,70,229,0.28)] dark:invert"
        />
      </motion.div>
    </motion.div>
  )
}
