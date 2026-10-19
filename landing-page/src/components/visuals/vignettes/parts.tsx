import { motion } from "motion/react";
import { MousePointer2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Pièces communes des vignettes animées (sections produit) : mise à l'échelle d'une scène de taille fixe, petite
 * fenêtre d'app, traits de texte, curseur, et une horloge de séquence qui boucle.
 */

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Les vignettes sont dessinées à cette taille, puis réduites pour tenir dans leur panneau. */
export const VW = 560;
export const VH = 400;

/** Réduit une scène de taille fixe à la largeur de son conteneur (jamais agrandie). */
export function Fit({ w = VW, h = VH, children, className }: Readonly<{ w?: number; h?: number; children: ReactNode; className?: string }>) {
  const host = useRef<HTMLDivElement>(null);
  const [k, setK] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setK(Math.min(1, e.contentRect.width / w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={host} className={cn("relative w-full", className)} style={{ aspectRatio: `${w} / ${h}`, maxWidth: w }}>
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: w, height: h, transform: `scale(${k ?? 1})`, opacity: k === null ? 0 : 1 }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Séquence d'étapes : renvoie l'index courant, qui avance selon `durations` (ms par étape) et reboucle.
 * `playing=false` fige la séquence (vignette hors écran). Mouvement réduit : dernière étape, immobile.
 */
export function useSequence(durations: readonly number[], playing = true, reduce = false) {
  const [step, setStep] = useState(reduce ? durations.length - 1 : 0);
  useEffect(() => {
    if (reduce) {
      setStep(durations.length - 1);
      return;
    }
    if (!playing) return;
    const id = window.setTimeout(() => setStep((s) => (s + 1) % durations.length), durations[step]);
    return () => window.clearTimeout(id);
  }, [step, playing, reduce, durations]);
  return step;
}

/** Petite fenêtre d'app : barre de titre à trois pastilles, contenu blanc, ombre de fenêtre. */
export function MiniWindow({
  title = "TaskForce",
  className,
  style,
  bodyClassName,
  children,
}: Readonly<{ title?: string; className?: string; style?: CSSProperties; bodyClassName?: string; children: ReactNode }>) {
  return (
    <div className={cn("absolute flex flex-col overflow-hidden rounded-xl bg-white shadow-window", className)} style={style}>
      <div className="flex h-8 shrink-0 items-center border-b border-black/[0.06] bg-paper px-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-shape-red/80" />
          <span className="size-2.5 rounded-full bg-shape-yellow/80" />
          <span className="size-2.5 rounded-full bg-shape-green/80" />
        </span>
        <span className="mx-auto pr-10 text-[11px] font-medium text-subtle">{title}</span>
      </div>
      <div className={cn("relative min-h-0 flex-1", bodyClassName)}>{children}</div>
    </div>
  );
}

/** Un trait de texte (paragraphe esquissé). */
export function Line({ w, className }: Readonly<{ w: number | string; className?: string }>) {
  return <span className={cn("block h-[6px] rounded-full bg-border", className)} style={{ width: w }} />;
}

/** Curseur animé, positionné dans les coordonnées de la scène. */
export function Cursor({ x, y, press = false, show = true }: Readonly<{ x: number; y: number; press?: boolean; show?: boolean }>) {
  return (
    <motion.div
      className="pointer-events-none absolute top-0 left-0 z-40"
      initial={false}
      animate={{ x, y, opacity: show ? 1 : 0, scale: press ? 0.86 : 1 }}
      transition={{ x: { duration: 0.7, ease: EASE }, y: { duration: 0.7, ease: EASE }, opacity: { duration: 0.25 }, scale: { duration: 0.12 } }}
    >
      <MousePointer2 className="size-5 fill-foreground text-white drop-shadow-md" strokeWidth={1.4} />
    </motion.div>
  );
}

/** Pastille de statut aux couleurs de l'app. */
export function Status({ tone, children }: Readonly<{ tone: "todo" | "progress" | "review" | "done" | "blocked"; children: ReactNode }>) {
  const cls = {
    todo: ["bg-muted text-muted-foreground", "bg-subtle"],
    progress: ["bg-tint-yellow text-ink-yellow", "bg-shape-yellow"],
    review: ["bg-tint-pink text-ink-pink", "bg-shape-pink"],
    done: ["bg-tint-green text-ink-green", "bg-shape-green"],
    blocked: ["bg-tint-red text-ink-red", "bg-shape-red"],
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap", cls[0])}>
      <span className={cn("size-1.5 rounded-full", cls[1])} />
      {children}
    </span>
  );
}

/** Pastille ronde à initiales (une personne). */
export function Person({ initials = "Y", className }: Readonly<{ initials?: string; className?: string }>) {
  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full bg-shape-pink text-[8.5px] font-semibold text-white", className)}>
      {initials}
    </span>
  );
}

/** Apparition standard d'un élément de liste. */
export const rise = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.4, ease: EASE },
} as const;
