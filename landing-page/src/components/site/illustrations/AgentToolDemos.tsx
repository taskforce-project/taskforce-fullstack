import { useEffect, useRef, useState, type RefObject } from "react";
import { Search, PenLine, Plug, Check } from "lucide-react";
import { BrandLogo } from "../BrandLogo";
import { cn } from "@/lib/utils";

/**
 * AgentToolDemos - 3 mini-illustrations ANIMÉES (locales, sans dépendance) posées en haut des
 * cartes « Search your Memory / Take notes / Use connected tools » de la page Agents.
 * Chacune se joue seule, en boucle douce, UNIQUEMENT à l'écran (IntersectionObserver) et se fige
 * si `prefers-reduced-motion`. DA « traits » : carré, filet 1px, aucun ombrage, accents teintés.
 */

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

const SHELL = "relative h-[132px] overflow-hidden border bg-card";

/* ── 1) Search your Memory - la requête se tape seule, puis deux souvenirs remontent. ── */
const QUERY = "Why Postgres over Mongo?";
const HITS = [
  { color: "#059669", key: "ADR-014", text: "Postgres over Mongo - chosen" },
  { color: "#d97706", key: "Constraint", text: "EU data residency (GDPR)" },
];

export function MemorySearchDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const { inView, reduced } = useInViewReduced(ref);
  const [n, setN] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setN(QUERY.length);
      setShow(true);
      return;
    }
    let alive = true;
    let t = 0;
    const run = () => {
      setN(0);
      setShow(false);
      let i = 0;
      const type = () => {
        if (!alive) return;
        i += 1;
        setN(i);
        if (i < QUERY.length) t = window.setTimeout(type, 52);
        else
          t = window.setTimeout(() => {
            if (!alive) return;
            setShow(true);
            t = window.setTimeout(run, 2800);
          }, 380);
      };
      t = window.setTimeout(type, 500);
    };
    run();
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [inView, reduced]);

  return (
    <div ref={ref} className={SHELL}>
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <Search className="size-3.5 shrink-0" strokeWidth={2} style={{ color: "#0891b2" }} />
        <span className="text-foreground text-[12px]">
          {QUERY.slice(0, n)}
          <span
            className={cn(
              "ml-px inline-block h-3 w-px translate-y-0.5 bg-foreground/70",
              show ? "opacity-0" : "animate-pulse",
            )}
          />
        </span>
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        {HITS.map((h, i) => (
          <div
            key={h.key}
            className={cn(
              "flex items-center gap-2 border px-2.5 py-1.5 transition-all duration-500",
              show ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
            )}
            style={{ transitionDelay: `${i * 160}ms` }}
          >
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: h.color }} />
            <span className="text-muted-foreground truncate text-[11px]">
              <span className="text-foreground font-medium">{h.key}</span> · {h.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 2) Take notes - trois lignes s'écrivent l'une après l'autre, puis « Saved to graph ». ── */
const LINES = [72, 92, 58];

export function TakeNotesDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const { inView, reduced } = useInViewReduced(ref);
  const [written, setWritten] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setWritten(LINES.length);
      setSaved(true);
      return;
    }
    let alive = true;
    let t = 0;
    const run = () => {
      setWritten(0);
      setSaved(false);
      let i = 0;
      const next = () => {
        if (!alive) return;
        i += 1;
        setWritten(i);
        if (i < LINES.length) t = window.setTimeout(next, 600);
        else
          t = window.setTimeout(() => {
            if (!alive) return;
            setSaved(true);
            t = window.setTimeout(run, 2600);
          }, 520);
      };
      t = window.setTimeout(next, 500);
    };
    run();
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [inView, reduced]);

  return (
    <div ref={ref} className={SHELL}>
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <PenLine className="size-3.5 shrink-0" strokeWidth={2} style={{ color: "#9333ea" }} />
        <span className="text-foreground text-[12px] font-medium">New note</span>
        <span className="text-muted-foreground ml-auto text-[10.5px]">→ Memory graph</span>
      </div>
      <div className="flex flex-col gap-2 p-3.5">
        {LINES.map((w, i) => (
          <span key={i} className="bg-secondary h-2 overflow-hidden rounded-full">
            <span
              className="bg-primary/45 block h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: i < written ? `${w}%` : "0%" }}
            />
          </span>
        ))}
        <span
          className={cn(
            "mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 transition-opacity duration-500",
            saved ? "opacity-100" : "opacity-0",
          )}
        >
          <Check className="size-3" strokeWidth={3} /> Saved to graph
        </span>
      </div>
    </div>
  );
}

/* ── 3) Use connected tools - l'actif défile ; lecture = done, écriture = waits for you. ── */
const CONNS = [
  { brand: "github", label: "GitHub", act: "read PR", write: false },
  { brand: "slack", label: "Slack", act: "post update", write: true },
  { brand: "linear", label: "Linear", act: "read issue", write: false },
];

export function ConnectedToolsDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const { inView, reduced } = useInViewReduced(ref);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % CONNS.length), 1900);
    return () => window.clearInterval(id);
  }, [inView, reduced]);

  const cur = CONNS[active];
  return (
    <div ref={ref} className={SHELL}>
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <Plug className="size-3.5 shrink-0" strokeWidth={2} style={{ color: "#4f46e5" }} />
        <span className="text-foreground text-[12px] font-medium">Connected tools</span>
      </div>
      <div className="p-3">
        <div className="flex gap-1.5">
          {CONNS.map((t, i) => (
            <span
              key={t.brand}
              className={cn(
                "flex flex-1 items-center justify-center border py-1.5 transition-colors duration-300",
                i === active ? "border-primary/40 bg-primary/[0.04]" : "border-border",
              )}
            >
              <BrandLogo brand={t.brand} label={t.label} className="size-4" />
            </span>
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-2 text-[11px]">
          <span className="tf-pulse text-primary size-1.5 shrink-0 rounded-full bg-current" />
          <span className="text-foreground font-medium">{cur.label}</span>
          <span className="text-muted-foreground truncate">· {cur.act}</span>
          {cur.write ? (
            <span className="ml-auto inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-700">
              waits for you
            </span>
          ) : (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[10px] text-emerald-600">
              <Check className="size-3" strokeWidth={3} /> done
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
