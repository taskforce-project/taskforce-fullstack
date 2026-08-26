"use client"

import { motion } from "framer-motion"
import Image from "next/image"

/**
 * Intro de connexion « façon ElevenLabs » : le logo TaskForce s'illumine, puis une **vague liquide**
 * (ondulation) jaillit et **ouvre l'app** — pendant que le dashboard charge <b>dessous</b> (overlay,
 * pas d'écran isolé). Pas de loader, pas de coupure : la dissolution révèle l'app déjà montée.
 *
 * La vague = le dégradé **Labs** (`labs-wave.jpg`) déformé par un filtre SVG `feTurbulence` +
 * `feDisplacementMap` (baseFrequency animée en SMIL) → une surface qui ondule vraiment, pas des
 * anneaux géométriques. Fond = `--background` (thème-aware → dissolution sans flash).
 *
 * Deux temps de part et d'autre du rechargement post-OAuth (frame de jointure = logo illuminé,
 * identique des deux côtés → rechargement invisible) :
 * - `hold`   : sur `/auth/callback` pendant l'échange — le logo apparaît et s'illumine, en boucle douce.
 * - `reveal` : monté par le `ProtectedLayout` juste après login — vague + dissolution, puis {@link onDone}.
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
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background"
      style={{ transformOrigin: "center" }}
      initial={{ opacity: 1, scale: 1 }}
      animate={reveal ? { opacity: [1, 1, 1, 0], scale: [1, 1.01, 1.03, 1.1] } : { opacity: 1 }}
      transition={reveal ? { duration: 2.9, times: [0, 0.3, 0.65, 1], ease: [0.4, 0, 0.2, 1] } : { duration: 0 }}
      onAnimationComplete={() => { if (reveal) onDone?.() }}
      aria-hidden="true"
    >
      {/* Halo — la lumière qui « allume » le logo, puis bloom au reveal */}
      <motion.div
        className="pointer-events-none absolute h-[46vmin] w-[46vmin] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(99,102,241,0.16), rgba(99,102,241,0) 68%)" }}
        initial={{ opacity: reveal ? 0.7 : 0, scale: reveal ? 1 : 0.6 }}
        animate={reveal ? { opacity: [0.7, 0.9, 0], scale: [1, 1.6, 3.4] } : { opacity: [0, 0.8, 0.6], scale: [0.6, 1, 0.94] }}
        transition={reveal ? { duration: 2, times: [0, 0.4, 1], ease: "easeOut" } : { duration: 2.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      />

      {reveal && (
        <>
          {/* Filtre SVG : la turbulence anime la surface (ondulation), le displacement la déforme. */}
          <svg aria-hidden className="absolute h-0 w-0">
            <defs>
              <filter id="tf-liquid" x="-35%" y="-35%" width="170%" height="170%">
                <feTurbulence type="fractalNoise" baseFrequency="0.008 0.013" numOctaves={2} seed={4} result="noise">
                  <animate
                    attributeName="baseFrequency"
                    dur="5s"
                    values="0.008 0.013;0.013 0.019;0.008 0.013"
                    repeatCount="indefinite"
                    calcMode="spline"
                    keyTimes="0;0.5;1"
                    keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
                  />
                </feTurbulence>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale={38} xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>
          </svg>

          {/* La vague : le dégradé Labs, ondulé par le filtre, qui jaillit du logo et ouvre l'app. */}
          <motion.div
            className="pointer-events-none absolute h-[72vmin] w-[72vmin] rounded-full"
            style={{
              backgroundImage: "url('/assets/tour/labs-wave.jpg')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "url(#tf-liquid)",
              mixBlendMode: "multiply",
            }}
            initial={{ scale: 0.34, opacity: 0 }}
            animate={{ scale: [0.34, 1.5, 3.9], opacity: [0, 0.95, 0] }}
            transition={{ duration: 2.5, times: [0, 0.42, 1], ease: [0.22, 1, 0.36, 1] }}
          />
        </>
      )}

      {/* Logo TaskForce — apparaît, s'illumine (halo + légère respiration) */}
      <motion.div
        className="relative"
        initial={reveal ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
        animate={reveal ? { opacity: [1, 1, 0], scale: [1, 1.06, 1.16] } : { opacity: 1, scale: [0.9, 1.0, 0.985] }}
        transition={reveal
          ? { duration: 2, times: [0, 0.5, 1], ease: "easeInOut" }
          : { opacity: { duration: 1.2, ease: "easeOut" }, scale: { duration: 3.2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } }}
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
