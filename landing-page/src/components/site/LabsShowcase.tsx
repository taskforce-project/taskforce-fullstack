import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Bot, Brain, Cpu, RefreshCw, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LabsShowcase — les sujets de recherche présentés en FEATURES (onglets), pas en grille plate.
 * Retour user (03/08) : « faut innover, système de tabs, chaque sujet a son storytelling — pourquoi,
 * le but, où on en est, les docs/démos ». Îlot React autonome (pas de dépendance : useState maison).
 * Données passées en prop depuis `index.astro` (source unique `labs.ts`). D11 : direction, pas mécanisme.
 * Les dégradés de trait (`labs-ic-*`) viennent de <LabsGradientDefs/>, présent sur la page.
 */

type Subject = {
  key: string;
  name: string;
  lead: string;
  why: string;
  exploring: string[];
  status: string;
  links: { href: string; label: string }[];
  at: string;
  href: string;
  mat: string;
  exp: string;
};

const ICONS: Record<string, typeof Bot> = {
  "agent-roles": Bot,
  "run-memory": Brain,
  "model-choice": Cpu,
  "learning-from-reviews": RefreshCw,
};
const GRAD: Record<string, string> = {
  "agent-roles": "labs-ic-a",
  "run-memory": "labs-ic-b",
  "model-choice": "labs-ic-d",
  "learning-from-reviews": "labs-ic-e",
};
const MAT_BADGE: Record<string, string> = {
  live: "border-emerald-200 bg-emerald-50 text-emerald-700",
  beta: "border-amber-200 bg-amber-50 text-amber-700",
  planned: "border-slate-200 bg-slate-100 text-slate-600",
};
const MAT_LABEL: Record<string, string> = { live: "Live", beta: "Beta", planned: "Planned" };
const MAT_DOT: Record<string, string> = {
  live: "bg-emerald-500",
  beta: "bg-amber-500",
  planned: "bg-slate-400",
};

export function LabsShowcase({ subjects }: { subjects: Subject[] }) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(to: number) {
    const n = (to + subjects.length) % subjects.length;
    setActive(n);
    tabRefs.current[n]?.focus();
  }
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      move(i + 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      move(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(subjects.length - 1);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:gap-10">
      {/* ── Rail des sujets (onglets) ── */}
      <div
        role="tablist"
        aria-label="Research subjects"
        aria-orientation="vertical"
        className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        {subjects.map((s, i) => {
          const Icon = ICONS[s.key];
          const on = i === active;
          return (
            <button
              key={s.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`labtab-${s.key}`}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`labpanel-${s.key}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "group relative flex min-w-[230px] shrink-0 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all lg:min-w-0",
                on
                  ? "border-border bg-card shadow-sm"
                  : "border-transparent hover:border-border hover:bg-card/60",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-2.5 left-0 w-[3px] rounded-full transition-opacity",
                  on ? "labs-g5 opacity-100" : "opacity-0",
                )}
              />
              <Icon className={cn("size-5 shrink-0", GRAD[s.key])} strokeWidth={1.9} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] font-semibold text-foreground">{s.name}</span>
                <span className="text-muted-foreground truncate font-mono text-[11px]">{s.exp}</span>
              </span>
              <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", MAT_DOT[s.mat] ?? "bg-slate-400")} />
            </button>
          );
        })}
      </div>

      {/* ── Panneau du sujet actif ── */}
      <div className="relative">
        {subjects.map((s, i) => {
          const Icon = ICONS[s.key];
          return (
            <div
              key={s.key}
              id={`labpanel-${s.key}`}
              role="tabpanel"
              aria-labelledby={`labtab-${s.key}`}
              hidden={i !== active}
              className="bg-card overflow-hidden rounded-2xl border p-6 sm:p-8 lg:p-10"
            >
              {/* En-tête */}
              <div className="flex flex-wrap items-center gap-2.5">
                <Icon className={cn("size-9", GRAD[s.key])} strokeWidth={1.75} />
                <span className="labs-gtext font-mono text-[12px] font-semibold tracking-wide">{s.exp}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] text-sky-700 uppercase">
                  <span aria-hidden className="text-[12px] leading-none">◌</span>
                  Research
                </span>
              </div>
              <h3 className="t-h2 mt-4">{s.name}</h3>
              <p className="t-lead mt-3 max-w-2xl">{s.lead}</p>

              {/* Pourquoi + Où on en est */}
              <div className="mt-8 grid gap-6 border-t pt-8 sm:grid-cols-2">
                <div>
                  <p className="labs-gtext font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
                    Why it matters
                  </p>
                  <p className="mt-2.5 text-[14px] leading-6 text-foreground">{s.why}</p>
                </div>
                <div>
                  <p className="labs-gtext font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
                    Where it stands
                  </p>
                  <p className="mt-2.5 text-[14px] leading-6 text-foreground">{s.status}</p>
                </div>
              </div>

              {/* Le but : les questions ouvertes */}
              <div className="mt-8">
                <p className="labs-gtext font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
                  What we're chasing
                </p>
                <ul className="mt-3 grid gap-2.5 md:grid-cols-3">
                  {s.exploring.map((e, j) => (
                    <li
                      key={j}
                      className="bg-secondary/50 flex flex-col gap-2 rounded-xl border p-4"
                    >
                      <span className="text-primary font-mono text-[11px] font-semibold">H{j + 1}</span>
                      <span className="text-[13.5px] leading-5 text-foreground">{e}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Aller plus loin : surface produit + roadmap */}
              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 border-t pt-6">
                <span className="text-muted-foreground text-[12.5px] font-medium">Go deeper</span>
                <a
                  href={s.href}
                  className="hover:border-primary/40 hover:text-primary bg-card inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium text-foreground transition-colors"
                >
                  {s.at}
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold",
                      MAT_BADGE[s.mat] ?? MAT_BADGE.planned,
                    )}
                  >
                    {MAT_LABEL[s.mat] ?? "Planned"}
                  </span>
                  <ArrowUpRight className="size-3.5" />
                </a>
                {s.links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className="link-underline inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground"
                  >
                    {l.label}
                    <ArrowRight className="size-3.5" />
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
