import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
import { Check, FileText, GitPullRequest, ListTree, Brain, ClipboardCheck, Network, Workflow, LayoutGrid, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * UseCaseDemo — une mini-illustration ANIMÉE par use-case, pilotée par la donnée (`c.demo`).
 * 5 formes distinctes (draft / check / split / recall / pr) → chaque page use-case se DÉMONTRE
 * au lieu de reprendre le même flux. Même contrat que AgentToolDemos : self-play, joué à l'écran,
 * figé si prefers-reduced-motion. DA « traits » : carré, filet 1px, sans ombre, accents teintés.
 */

export type UseCaseDemoSpec =
  | { kind: "draft"; title: string; chip: string; items: string[] }
  | { kind: "check"; title: string; items: string[] }
  | { kind: "split"; source: string; items: { label: string; est: string }[] }
  | { kind: "recall"; query: string; hits: { k: string; t: string }[] }
  | { kind: "pr"; title: string; issue: string; stages: string[] }
  | { kind: "graph"; title: string; center: string; nodes: string[] }
  | { kind: "pipeline"; title: string; stages: string[] }
  | { kind: "board"; title: string; columns: { name: string; cards: string[] }[] };

function useInViewReduced(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return { inView, reduced };
}

/** Révèle les items 1→count en boucle ; renvoie combien sont visibles (count = tous si reduced). */
function useSequence(ref: RefObject<HTMLElement | null>, count: number, step = 620, hold = 2600) {
  const { inView, reduced } = useInViewReduced(ref);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setShown(count);
      return;
    }
    let alive = true;
    let t = 0;
    const run = () => {
      setShown(0);
      let i = 0;
      const next = () => {
        if (!alive) return;
        i += 1;
        setShown(i);
        if (i < count) t = window.setTimeout(next, step);
        else t = window.setTimeout(run, hold);
      };
      t = window.setTimeout(next, 450);
    };
    run();
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [inView, reduced, count, step, hold]);
  return shown;
}

const SHELL = "bg-card relative overflow-hidden border";
const HEAD = "flex items-center gap-2 border-b px-4 py-2.5";

