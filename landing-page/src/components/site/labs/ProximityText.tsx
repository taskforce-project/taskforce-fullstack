import { useEffect, useRef, useState, type MutableRefObject } from "react";
import VariableProximity from "@/components/VariableProximity";

/**
 * ProximityText - enveloppe pour VariableProximity (React Bits).
 * VP exige un `containerRef` (impossible à passer depuis Astro) et code en dur la police
 * « Roboto Flex » (non chargée ici) : on crée le ref, et on force notre police variable (Sora).
 * Sous prefers-reduced-motion, `to === from` → aucun changement de graisse (pas de branche de rendu
 * conditionnelle → pas de mismatch d'hydratation). Le poids des lettres s'épaissit près du curseur.
 */
interface Props {
  label: string;
  className?: string;
  from?: string;
  to?: string;
  radius?: number;
}

export default function ProximityText({
  label,
  className,
  from = "'wght' 400",
  to = "'wght' 700",
  radius = 130,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <span ref={ref} style={{ display: "inline-block" }}>
      <VariableProximity
        label={label}
        containerRef={ref as MutableRefObject<HTMLElement | null>}
        fromFontVariationSettings={from}
        toFontVariationSettings={reduced ? from : to}
        radius={radius}
        falloff="gaussian"
        className={className}
        style={{ fontFamily: "var(--font-display)" }}
      />
    </span>
  );
}
