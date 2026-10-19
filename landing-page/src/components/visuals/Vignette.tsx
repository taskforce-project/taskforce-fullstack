import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { toneWash, type Tone } from "./shapes";
import { Fit } from "./vignettes/parts";
import { VIGNETTES, type VignetteKey } from "./vignettes";
import { cn } from "@/lib/utils";

/**
 * Une vignette animée seule. Par défaut sur son panneau en lavis pastel ; `bare` la pose telle quelle, sans panneau,
 * quand la carte qui la porte fait déjà le fond (cartes en paire). Elle ne joue que lorsqu'elle est à l'écran.
 */
export default function Vignette({
  art,
  tone = "blue",
  bare = false,
  className,
}: Readonly<{ art: VignetteKey; tone?: Tone; bare?: boolean; className?: string }>) {
  const reduce = useReducedMotion() ?? false;
  const host = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Art = VIGNETTES[art];
  const scene = (
    // la scène a ses propres couleurs : elle n'hérite jamais du texte de la carte qui la porte (blanc sur la carte cobalt)
    <div className="relative mx-auto w-full max-w-[560px] text-foreground" aria-hidden="true">
      <Fit>
        <div className="absolute inset-0">
          <Art playing={inView} reduce={reduce} />
        </div>
      </Fit>
    </div>
  );
  if (bare) {
    return (
      <div ref={host} className={className}>
        {scene}
      </div>
    );
  }
  return (
    <div ref={host} className={cn("wash flex items-center justify-center px-4 py-8 sm:px-10 sm:py-12", toneWash[tone], className)}>
      {scene}
    </div>
  );
}
