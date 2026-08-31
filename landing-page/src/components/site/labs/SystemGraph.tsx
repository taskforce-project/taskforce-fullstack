import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SystemGraph - signature #2 : la boucle de delivery que TaskForce parcourt.
 *
 * Signal → Memory → Reasoning → Model → Evaluation → Decision → (retour) Memory.
 * Survol / focus / tap d'un nœud : il s'agrandit, ses arêtes s'allument, le panneau révèle
 * 3 lignes + la maturité RÉELLE de l'endroit où la direction affleure dans le produit.
 *
 * Honnêteté (D11) : on publie la boucle (la DIRECTION), jamais le mécanisme interne d'une étape.
 * Chaque étape renvoie vers une surface produit existante avec son vrai badge (Live/Beta/Planned/Research).
 *
 * A11y (brief §17) : les nœuds sont de VRAIS <button> (clavier + lecteur d'écran + tactile),
 * le SVG des arêtes est décoratif (aria-hidden), le panneau est aria-live. Compréhensible sans
 * interaction : un aperçu s'affiche par défaut et chaque nœud porte sa description en aria-label.
 */

type Mat = "input" | "live" | "beta" | "planned" | "research";

interface Node {
  key: string;
  label: string;
  desc: string;
  mat: Mat;
  href: string;
  linkLabel: string;
  x: number; // % dans le viewBox 0–100
  y: number;
}

const NODES: Node[] = [
  {
    key: "signal",
    label: "Signal",
    desc: "A person's intent - an issue, a goal, a review note. Every run starts from what someone actually wants.",
    mat: "input",
    href: "/product",
    linkLabel: "The product",
    x: 50,
    y: 9,
  },
  {
    key: "memory",
    label: "Memory",
    desc: "What your organisation already decided - constraints, rejected paths - carried into the next run instead of re-derived from scratch.",
    mat: "beta",
    href: "/product/brain-os",
    linkLabel: "TaskForce Memory",
    x: 50,
    y: 31,
  },
  {
    key: "reasoning",
    label: "Reasoning",
    desc: "Scoped roles rather than one generalist, so each proposal stays grounded and easy for a human to review.",
    mat: "planned",
    href: "/product/orchestration",
    linkLabel: "Orchestration",
    x: 81,
    y: 50,
  },
  {
    key: "model",
    label: "Model",
    desc: "The right model per step, local or hosted. Running on your models ships today; automatic per-step routing is what we're researching.",
    mat: "live",
    href: "/enterprise",
    linkLabel: "Runtime & models",
    x: 68,
    y: 83,
  },
  {
    key: "evaluation",
    label: "Evaluation",
    desc: "Proposals measured, not assumed - what a human edits or sends back becomes signal for the next run.",
    mat: "research",
    href: "/labs/learning-from-reviews",
    linkLabel: "Learning from reviews",
    x: 32,
    y: 83,
  },
  {
    key: "decision",
    label: "Decision",
    desc: "A human signs off at each checkpoint. The approved decision is what becomes durable - and feeds straight back into memory.",
    mat: "beta",
    href: "/product/approvals",
    linkLabel: "Approvals",
    x: 19,
    y: 50,
  },
];

const EDGES: [string, string][] = [
  ["signal", "memory"],
  ["memory", "reasoning"],
  ["reasoning", "model"],
  ["model", "evaluation"],
  ["evaluation", "decision"],
  ["decision", "memory"], // la boucle se referme
];

const MAT_LABEL: Record<Mat, string> = {
  input: "Input",
  live: "Live",
  beta: "Beta",
  planned: "Planned",
  research: "Research",
};

const byKey = (k: string) => NODES.find((n) => n.key === k)!;

export default function SystemGraph() {
  const [active, setActive] = useState<string | null>(null);
  const node = active ? byKey(active) : null;

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
      {/* ── Le graphe ── */}
      <div className="relative mx-auto aspect-square w-full max-w-[460px]">
        <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 size-full overflow-visible">
          {EDGES.map(([a, b]) => {
            const na = byKey(a);
            const nb = byKey(b);
            const on = active === a || active === b;
            return (
              <line
                key={`${a}-${b}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                stroke={on ? "rgba(167,139,250,0.85)" : "rgba(255,255,255,0.14)"}
                strokeWidth={on ? 0.9 : 0.5}
                className="[transition:stroke_200ms_ease,stroke-width_200ms_ease]"
              />
            );
          })}
        </svg>

        {NODES.map((n) => {
          const on = active === n.key;
          const dim = active !== null && !on;
          return (
            <button
              key={n.key}
              type="button"
              aria-pressed={on}
              aria-label={`${n.label} - ${n.desc}`}
              onMouseEnter={() => setActive(n.key)}
              onFocus={() => setActive(n.key)}
              onClick={() => setActive(n.key)}
              style={{ left: `${n.x}%`, top: `${n.y}%` }}
              className={cn(
                "group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-lg p-1.5 outline-none transition-opacity",
                dim && "opacity-45 hover:opacity-100",
              )}
            >
              <span
                className={cn(
                  "grid size-3.5 place-items-center rounded-full border transition-all duration-200",
                  on
                    ? "scale-125 border-violet-300 bg-violet-400/30 shadow-[0_0_0_4px_rgba(167,139,250,0.18)]"
                    : "border-white/25 bg-white/10 group-hover:border-violet-300/70",
                )}
              >
                <span className={cn("size-1 rounded-full transition-colors", on ? "bg-violet-200" : "bg-white/60")} />
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide whitespace-nowrap transition-colors",
                  on
                    ? "border-violet-300/40 bg-violet-400/10 text-[color:var(--labs-fg)]"
                    : "border-transparent text-[color:var(--labs-muted)] group-hover:text-[color:var(--labs-fg)]",
                )}
              >
                {n.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Panneau de détail ── */}
      <div aria-live="polite" className="labs-panel min-h-[220px] p-6 sm:p-7">
        {node ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] tracking-[0.16em] text-[color:var(--labs-faint)] uppercase">
                Step
              </span>
              <Chip mat={node.mat} />
            </div>
            <h3 className="labs-h3 mt-3">{node.label}</h3>
            <p className="mt-2.5 text-[14.5px] leading-6 text-[color:var(--labs-muted)]">{node.desc}</p>
            {node.mat !== "input" && (
              <a
                href={node.href}
                className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[color:var(--labs-blue)] hover:underline"
              >
                {node.linkLabel}
                <ArrowRight className="size-3.5" />
              </a>
            )}
          </>
        ) : (
          <>
            <span className="font-mono text-[11px] tracking-[0.16em] text-[color:var(--labs-violet)] uppercase">
              The loop
            </span>
            <h3 className="labs-h3 mt-3">Reasoning over a loop, not a prompt</h3>
            <p className="mt-2.5 text-[14.5px] leading-6 text-[color:var(--labs-muted)]">
              Intent enters, runs against what your organisation already decided, and every decision feeds
              back into memory. We publish the loop - what happens inside each step stays in the lab until it
              ships.
            </p>
            <p className="mt-5 font-mono text-[11px] text-[color:var(--labs-faint)]">
              // hover or focus a step to see where it stands
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Chip({ mat }: { mat: Mat }) {
  const styles: Record<Mat, string> = {
    input: "border-white/15 bg-white/5 text-white/60",
    live: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    beta: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    planned: "border-violet-400/30 bg-violet-400/10 text-violet-300",
    research: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase",
        styles[mat],
      )}
    >
      {MAT_LABEL[mat]}
    </span>
  );
}
