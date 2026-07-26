import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AssignRanking — illustration du bloc « Smart Assign ».
 *
 * L'ancien visuel ne montrait que le gagnant : impossible de juger si le choix était bon.
 * Ici on montre **la comparaison** — quatre personnes notées sur les mêmes cinq signaux,
 * la composition de chaque score (barre segmentée), et la raison en clair.
 * C'est ce qui rend l'affectation contestable, donc acceptable.
 */

const SIGNALS = [
  { key: "skills", label: "Skills match" },
  { key: "history", label: "History on the module" },
  { key: "load", label: "Current load" },
  { key: "timezone", label: "Timezone overlap" },
  { key: "reviews", label: "Recent reviews" },
] as const;

/** Opacités décroissantes du primaire : la composition se lit sans code couleur à apprendre. */
const SHADE = [1, 0.72, 0.52, 0.36, 0.22];

type Candidate = {
  initials: string;
  name: string;
  role: string;
  parts: number[]; // contribution de chaque signal, dans l'ordre de SIGNALS
  why?: string;
};

const CANDIDATES: Candidate[] = [
  {
    initials: "MD",
    name: "Marie Dubois",
    role: "Owns the auth module",
    parts: [26, 22, 18, 12, 7],
    why: "Owns the module · closed 2 similar issues · lightest load this cycle",
  },
  { initials: "TL", name: "Thomas Leroy", role: "Backend", parts: [20, 12, 15, 10, 4] },
  { initials: "SB", name: "Sofia Bernard", role: "Backend", parts: [14, 8, 12, 7, 3] },
  { initials: "JM", name: "Julien Marchand", role: "Full-stack", parts: [9, 4, 8, 5, 2] },
];

const total = (c: Candidate) => c.parts.reduce((a, b) => a + b, 0);

type Phase = "idle" | "scoring" | "ranked" | "explained";
const ORDER: Phase[] = ["idle", "scoring", "ranked", "explained"];
const MS: Record<Phase, number> = { idle: 900, scoring: 1700, ranked: 1500, explained: 4000 };

export function AssignRanking() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const phase = ORDER[i];

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setI(ORDER.length - 1);
      return;
    }
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setI((p) => (p + 1) % ORDER.length), MS[phase]);
    return () => window.clearTimeout(t);
  }, [playing, i, phase]);

  const at = ORDER.indexOf(phase);
  const filled = at >= 1;
  const ranked = at >= 2;
  const explained = at >= 3;

  return (
    <div ref={rootRef} className="bg-card overflow-hidden rounded-2xl border shadow-lg">
      {/* La tâche à affecter */}
      <div className="bg-secondary/50 flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <span className="text-muted-foreground font-mono text-[11px]">#2481</span>
        <span className="truncate text-[12.5px] font-medium text-foreground">
          Add SSO to the workspace settings
        </span>
        <span className="ml-auto flex shrink-0 gap-1">
          {["auth", "backend"].map((t) => (
            <span
              key={t}
              className="bg-card text-muted-foreground rounded border px-1.5 py-0.5 text-[10px]"
            >
              {t}
            </span>
          ))}
        </span>
      </div>

      {/* Le classement */}
      <ul className="flex flex-col gap-1.5 p-4">
        {CANDIDATES.map((c, idx) => {
          const score = total(c);
          const isTop = idx === 0;
          const highlight = ranked && isTop;
          return (
            <li
              key={c.initials}
              className={cn(
                "rounded-lg border px-3 py-2.5 transition-all duration-500",
                highlight
                  ? "border-primary/35 bg-primary/[0.06]"
                  : ranked
                    ? "border-transparent opacity-55"
                    : "bg-secondary/30",
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors duration-500",
                    highlight
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {c.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-foreground">
                    {c.name}
                  </span>
                  <span className="text-muted-foreground block truncate text-[10.5px]">
                    {c.role}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[12px] tabular-nums transition-[opacity,color] duration-500",
                    filled ? "opacity-100" : "opacity-0",
                    highlight ? "text-primary font-semibold" : "text-muted-foreground",
                  )}
                >
                  {score}%
                </span>
              </div>

              {/* Barre segmentée : la composition du score, pas seulement son total */}
              <div className="bg-secondary mt-2 flex h-1.5 overflow-hidden rounded-full">
                {c.parts.map((p, s) => (
                  <span
                    key={SIGNALS[s].key}
                    className="bg-primary block h-full transition-[width] duration-700 ease-out"
                    style={{
                      width: filled ? `${p}%` : "0%",
                      opacity: SHADE[s],
                      transitionDelay: `${idx * 80 + s * 60}ms`,
                    }}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {/* La raison — place réservée en permanence */}
      <div className="border-t px-4 py-3">
        <p
          className={cn(
            "text-[11.5px] leading-5 transition-opacity duration-500",
            explained ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="font-medium text-foreground">Why Marie: </span>
          <span className="text-muted-foreground">{CANDIDATES[0].why}</span>
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]">
            <RotateCcw className="size-3" />
            Reassign
          </span>
          <span className="text-muted-foreground text-[11px]">
            One click. The override is a signal too.
          </span>
        </div>
      </div>

      {/* Légende des signaux */}
      <div className="bg-secondary/40 flex flex-wrap gap-x-4 gap-y-1.5 border-t px-4 py-2.5">
        {SIGNALS.map((s, idx) => (
          <span key={s.key} className="text-muted-foreground flex items-center gap-1.5 text-[10.5px]">
            <span
              className="bg-primary size-2 rounded-sm"
              style={{ opacity: SHADE[idx] }}
              aria-hidden
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
