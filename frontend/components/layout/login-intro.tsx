"use client"

import {
  LazyMotion,
  animate,
  domAnimation,
  m,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
} from "framer-motion"
import Image from "next/image"
import { useEffect } from "react"

/**
 * Intro de connexion — langage « produit premium » (ElevenLabs / Linear), pas un loader.
 *
 * Principe : la **matière** (le dégradé Labs) est déjà là au repos autour du logo, puis **s'étale**
 * jusqu'à recouvrir l'écran, et l'app — montée <b>dessous</b> — est révélée par un cut propre. Pas
 * d'écran isolé, pas de coupure blanche : `matière → expansion → recouvrement → app`.
 *
 * Discipline du mouvement (le point clé) :
 * - Le contour **ne scale pas** : on anime le **rayon d'un masque radial** (`mask-image`), donc le
 *   volume *s'étale* au lieu qu'une image soit agrandie.
 * - Le **bord** est rendu organique par un filtre SVG `feTurbulence` + `feDisplacementMap` posé sur le
 *   wrapper : il déforme le bord du masque ET la texture de quelques pixels.
 * - La **texture a son propre mouvement** : la turbulence est animée en boucle lente (SMIL),
 *   indépendamment de l'expansion — les vagues glissent, elles ne sont pas « étirées ».
 * - **Expansion continue** : une seule course en **courbe S** (ease-in-out ~10/80/10) — démarrage
 *   doux, rush au milieu, décélération en fin (« plongée dans l'eau ») ; le volume dépasse les 4 bords.
 * - Le **logo est absorbé** : baisse d'opacité + léger flou (pas de fade brutal, pas de scale).
 * - **Zéro gadget** : ni halo/glow, ni rotation, ni bounce/overshoot, ni particules, ni spinner.
 *
 * Deux temps de part et d'autre du rechargement post-OAuth (frame de jointure = matière au repos +
 * logo net, identique des deux côtés → rechargement invisible) :
 * - `hold`   : sur `/auth/callback` pendant l'échange — le logo apparaît, la matière respire à peine.
 * - `reveal` : monté par le `ProtectedLayout` juste après login — expansion + absorption, puis {@link onDone}.
 *
 * `prefers-reduced-motion` respecté : simple fondu propre vers l'app, sans expansion.
 */
export function LoginIntro({
  phase,
  onDone,
}: {
  readonly phase: "hold" | "reveal"
  readonly onDone?: () => void
}) {
  const reveal = phase === "reveal"
  const reduced = useReducedMotion()

  // Rayon du masque (px) — piloté impérativement pour composer le `mask-image` via un template.
  // Init non nul (~matière au repos) pour éviter un blob invisible à la première frame ; corrigé au vmin réel dans l'effet.
  const radius = useMotionValue(120)
  const logoOpacity = useMotionValue(reveal ? 1 : 0)
  const logoBlur = useMotionValue(0)
  const overlayOpacity = useMotionValue(1)

  // Le volume s'étale en agrandissant CE masque (le contour bouge, rien n'est scalé).
  const maskImage = useMotionTemplate`radial-gradient(circle ${radius}px at 50% 50%, #000 82%, rgba(0,0,0,0.5) 93%, transparent 100%)`
  const logoFilter = useMotionTemplate`blur(${logoBlur}px)`

  useEffect(() => {
    const vmin = Math.min(window.innerWidth, window.innerHeight)
    const r0 = vmin * 0.14 // matière au repos : un peu plus large que le logo
    const R = Math.hypot(window.innerWidth, window.innerHeight) * 0.85 // dépasse les 4 coins
    radius.set(r0)

    // ── hold : la matière est là, au repos ; le logo apparaît en douceur ──────────────────
    if (!reveal) {
      const a = animate(logoOpacity, 1, { duration: 1.1, ease: "easeOut" })
      return () => a.stop()
    }

    // ── reduced-motion : pas d'expansion, un fondu propre suffit ───────────────────────────
    if (reduced) {
      logoOpacity.set(1)
      const a = animate(overlayOpacity, 0, {
        duration: 0.55,
        ease: "easeInOut",
        onComplete: () => onDone?.(),
      })
      return () => a.stop()
    }

    // ── reveal : expansion continue (ease-in-out qui accélère) → recouvrement → cut ─────────
    const D = 1.6
    const controls = [
      // Rayon : une SEULE course r0 → R. Courbe en S : démarrage doux, RUSH au milieu, puis
      // DÉCÉLÉRATION sur les derniers ~20 % — mais `y2=0.9` (pas 1) évite la queue qui « rampe »
      // à la fin : ça décélère en FINISSANT le mouvement. Effet « zoom in / plongée dans l'eau ».
      animate(radius, [r0, R], {
        duration: D,
        ease: [0.7, 0, 0.3, 0.9],
      }),
      // Logo absorbé : opacité qui descend puis flou qui monte, tôt dans l'expansion.
      animate(logoOpacity, [1, 1, 0], { duration: D, times: [0, 0.12, 0.4], ease: "easeInOut" }),
      animate(logoBlur, [0, 0, 14], { duration: D, times: [0, 0.12, 0.5], ease: "easeIn" }),
      // L'écran est recouvert bien avant la fin (rush du milieu) → on révèle l'app dès ~80 % au lieu
      // d'attendre : plus de « hold » recouvert qui traîne. Fondu court, puis onDone au bout.
      animate(overlayOpacity, [1, 1, 0], {
        duration: D,
        times: [0, 0.8, 0.96],
        ease: "easeInOut",
        onComplete: () => onDone?.(),
      }),
    ]
    return () => controls.forEach((c) => c.stop())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, reduced])

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background"
        style={{ opacity: overlayOpacity }}
        aria-hidden="true"
      >
        {/* Filtre : la turbulence (animée, en boucle lente) déforme le bord du masque ET la texture
            de quelques pixels — c'est ce qui rend le contour organique et donne à la matière son
            mouvement propre, indépendant de l'expansion. */}
        <svg aria-hidden className="absolute h-0 w-0">
          <defs>
            <filter id="tf-liquid" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.006 0.010"
                numOctaves={2}
                seed={7}
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  dur="8s"
                  values="0.006 0.010;0.010 0.015;0.006 0.010"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keyTimes="0;0.5;1"
                  keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={26}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>

        {/* Le volume : le dégradé Labs, dont le displacement rend le bord organique, révélé par le
            masque radial qui grandit. `multiply` sur fond clair pour la profondeur d'encre ; `screen`
            en dark pour qu'il rayonne au lieu de s'éteindre. */}
        <div className="pointer-events-none absolute inset-0" style={{ filter: "url(#tf-liquid)" }}>
          <m.div
            className="absolute inset-0 mix-blend-multiply dark:mix-blend-screen"
            style={{
              backgroundImage: "url('/assets/tour/labs-wave.jpg')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              WebkitMaskImage: maskImage,
              maskImage,
            }}
          />
        </div>

        {/* Logo TaskForce — net au repos, puis absorbé (opacité + léger flou) par la matière. */}
        <m.div className="relative" style={{ opacity: logoOpacity, filter: logoFilter }}>
          <Image
            src="/assets/logo/logo_taskforce_tp.png"
            alt="TaskForce"
            width={240}
            height={160}
            priority
            className="h-[14vmin] max-h-[130px] w-auto dark:invert"
          />
        </m.div>
      </m.div>
    </LazyMotion>
  )
}
