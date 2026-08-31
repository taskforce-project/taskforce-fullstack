import { useEffect, useRef, useState } from "react";
import { Bot, Brain, Cpu, RefreshCw, ArrowRight, type LucideIcon } from "lucide-react";
import { LABS } from "@/lib/labs";
import { cn } from "@/lib/utils";

/**
 * ResearchLog - signature #3 : le « carnet de recherche » à rail collant + scroll-spy.
 *
 * Colonne gauche = un index 2026 qui reste collé (CSS sticky) pendant que les entrées défilent ;
 * un IntersectionObserver surligne l'expérience au centre du viewport. Pas de fausses notes datées :
 * les entrées SONT les 4 vraies expériences (src/lib/labs.ts), reformatées en carnet.
 *
 * Honnêteté : aucune n'est « Live ». Toutes sont de la RECHERCHE (◌) ; chacune indique où sa
 * direction affleure dans le produit, avec le vrai badge de maturité de cette surface.
 */

const ICONS: Record<string, LucideIcon> = {
  "agent-roles": Bot,
  "run-memory": Brain,
  "model-choice": Cpu,
  "learning-from-reviews": RefreshCw,
};

type Mat = "live" | "beta" | "planned";
const SURFACES: Record<string, { at: string; href: string; mat: Mat }> = {
  "agent-roles": { at: "Orchestration", href: "/product/orchestration", mat: "planned" },
  "run-memory": { at: "TaskForce Memory", href: "/product/brain-os", mat: "beta" },
  "model-choice": { at: "Your models", href: "/enterprise", mat: "live" },
  "learning-from-reviews": { at: "Prediction & calibration", href: "/product/orchestration", mat: "planned" },
};
const MAT_LABEL: Record<Mat, string> = { live: "Live", beta: "Beta", planned: "Planned" };

export default function ResearchLog({ omit = [] }: { omit?: string[] } = {}) {
  const ENTRIES = Object.values(LABS).filter((l) => !omit.includes(l.key));
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        let best = -1;
        let bestRatio = 0;
        for (const e of entries) {
          const idx = Number((e.target as HTMLElement).dataset.idx);
          if (e.isIntersecting && e.intersectionRatio >= bestRatio) {
            bestRatio = e.intersectionRatio;
            best = idx;
          }
        }
        if (best >= 0) setActive(best);
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="grid gap-10 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-16">
      {/* ── Rail collant (desktop) ── */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 self-start">
          <p className="font-mono text-[11px] tracking-[0.18em] text-[color:var(--labs-violet)] uppercase">
            2026 · Research log
          </p>
          <ol className="mt-5 flex flex-col">
            {ENTRIES.map((lab, i) => {
              const on = active === i;
              return (
                <li key={lab.key}>
                  <a
                    href={`#exp-${lab.key}`}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "group flex items-center gap-3 border-l py-2.5 pl-4 transition-colors",
                      on
                        ? "border-[color:var(--labs-violet)] text-[color:var(--labs-fg)]"
                        : "border-[color:var(--labs-line)] text-[color:var(--labs-muted)] hover:text-[color:var(--labs-fg)]",
                    )}
                  >
                    <span className="font-mono text-[11px] tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[13px]">{lab.name}</span>
                  </a>
                </li>
              );
            })}
          </ol>
          <p className="mt-5 font-mono text-[10.5px] text-[color:var(--labs-faint)]">
            {ENTRIES.length} open · all research
          </p>
        </div>
      </aside>

      {/* ── Entrées ── */}
      <div className="flex flex-col gap-4">
        {ENTRIES.map((lab, i) => {
          const Icon = ICONS[lab.key];
          const s = SURFACES[lab.key];
          return (
            <article
              key={lab.key}
              id={`exp-${lab.key}`}
              data-idx={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="labs-panel labs-panel-hover scroll-mt-24 p-6 sm:p-7"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] tracking-[0.12em] text-[color:var(--labs-violet)]">
                  EXP-{String(i + 1).padStart(2, "0")}
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-sky-300 uppercase">
                  <span aria-hidden className="text-[13px] leading-none">◌</span>
                  Research
                </span>
              </div>

              <div className="mt-4 flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[color:var(--labs-line)] bg-white/[0.03] text-[color:var(--labs-violet)]">
                  {Icon && <Icon className="size-5" strokeWidth={1.75} />}
                </span>
                <div className="min-w-0">
                  <h3 className="labs-h3">{lab.name}</h3>
                  <p className="mt-1.5 text-[14px] leading-6 text-[color:var(--labs-muted)]">{lab.lead}</p>
                </div>
              </div>

              <ul className="mt-5 flex flex-col gap-1.5 border-t border-[color:var(--labs-line)] pt-5">
                {lab.exploring.map((e, hi) => (
                  <li key={hi} className="flex items-start gap-2.5">
                    <span className="mt-px font-mono text-[10.5px] font-semibold text-[color:var(--labs-faint)]">
                      H{hi + 1}
                    </span>
                    <span className="text-[13px] leading-5 text-[color:var(--labs-muted)]">{e}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 font-mono text-[11px] text-[color:var(--labs-faint)]">
                  surfaces in
                  <a href={s.href} className="text-[color:var(--labs-muted)] hover:text-[color:var(--labs-fg)]">
                    {s.at}
                  </a>
                  <Chip mat={s.mat} />
                </span>
                <a
                  href={`/labs/${lab.key}`}
                  className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[color:var(--labs-blue)] hover:underline"
                >
                  Open the experiment
                  <ArrowRight className="size-3.5" />
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ mat }: { mat: Mat }) {
  const styles: Record<Mat, string> = {
    live: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    beta: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    planned: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px font-mono text-[9.5px] font-semibold tracking-wide uppercase",
        styles[mat],
      )}
    >
      {MAT_LABEL[mat]}
    </span>
  );
}