function Draft({ d, className }: { d: Extract<UseCaseDemoSpec, { kind: "draft" }>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useSequence(ref, d.items.length + 1, 560, 2800);
  const done = shown > d.items.length;
  return (
    <div ref={ref} className={cn(SHELL, className)}>
      <div className={HEAD}>
        <FileText className="size-3.5 shrink-0" strokeWidth={2} style={{ color: "#2563eb" }} />
        <span className="text-foreground text-[12.5px] font-medium">{d.title}</span>
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 transition-opacity duration-500",
            done ? "opacity-100" : "opacity-0",
          )}
        >
          <Check className="size-2.5" strokeWidth={3} /> {d.chip}
        </span>
      </div>
      <ul className="flex flex-col gap-2 p-4">
        {d.items.map((it, i) => (
          <li
            key={it}
            className={cn(
              "flex items-start gap-2.5 text-[12.5px] transition-all duration-500",
              i < shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            <span className="bg-primary/50 mt-1.5 size-1.5 shrink-0 rounded-full" />
            <span className="text-foreground leading-5">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckList({ d, className }: { d: Extract<UseCaseDemoSpec, { kind: "check" }>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useSequence(ref, d.items.length, 560, 2600);
  return (
    <div ref={ref} className={cn(SHELL, className)}>
      <div className={HEAD}>
        <ClipboardCheck className="size-3.5 shrink-0" strokeWidth={2} style={{ color: "#059669" }} />
        <span className="text-foreground text-[12.5px] font-medium">{d.title}</span>
      </div>
      <ul className="flex flex-col gap-2 p-4">
        {d.items.map((it, i) => {
          const on = i < shown;
          return (
            <li key={it} className="flex items-center gap-2.5 text-[12.5px]">
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center border transition-colors duration-300",
                  on ? "border-emerald-500 bg-emerald-500 text-white" : "border-border",
                )}
              >
                {on && <Check className="size-2.5" strokeWidth={3} />}
              </span>
              <span className={cn("leading-5 transition-colors", on ? "text-foreground" : "text-muted-foreground")}>
                {it}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Split({ d, className }: { d: Extract<UseCaseDemoSpec, { kind: "split" }>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useSequence(ref, d.items.length, 520, 2600);
  return (
    <div ref={ref} className={cn(SHELL, className)}>
      <div className={HEAD}>
        <ListTree className="size-3.5 shrink-0" strokeWidth={2} style={{ color: "#2563eb" }} />
        <span className="text-foreground text-[12.5px] font-medium">{d.source}</span>
        <span className="text-muted-foreground ml-auto font-mono text-[10px] tracking-wide uppercase">breakdown</span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {d.items.map((it, i) => (
          <li
            key={it.label}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 transition-all duration-500",
              i < shown ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0",
            )}
          >
            <span className="text-muted-foreground font-mono text-[11px]">{`#${i + 1}`}</span>
            <span className="text-foreground flex-1 truncate text-[12.5px]">{it.label}</span>
            <span className="text-muted-foreground shrink-0 rounded-full border px-2 py-px font-mono text-[10.5px] tabular-nums">
              {it.est}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Recall({ d, className }: { d: Extract<UseCaseDemoSpec, { kind: "recall" }>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useSequence(ref, d.hits.length, 620, 2800);
  return (
    <div ref={ref} className={cn(SHELL, className)}>
      <div className={HEAD}>
        <Brain className="size-3.5 shrink-0" strokeWidth={2} style={{ color: "#c026d3" }} />
        <span className="text-foreground truncate text-[12.5px]">{d.query}</span>
      </div>
      <ul className="flex flex-col gap-1.5 p-4">
        {d.hits.map((h, i) => (
          <li
            key={h.k}
            className={cn(
              "flex items-center gap-2.5 border px-2.5 py-1.5 transition-all duration-500",
              i < shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: "#c026d3" }} />
            <span className="text-muted-foreground truncate text-[11.5px]">
              <span className="text-foreground font-medium">{h.k}</span> · {h.t}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pr({ d, className }: { d: Extract<UseCaseDemoSpec, { kind: "pr" }>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { inView, reduced } = useInViewReduced(ref);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setPhase(d.stages.length - 1);
      return;
    }
    let alive = true;
    let t = 0;
    const tick = (i: number) => {
      if (!alive) return;
      setPhase(i);
      const nextI = i + 1;
      t = window.setTimeout(() => tick(nextI < d.stages.length ? nextI : 0), nextI < d.stages.length ? 1500 : 2400);
    };
    t = window.setTimeout(() => tick(0), 450);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [inView, reduced, d.stages.length]);
  const merged = phase === d.stages.length - 1;
  return (
    <div ref={ref} className={cn(SHELL, className)}>
      <div className={HEAD}>
        <GitPullRequest className="size-3.5 shrink-0" strokeWidth={2} style={{ color: merged ? "#7c3aed" : "#2563eb" }} />
        <span className="text-foreground text-[12.5px] font-medium">#128 · {d.title}</span>
        <span className="text-muted-foreground ml-auto font-mono text-[10.5px]">→ {d.issue}</span>
      </div>
      <div className="p-4">
        <ol className="flex items-center gap-1.5">
          {d.stages.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-1.5">
              <span
                className={cn(
                  "flex-1 border px-2 py-1 text-center text-[10.5px] font-medium transition-colors duration-300",
                  i < phase
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : i === phase
                      ? "border-primary/40 bg-primary/[0.05] text-primary"
                      : "border-border text-muted-foreground",
                )}
              >
                {s}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-[11.5px]">
          {merged ? (
            <>
              <Check className="size-3 text-emerald-600" strokeWidth={3} /> Merged — linked to {d.issue}, human-approved
            </>
          ) : (
            <>
              <span className="tf-pulse text-primary size-1.5 rounded-full bg-current" /> Linked to {d.issue} · status tracked live
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/* ── graph — une décision se LIE à ses raisons : nœuds + arêtes qui se connectent (mémoire / liens). ── */
function Graph({ d, className }: { d: Extract<UseCaseDemoSpec, { kind: "graph" }>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const n = Math.min(d.nodes.length, 3);
  const shown = useSequence(ref, n, 720, 2600);
  const cx = 150, cy = 46;
  const pos = [{ x: 56, y: 28 }, { x: 244, y: 28 }, { x: 150, y: 78 }];
  return (
    <div ref={ref} className={cn(SHELL, className)}>
      <div className={HEAD}>
        <Network className="size-3.5 shrink-0" strokeWidth={2} style={{ color: "#c026d3" }} />
        <span className="text-foreground text-[12.5px] font-medium">{d.title}</span>
      </div>
      <svg viewBox="0 0 300 96" className="h-[92px] w-full">
        {d.nodes.slice(0, n).map((label, i) => (
          <line
            key={`e-${label}`}
            x1={cx}
            y1={cy}
            x2={pos[i].x}
            y2={pos[i].y}
            stroke="#c026d3"
            strokeWidth="1.25"
            className="transition-opacity duration-500"
            style={{ opacity: i < shown ? 0.5 : 0 }}
          />
        ))}
        <circle cx={cx} cy={cy} r="5.5" fill="#7c3aed" />
        <text x={cx} y={cy + 17} textAnchor="middle" fontSize="8.5" fontWeight="600" fill="var(--foreground)">
          {d.center}
        </text>
        {d.nodes.slice(0, n).map((label, i) => (
          <g key={`n-${label}`} className="transition-opacity duration-500" style={{ opacity: i < shown ? 1 : 0 }}>
            <circle cx={pos[i].x} cy={pos[i].y} r="3.5" fill="#c026d3" />
            <text
              x={pos[i].x}
              y={pos[i].y > cy ? pos[i].y + 13 : pos[i].y - 7}
              textAnchor="middle"
              fontSize="8"
              fill="var(--muted-foreground)"
            >
              {label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ── pipeline — le run AVANCE : étapes horizontales qui s'allument l'une après l'autre (exécution). ── */
function Pipeline({ d, className }: { d: Extract<UseCaseDemoSpec, { kind: "pipeline" }>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { inView, reduced } = useInViewReduced(ref);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setActive(d.stages.length);
      return;
    }
    let alive = true;
    let t = 0;
    const run = () => {
      let i = 0;
      setActive(0);
      const step = () => {
        if (!alive) return;
        i += 1;
        setActive(i);
        if (i < d.stages.length) t = window.setTimeout(step, 760);
        else t = window.setTimeout(run, 1700);
      };
      t = window.setTimeout(step, 500);
    };
    run();
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [inView, reduced, d.stages.length]);
  const done = active >= d.stages.length;
  return (
    <div ref={ref} className={cn(SHELL, className)}>
      <div className={HEAD}>
        <Workflow className="size-3.5 shrink-0" strokeWidth={2} style={{ color: "#2563eb" }} />
        <span className="text-foreground text-[12.5px] font-medium">{d.title}</span>
      </div>
      <div className="flex items-center px-4 pt-5">
        {d.stages.map((s, i) => (
          <Fragment key={s}>
            <div
              className={cn(
                "flex-1 border px-1 py-2 text-center text-[10px] leading-tight font-medium transition-colors duration-300",
                i < active ? "border-primary/40 bg-primary/[0.06] text-primary" : "border-border text-muted-foreground",
              )}
            >
              {s}
            </div>
            {i < d.stages.length - 1 && (
              <ArrowRight
                className={cn("mx-0.5 size-3 shrink-0 transition-colors duration-300", i < active - 1 ? "text-primary" : "text-border")}
                strokeWidth={2.5}
              />
            )}
          </Fragment>
        ))}
      </div>
      <p className="text-muted-foreground mt-3 flex items-center gap-1.5 px-4 text-[11px]">
        {done ? (
          <>
            <Check className="size-3 text-emerald-600" strokeWidth={3} /> Run complete — every step approved
          </>
        ) : (
          <>
            <span className="tf-pulse text-primary size-1.5 rounded-full bg-current" /> Running · {d.stages[Math.max(0, active - 1)]}
          </>
        )}
      </p>
    </div>
  );
}

/* ── board — TON board se lit : mini-kanban, les cartes se posent par colonne (collaboration / priorités). ── */
function Board({ d, className }: { d: Extract<UseCaseDemoSpec, { kind: "board" }>; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const total = d.columns.reduce((a, c) => a + c.cards.length, 0);
  const shown = useSequence(ref, total, 460, 2600);
  let idx = 0;
  return (
    <div ref={ref} className={cn(SHELL, className)}>
      <div className={HEAD}>
        <LayoutGrid className="size-3.5 shrink-0" strokeWidth={2} style={{ color: "#0891b2" }} />
        <span className="text-foreground text-[12.5px] font-medium">{d.title}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3">
        {d.columns.map((col) => (
          <div key={col.name} className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[9.5px] font-semibold tracking-wide uppercase">{col.name}</span>
            {col.cards.map((card) => {
              const my = idx++;
              return (
                <span
                  key={card}
                  className={cn(
                    "bg-card text-foreground border px-1.5 py-1 text-[9.5px] leading-tight transition-all duration-500",
                    my < shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
                  )}
                >
                  {card}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function UseCaseDemo({ demo, className }: { demo: UseCaseDemoSpec; className?: string }) {
  switch (demo.kind) {
    case "draft":
      return <Draft d={demo} className={className} />;
    case "check":
      return <CheckList d={demo} className={className} />;
    case "split":
      return <Split d={demo} className={className} />;
    case "recall":
      return <Recall d={demo} className={className} />;
    case "pr":
      return <Pr d={demo} className={className} />;
    case "graph":
      return <Graph d={demo} className={className} />;
    case "pipeline":
      return <Pipeline d={demo} className={className} />;
    case "board":
      return <Board d={demo} className={className} />;
  }
}
