"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LazyMotion,
  domMin,
  m,
  useAnimation,
  useReducedMotion,
  type Variants,
} from "framer-motion";

/**
 * AnimatedNavIcon — icône lucide des méga-menus animée avec le **même mécanisme que la webapp**
 * (cf. `frontend/components/ui/icons/animated-lucide.tsx` + `.../animated-nav-icon.tsx`) :
 * framer-motion `LazyMotion` + `domMin` (features mini), ressort « wobble » (rotation + échelle),
 * piloté par `useAnimation`, déclenché au survol/focus de la **ligne entière** (plus proche `a`/`button`
 * ancêtre) — pas seulement du glyphe. `prefers-reduced-motion` respecté. La couleur (`style`) et le
 * dégradé Labs (`className` → `labs-ic-head`) sont transmis tels quels au glyphe.
 */
const wobble: Variants = {
  normal: { rotate: 0, scale: 1 },
  animate: {
    rotate: [0, -11, 9, -5, 0],
    scale: [1, 1.12, 1.06, 1.1, 1],
    transition: { duration: 0.6, ease: "easeInOut" },
  },
};

export function AnimatedNavIcon({
  icon: Icon,
  size = 18,
  strokeWidth = 1.75,
  className,
  style,
}: {
  readonly icon: LucideIcon;
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  const controls = useAnimation();
  const reduced = useReducedMotion();
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // On lie l'écouteur au plus proche `a`/`button` ancêtre (la carte du méga-menu) pour animer sur le
    // survol de TOUTE la carte, pas seulement du glyphe — exactement comme la sidebar de la webapp.
    const row = host.current?.closest("a,button");
    if (!row) return;
    const enter = () => {
      if (!reduced) controls.start("animate");
    };
    const leave = () => controls.start("normal");
    row.addEventListener("mouseenter", enter);
    row.addEventListener("focusin", enter);
    row.addEventListener("mouseleave", leave);
    row.addEventListener("focusout", leave);
    return () => {
      row.removeEventListener("mouseenter", enter);
      row.removeEventListener("focusin", enter);
      row.removeEventListener("mouseleave", leave);
      row.removeEventListener("focusout", leave);
    };
  }, [controls, reduced]);

  return (
    <LazyMotion features={domMin} strict>
      <m.span
        ref={host}
        className="inline-flex"
        style={{ transformOrigin: "center" }}
        initial="normal"
        animate={controls}
        variants={wobble}
      >
        <Icon size={size} strokeWidth={strokeWidth} className={className} style={style} />
      </m.span>
    </LazyMotion>
  );
}
