import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * CapabilityPairs — illustration du bloc « The consequence ».
 *
 * Six cartes de texte alignées ne démontraient rien : on lisait une liste de features.
 * Ici on montre le **couplage** — deux capacités s'allument, un trait les relie, et le
 * bénéfice qui en découle s'écrit dessous. C'est l'argument « une seule plateforme »
 * rendu visible : sans les deux moitiés dans le même système, la ligne du bas n'existe pas.
 */

const CAPS = [
  "Orchestration",
  "Brain OS",
  "Approvals",
  "Smart Assign",
  "Analytics",
  "Model routing",
] as const;

type Cap = (typeof CAPS)[number];

type Pair = { a: Cap; b: Cap; title: string; text: string };

const PAIRS: Pair[] = [
  {
    a: "Brain OS",
    b: "Orchestration",
    title: "A spec that already knows your architecture",
    text: "The spec step reads the decisions you made months ago, so it stops proposing what you already ruled out.",
  },
  {
    a: "Orchestration",
    b: "Smart Assign",
    title: "Routing that survives the plan changing",
    text: "When a run splits into work items, each one is routed the moment it exists. There is no batch triage afterwards.",
  },
  {
    a: "Approvals",
    b: "Analytics",
    title: "An audit trail that doubles as your metrics",
    text: "One sign-off is both a compliance record and a data point. You only maintain one of them.",
  },
  {
    a: "Analytics",
    b: "Model routing",
    title: "The slow step gets named, then rerouted",
    text: "You can see which checkpoint drags, and move that one — not the whole workspace — onto something faster.",
  },
  {
    a: "Approvals",
    b: "Brain OS",
    title: "Rejections that teach",
    text: "What you send back becomes context for the next run, so the same mistake gets proposed less often.",
  },
  {
    a: "Orchestration",
    b: "Approvals",
    title: "Documentation nobody has to write afterwards",
    text: "The spec, the decision and the sign-off are outputs of the run itself, not homework once it is done.",
  },
];

const MS = 3400;

/** Centre d'une puce dans la grille 3 × 2, en pourcentage — pour tracer le trait. */
const centre = (cap: Cap) => {
  const i = CAPS.indexOf(cap);
  const col = i % 3;
  const row = Math.floor(i / 3);
  return { x: ((col + 0.5) / 3) * 100, y: ((row + 0.5) / 2) * 100 };
};

export function CapabilityPairs() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pair = PAIRS[i];

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setI((p) => (p + 1) % PAIRS.length), MS);
    return () => window.clearTimeout(t);
  }, [playing, i]);

  const from = centre(pair.a);
  const to = centre(pair.b);

  return (
    <div ref={rootRef} className="bg-card overflow-hidden rounded-2xl border shadow-lg">
      <div className="bg-secondary/50 flex items-center gap-3 border-b px-5 py-3">
        <span className="text-[13px] font-medium text-foreground">
          What one system buys you
        </span>
        <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
          {i + 1}/{PAIRS.length}
        </span>
      </div>

      {/* La grille des capacités, avec le trait entre les deux actives */}
      <div className="relative p-5">
        <svg
          className="pointer-events-none absolute inset-5 h-[calc(100%-2.5rem)] w-[calc(100%-2.5rem)]"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <line
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="var(--primary)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
            className="transition-all duration-700 ease-in-out"
            opacity="0.5"
          />
        </svg>

        <ul className="relative grid grid-cols-3 gap-2">
          {CAPS.map((c) => {
            const on = c === pair.a || c === pair.b;
            return (
              <li
                key={c}
                className={cn(
                  "rounded-lg border px-2.5 py-2 text-center text-[11.5px] transition-all duration-500",
                  on
                    ? "border-primary/40 bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground bg-card",
                )}
              >
                {c}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Le bénéfice — hauteur réservée pour le texte le plus long.
          148px et pas 132 : deux paires sur six passent sur une ligne de plus,
          ce qui faisait varier la carte de 12px à chaque cycle. */}
      <div className="min-h-[148px] border-t p-5">
        <p className="text-muted-foreground flex items-center gap-1.5 text-[11.5px]">
          <span className="text-primary font-medium">{pair.a}</span>
          <span>+</span>
          <span className="text-primary font-medium">{pair.b}</span>
        </p>
        <h3 className="mt-2 text-[14.5px] leading-6 font-semibold text-foreground">{pair.title}</h3>
        <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-6">{pair.text}</p>
      </div>
    </div>
  );
}
