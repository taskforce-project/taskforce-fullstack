import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Brain,
  CalendarRange,
  FileSearch,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Inbox,
  KanbanSquare,
  ListChecks,
  Link2,
  MessageSquare,
  Radio,
  ShieldCheck,
  UserRoundCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { toneInk, toneTint, toneWash, type Tone } from "./shapes";
import { Fit } from "./vignettes/parts";
import { VIGNETTES, type VignetteKey } from "./vignettes";
import { cn } from "@/lib/utils";

/**
 * Section produit à la manière de Duna : une liste dépliante (l'entrée ouverte montre son texte et une barre qui
 * se remplit) qui pilote l'illustration animée du panneau pastel. La liste avance seule toutes les `interval` ms
 * quand la section est à l'écran, se met en pause au survol ou au focus, et s'arrête dès qu'on choisit une entrée.
 */

const ICONS = {
  board: KanbanSquare,
  cycles: CalendarRange,
  subtasks: ListChecks,
  queue: Inbox,
  tree: Brain,
  links: Link2,
  search: FileSearch,
  reads: Radio,
  assign: UserRoundCheck,
  branch: GitBranch,
  live: Radio,
  agents: Users,
  approve: ShieldCheck,
  pr: GitPullRequest,
  comment: MessageSquare,
  merge: GitMerge,
} satisfies Record<string, LucideIcon>;

export type TabItem = { title: string; desc: string; art: VignetteKey; icon: keyof typeof ICONS };

const EASE = [0.22, 1, 0.36, 1] as const;

export default function FeatureTabs({
  items,
  tone = "blue",
  reverse = false,
  interval = 6500,
}: Readonly<{ items: TabItem[]; tone?: Tone; reverse?: boolean; interval?: number }>) {
  const reduce = useReducedMotion() ?? false;
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false); // survol ou focus : pause
  const [manual, setManual] = useState(false); // la personne a choisi : plus d'avance automatique
  const [inView, setInView] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const uid = useId();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const auto = inView && !hold && !manual && !reduce;
  useEffect(() => {
    if (!auto) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % items.length), interval);
    return () => window.clearTimeout(id);
  }, [auto, active, interval, items.length]);

  const Art = VIGNETTES[items[active].art];

  return (
    <div
      ref={host}
      className={cn(
        "grid items-center gap-10 lg:gap-16",
        reverse ? "lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]" : "lg:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)]",
      )}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHold(true);
      }}
      onPointerLeave={() => setHold(false)}
      onFocusCapture={() => setHold(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
    >
      {/* le panneau en lavis pastel et sa scène */}
      <div className={cn("relative", reverse && "lg:order-2")}>
        <div className={cn("wash flex items-center justify-center px-4 py-8 sm:px-10 sm:py-12", toneWash[tone])}>
          <div id={`${uid}-panel`} className="relative w-full max-w-[560px]" aria-hidden="true">
            <Fit>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={items[active].art}
                  className="absolute inset-0"
                  initial={reduce ? false : { opacity: 0, y: 16, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.985, transition: { duration: 0.22 } }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <Art playing={inView} reduce={reduce} />
                </motion.div>
              </AnimatePresence>
            </Fit>
          </div>
        </div>
      </div>

      {/* la liste dépliante */}
      <ul className={cn("flex flex-col gap-1.5", reverse && "lg:order-1")}>
        {items.map((it, i) => {
          const on = i === active;
          const Icon = ICONS[it.icon];
          return (
            <li key={it.title}>
              <button
                type="button"
                aria-expanded={on}
                aria-controls={`${uid}-d${i}`}
                onClick={() => {
                  setActive(i);
                  setManual(true);
                }}
                className={cn(
                  "group relative w-full overflow-hidden rounded-xl px-5 text-left transition-colors duration-300",
                  on ? "bg-card py-5" : "py-3.5 hover:bg-card/60",
                )}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-300",
                      on ? cn(toneTint[tone], toneInk[tone]) : "bg-transparent text-subtle group-hover:text-foreground",
                    )}
                  >
                    <Icon className="size-[17px]" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className={cn("text-[17px] tracking-[-0.015em] transition-colors", on ? "font-medium text-foreground" : "text-foreground/75 group-hover:text-foreground")}>
                    {it.title}
                  </span>
                </span>
                <motion.span
                  id={`${uid}-d${i}`}
                  className="block overflow-hidden"
                  initial={false}
                  animate={{ height: on ? "auto" : 0, opacity: on ? 1 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
                >
                  <span className="block pt-2 pl-11 text-[15px] leading-relaxed text-muted-foreground">{it.desc}</span>
                </motion.span>
                {/* l'avance automatique : une barre qui se remplit sous l'entrée ouverte */}
                {on && auto && (
                  <motion.span
                    key={`bar-${active}`}
                    aria-hidden="true"
                    className="absolute right-5 bottom-0 left-16 h-[2px] origin-left rounded-full bg-primary/70"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: interval / 1000, ease: "linear" }}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
