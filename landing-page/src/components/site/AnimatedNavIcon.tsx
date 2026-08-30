"use client";

import { useEffect, useRef } from "react";
import type {
  CSSProperties,
  ForwardRefExoticComponent,
  RefAttributes,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  LazyMotion,
  domMin,
  m,
  useAnimation,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import {
  ActivityIcon,
  BookOpenIcon,
  BrainIcon,
  ChartColumnIcon,
  CpuIcon,
  HistoryIcon,
  MapIcon,
  PlugIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
} from "@animateicons/react/lucide";

/**
 * AnimatedNavIcon — icône des méga-menus animée **au path**, avec la MÊME lib que la sidebar de la
 * webapp : `@animateicons/react` (dont dérivent les icônes bespoke de `frontend/components/ui/icons/*`).
 * Chaque glyphe a SA propre chorégraphie de paths (draw / pulse), déclenchée au survol de la LIGNE
 * entière (plus proche `a`/`button` ancêtre) — exactement comme la sidebar. `prefers-reduced-motion`
 * respecté. La couleur (`style.color` = teinte `hueFor`) est transmise au glyphe.
 *
 * Les glyphes absents du registry (Workflow, Bot, Newspaper, GraduationCap, FlaskConical) retombent
 * sur l'ancien « wobble » lucide générique — rendu cohérent, couleur et dégradé Labs (`labs-ic-head`)
 * préservés (le seul cas Labs, FlaskConical, passe par ce repli).
 */

/** Contrat impératif commun aux icônes animées (identique à la webapp). */
type AnimatedIconHandle = { startAnimation: () => void; stopAnimation: () => void };
type AnimatedIconComponent = ForwardRefExoticComponent<
  RefAttributes<AnimatedIconHandle> & {
    size?: number;
    color?: string;
    duration?: number;
    isAnimated?: boolean;
    className?: string;
  }
>;

/** lucide `displayName` → composant animateicons. Glyphes absents ⇒ repli wobble. */
const ANIMATED: Record<string, AnimatedIconComponent> = {
  ShieldCheck: ShieldCheckIcon as unknown as AnimatedIconComponent,
  Brain: BrainIcon as unknown as AnimatedIconComponent,
  Sparkles: SparklesIcon as unknown as AnimatedIconComponent,
  Users: UsersIcon as unknown as AnimatedIconComponent,
  // Lucide `BarChart3` est un alias de `chart-column` → son displayName est « ChartColumn ». On mappe les deux.
  BarChart3: ChartColumnIcon as unknown as AnimatedIconComponent,
  ChartColumn: ChartColumnIcon as unknown as AnimatedIconComponent,
  Plug: PlugIcon as unknown as AnimatedIconComponent,
  Cpu: CpuIcon as unknown as AnimatedIconComponent,
  RefreshCw: RefreshCwIcon as unknown as AnimatedIconComponent,
  BookOpen: BookOpenIcon as unknown as AnimatedIconComponent,
  History: HistoryIcon as unknown as AnimatedIconComponent,
  Map: MapIcon as unknown as AnimatedIconComponent,
  Activity: ActivityIcon as unknown as AnimatedIconComponent,
};

type Props = {
  readonly icon: LucideIcon;
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
};

/** Lie start/stop de l'animation au survol/focus de la LIGNE entière (plus proche `a`/`button`). */
function useRowHover(
  onEnter: () => void,
  onLeave: () => void,
  host: React.RefObject<HTMLElement | null>,
  deps: readonly unknown[],
) {
  useEffect(() => {
    const row = host.current?.closest("a,button");
    if (!row) return;
    row.addEventListener("mouseenter", onEnter);
    row.addEventListener("focusin", onEnter);
    row.addEventListener("mouseleave", onLeave);
    row.addEventListener("focusout", onLeave);
    return () => {
      row.removeEventListener("mouseenter", onEnter);
      row.removeEventListener("focusin", onEnter);
      row.removeEventListener("mouseleave", onLeave);
      row.removeEventListener("focusout", onLeave);
    };
  }, deps);
}

export function AnimatedNavIcon(props: Props) {
  const name = (props.icon as { displayName?: string }).displayName;
  const Animated = name ? ANIMATED[name] : undefined;
  return Animated ? <PathNavIcon Comp={Animated} {...props} /> : <WobbleNavIcon {...props} />;
}

/** Icône animée au path (registry animateicons), pilotée par le survol de la ligne. */
function PathNavIcon({
  Comp,
  size = 18,
  className,
  style,
}: Props & { readonly Comp: AnimatedIconComponent }) {
  const handle = useRef<AnimatedIconHandle>(null);
  const host = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useRowHover(
    () => {
      if (!reduced) handle.current?.startAnimation();
    },
    () => handle.current?.stopAnimation(),
    host,
    [reduced],
  );

  return (
    <span ref={host} className="contents">
      <Comp
        ref={handle}
        size={size}
        isAnimated={false}
        color={typeof style?.color === "string" ? style.color : undefined}
        className={className}
      />
    </span>
  );
}

const wobble: Variants = {
  normal: { rotate: 0, scale: 1 },
  animate: {
    rotate: [0, -11, 9, -5, 0],
    scale: [1, 1.12, 1.06, 1.1, 1],
    transition: { duration: 0.6, ease: "easeInOut" },
  },
};

/** Repli : glyphe lucide statique + « wobble » générique (icônes hors registry). */
function WobbleNavIcon({ icon: Icon, size = 18, strokeWidth = 1.75, className, style }: Props) {
  const controls = useAnimation();
  const reduced = useReducedMotion();
  const host = useRef<HTMLSpanElement>(null);

  useRowHover(
    () => {
      if (!reduced) controls.start("animate");
    },
    () => controls.start("normal"),
    host,
    [controls, reduced],
  );

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
