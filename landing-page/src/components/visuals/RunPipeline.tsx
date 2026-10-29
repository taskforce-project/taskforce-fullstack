import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from "motion/react";
import { Check, FileText, GitBranch, GitPullRequest } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { BrandMark } from "./brand";
import { cn } from "@/lib/utils";

/**
 * Le déroulé d'un run en cinq étapes, sur un panneau pastel. Le tracé cobalt
 * avance avec le défilement et chaque étape s'allume quand il l'atteint. Horizontal sur grand écran, vertical sur
 * téléphone. Mouvement réduit : tout est allumé.
 */

type Stage = { title: string; text: string; badge: string; chip: ReactNode };

const STAGES: Stage[] = [
  {
    title: "You assign it",
    text: "Pick an agent in the issue's assignee menu. Only agents ready for this project are offered.",
    badge: "bg-shape-blue text-white",
    chip: (
      <span className="inline-flex items-center gap-1.5 border border-input bg-white px-2 py-1 text-[11.5px] whitespace-nowrap rounded-lg">
        <BrandMark brand="claude-code" className="size-4" /> Claude Code
      </span>
    ),
  },
  {
    title: "It gets the context",
    text: "The agent reads the issue and its comments, and searches your workspace's knowledge for the decisions that relate to it.",
    badge: "bg-shape-green text-white",
    chip: (
      <span className="inline-flex items-center gap-1.5 bg-tint-green px-2 py-1 text-[11.5px] whitespace-nowrap text-ink-green rounded-md">
        <FileText className="size-3.5" /> Design tokens
      </span>
    ),
  },
  {
    title: "It works on its own branch",
    text: "Claude Code works in a separate copy of your repository, on a new branch. Your checkout is never touched.",
    badge: "bg-shape-pink text-white",
    chip: (
      <span className="inline-flex items-center gap-1.5 bg-muted px-2 py-1 font-mono text-[10.5px] whitespace-nowrap rounded-md">
        <GitBranch className="size-3.5" /> tf/web-42
      </span>
    ),
  },
  {
    title: "It asks before going further",
    text: "Anything outside its allowed actions waits for your Allow or Deny on the issue. No answer in 10 minutes means no.",
    badge: "bg-shape-yellow text-foreground",
    chip: (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-6 items-center bg-primary px-2.5 text-[11px] font-medium text-white shadow-key rounded-lg">Allow</span>
        <span className="inline-flex h-6 items-center px-2.5 text-[11px] shadow-[inset_0_0_0_1px_var(--input)] rounded-lg">Deny</span>
      </span>
    ),
  },
  {
    title: "It hands the work back",
    text: "A pull request, or a comment when there is no code. The issue moves to “In review by AI”, and merging stays your call.",
    badge: "bg-shape-red text-white",
    chip: (
      <span className="inline-flex items-center gap-1.5 bg-tint-green px-2 py-1 text-[11.5px] whitespace-nowrap text-ink-green rounded-md">
        <GitPullRequest className="size-3.5" /> PR #42
      </span>
    ),
  },
];

export default function RunPipeline() {
  const reduce = useReducedMotion() ?? false;
  const host = useRef<HTMLDivElement>(null);
  // de « le haut du bloc entre à 85 % de l'écran » à « son bas arrive à 85 % » : la cinquième étape s'allume pendant
  // que le bloc est encore entièrement visible, sur grand écran comme sur téléphone (où il est haut)
  const { scrollYProgress } = useScroll({ target: host, offset: ["start 0.85", "end 0.85"] });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });
  const [reached, setReached] = useState(reduce ? STAGES.length : 0);
  useMotionValueEvent(progress, "change", (p) => {
    if (reduce) return;
    // une étape s'allume quand le tracé atteint son milieu ; la dernière vers 90 % de la course
    const n = Math.min(STAGES.length, Math.floor(p * STAGES.length + 0.5));
    setReached((r) => (r === n ? r : n));
  });
  const lit = reduce ? STAGES.length : reached;

  return (
    <div ref={host} className="relative">
      <div className="wash wash-sky p-4 sm:p-8 lg:p-10">
        <ol className="relative grid gap-4 lg:grid-cols-5 lg:gap-5">
          {/* le tracé : horizontal sur grand écran, vertical sur téléphone */}
          <span aria-hidden="true" className="absolute top-[38px] right-[10%] left-[10%] hidden h-0.5 bg-ink-blue/20 lg:block">
            <motion.span className="absolute inset-0 origin-left bg-primary" style={{ scaleX: reduce ? 1 : progress }} />
          </span>
          <span aria-hidden="true" className="absolute top-6 bottom-6 left-[38px] w-0.5 bg-ink-blue/20 lg:hidden">
            <motion.span className="absolute inset-0 origin-top bg-primary" style={{ scaleY: reduce ? 1 : progress }} />
          </span>
          {STAGES.map((s, i) => {
            const on = i < lit;
            return (
              <li key={s.title} className="relative flex gap-4 rounded-xl bg-white p-5 shadow-float lg:flex-col lg:gap-0 lg:p-6">
                <motion.span
                  className={cn("relative z-10 grid size-9 shrink-0 place-items-center rounded-full font-mono text-[11px]", on ? s.badge : "bg-white text-subtle shadow-[inset_0_0_0_1.5px_var(--rule)]")}
                  animate={{ scale: on ? [1, 1.18, 1] : 1 }}
                  transition={{ duration: 0.45 }}
                >
                  {on && (i < lit - 1 || lit === STAGES.length) ? <Check className="size-4" strokeWidth={2.6} /> : String(i + 1).padStart(2, "0")}
                </motion.span>
                <div className="min-w-0 lg:mt-6">
                  <p className={cn("text-[17px] font-medium tracking-[-0.015em] transition-colors duration-500", on ? "text-foreground" : "text-foreground/45")}>{s.title}</p>
                  <p className={cn("mt-2 text-[14.5px] leading-relaxed transition-colors duration-500", on ? "text-muted-foreground" : "text-muted-foreground/50")}>{s.text}</p>
                  <motion.div
                    className="mt-4"
                    initial={false}
                    animate={{ opacity: on ? 1 : 0, y: on ? 0 : 6 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {s.chip}
                  </motion.div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
