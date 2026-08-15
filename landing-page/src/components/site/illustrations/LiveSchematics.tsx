import { useEffect, useRef, useState, type RefObject } from "react";
import { ShieldCheck, Boxes } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LiveSchematics — mini-illustrations ANIMÉES (locales, sans dépendance) qui remplacent des
 * ScreenPlaceholder par une vraie preuve visuelle. Même contrat que AgentToolDemos :
 * self-play, joué UNIQUEMENT à l'écran (IntersectionObserver), figé si prefers-reduced-motion.
 * DA « traits » : carré, filet 1px, aucun ombrage, accents teintés.
 */

function useInViewReduced(ref: RefObject<HTMLElement>) {
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

/* ── Audit trail — les approbations tombent une à une (who · what · when). ── */
const ENTRIES = [
  { color: "#059669", type: "Spec", what: "Payments API", who: "Inès", when: "2m" },
  { color: "#4f46e5", type: "External action", what: "Slack · post update", who: "Léo", when: "just now", write: true },
  { color: "#db2777", type: "Assignment", what: "Claude Code", who: "Maya", when: "5m" },
  { color: "#d97706", type: "Spec", what: "Auth flow", who: "Inès", when: "12m" },
];

export function AuditTrailDemo({ className, compact = false }: { className?: string; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { inView, reduced } = useInViewReduced(ref);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setShown(ENTRIES.length);
      return;
    }
    let alive = true;
    let t = 0;
    const run = () => {
      setShown(0);
      let i = 0;
      const step = () => {
        if (!alive) return;
        i += 1;
        setShown(i);
        if (i < ENTRIES.length) t = window.setTimeout(step, 720);
        else t = window.setTimeout(run, 3200);
      };
      t = window.setTimeout(step, 500);
    };
    run();
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [inView, reduced]);

  return (
    <div ref={ref} className={cn("bg-card relative overflow-hidden border", className)}>
      <div className={cn("flex items-center gap-2 border-b px-4", compact ? "py-2.5" : "py-3")}>
        <ShieldCheck className="size-4 shrink-0" strokeWidth={2} style={{ color: "#d97706" }} />
        <span className="text-foreground text-[13px] font-medium">Audit trail</span>
        <span className="text-muted-foreground ml-auto font-mono text-[10.5px] tracking-wide uppercase">
          who · what · when
        </span>
      </div>
      <ul className="divide-y divide-border">
        {ENTRIES.map((e, i) => (
          <li
            key={`${e.type}-${e.what}`}
            className={cn(
              "flex items-center gap-3 px-4 transition-all duration-500",
              compact ? "py-1.5" : "py-3",
              i < shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: e.color }} />
            <span className="min-w-0 flex-1">
              <span className="text-foreground block truncate text-[12.5px]">
                <span className="font-medium">{e.type}</span> · {e.what}
              </span>
              {!compact && <span className="text-muted-foreground block text-[11px]">approved by {e.who}</span>}
            </span>
            {compact && <span className="text-muted-foreground shrink-0 text-[11px]">{e.who}</span>}
            {e.write && (
              <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-700">
                write
              </span>
            )}
            <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">{e.when}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Decision record — un décision devient un OBJET : les champs se remplissent, puis « linked in Memory ». ── */
const FIELDS = [
  { k: "Decision", v: "Postgres over MongoDB" },
  { k: "Because", v: "EU data residency (GDPR)" },
  { k: "Rejected", v: "MongoDB Atlas — data leaves EU" },
  { k: "Shaped", v: "3 files · schema, migration, config" },
];

export function DecisionRecordDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const { inView, reduced } = useInViewReduced(ref);
  const [n, setN] = useState(0);
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setN(FIELDS.length);
      setLinked(true);
      return;
    }
    let alive = true;
    let t = 0;
    const run = () => {
      setN(0);
      setLinked(false);
      let i = 0;
      const step = () => {
        if (!alive) return;
        i += 1;
        setN(i);
        if (i < FIELDS.length) t = window.setTimeout(step, 640);
        else
          t = window.setTimeout(() => {
            if (!alive) return;
            setLinked(true);
            t = window.setTimeout(run, 3400);
          }, 620);
      };
      t = window.setTimeout(step, 550);
    };
    run();
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [inView, reduced]);

  return (
    <div ref={ref} className="bg-card relative overflow-hidden border">
      <div className="flex items-center gap-2 border-b px-5 py-3.5">
        <Boxes className="size-4 shrink-0" strokeWidth={1.75} style={{ color: "#4f46e5" }} />
        <span className="text-foreground text-[13px] font-medium">Decision · ADR-014</span>
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 transition-opacity duration-500",
            linked ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="tf-pulse size-1.5 rounded-full bg-current" /> linked in Memory
        </span>
      </div>
      <dl className="bg-border grid gap-px sm:grid-cols-2">
        {FIELDS.map((f, i) => (
          <div
            key={f.k}
            className={cn("bg-card px-5 py-4 transition-opacity duration-500", i < n ? "opacity-100" : "opacity-40")}
          >
            <dt className="text-muted-foreground text-[11px] tracking-wide uppercase">{f.k}</dt>
            <dd className="text-foreground mt-1 min-h-[1.25rem] text-[13.5px]">{i < n ? f.v : ""}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
