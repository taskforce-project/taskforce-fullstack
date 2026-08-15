import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { FileText, Network, ListTree, User, Check, ArrowDown, ArrowRight, Brain, Server, Cpu, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LabsConcepts — 1 mini-illustration par direction de recherche. Chaque petit composant (l'« insight »)
 * ENTRE en reveal staggered UNE fois à l'arrivée à l'écran, puis reste (pas de boucle) — façon Attio :
 * ça se construit quand on arrive, ça attire l'œil, puis c'est posé. D11 : concept (chip « concept »),
 * jamais un mécanisme livré. Visible d'emblée si prefers-reduced-motion / pas d'IntersectionObserver.
 */

/** Révèle UNE fois quand l'élément entre à l'écran (fade+slide du conteneur). */
function useReveal(ref: RefObject<HTMLElement | null>) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setEntered(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setEntered(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return entered;
}

/** Avance 0→count en STAGGER, UNE fois à l'entrée, puis garde l'état complet (pas de boucle). */
function useSequence(ref: RefObject<HTMLElement | null>, count: number, step = 300) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(count);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let alive = true;
    let t = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        let i = 0;
        const next = () => {
          if (!alive) return;
          i += 1;
          setN(i);
          if (i < count) t = window.setTimeout(next, step);
        };
        t = window.setTimeout(next, 320);
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => {
      alive = false;
      window.clearTimeout(t);
      io.disconnect();
    };
  }, [ref, count, step]);
  return n;
}

const REVEAL = "transition-all duration-500 ease-out";
const rev = (on: boolean) => (on ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0");
const CARD = "transition-all duration-700 ease-out";
const card = (on: boolean) => (on ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0");

function ConceptShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-card border">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <span className="labs-gtext font-mono text-[11px] font-semibold tracking-[0.12em] uppercase">{label}</span>
        <span className="ml-auto inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-[0.1em] text-sky-700 uppercase">
          concept
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ── agent-roles — les rôles cadrés + leurs portes « human » se posent l'un après l'autre. ── */
const HANDOFF = [
  { role: "Product", artifact: "Problem + spec", icon: FileText },
  { role: "Architecture", artifact: "API contract", icon: Network },
  { role: "Delivery", artifact: "3 issues ready", icon: ListTree },
];
function RolesHandoff() {
  const ref = useRef<HTMLDivElement>(null);
  const entered = useReveal(ref);
  const n = useSequence(ref, 5, 300); // 3 rôles + 2 portes, entrelacés
  return (
    <div ref={ref} className={cn(CARD, card(entered))}>
      <ConceptShell label="Scoped roles">
        <div className="flex items-stretch gap-1">
          {HANDOFF.map((h, i) => {
            const Icon = h.icon;
            return (
              <Fragment key={h.role}>
                <div className={cn("border-border flex flex-1 flex-col gap-1.5 border p-2.5", REVEAL, rev(2 * i < n))}>
                  <div className="flex items-center gap-1.5">
                    <Icon className="text-primary size-3.5 shrink-0" strokeWidth={2} />
                    <span className="text-foreground text-[11px] font-semibold">{h.role}</span>
                  </div>
                  <span className="text-foreground text-[10.5px] leading-tight">{h.artifact}</span>
                </div>
                {i < HANDOFF.length - 1 && (
                  <div className={cn("flex shrink-0 flex-col items-center justify-center gap-0.5 px-0.5", REVEAL, rev(2 * i + 1 < n))}>
                    <span className="flex size-4 items-center justify-center rounded-full border border-emerald-300 bg-emerald-500 text-white">
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                    <span className="text-muted-foreground text-[7.5px] leading-none">human</span>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-[11px]">
          <User className="size-3 shrink-0" strokeWidth={2} /> each role hands a reviewed artifact to the next
        </p>
      </ConceptShell>
    </div>
  );
}

/* ── run-memory — Run 1 → 3 décisions nommées → Memory → Run 2, chaque pièce se pose l'une après l'autre. ── */
const DECISIONS = [
  { k: "DB", v: "Postgres · EU residency" },
  { k: "API", v: "Idempotent keys" },
  { k: "Rejected", v: "Mongo Atlas" },
];
function MemoryCarry() {
  const ref = useRef<HTMLDivElement>(null);
  const entered = useReveal(ref);
  const n = useSequence(ref, 6, 280); // Run1 · 3 décisions · Memory · Run2
  const kept = Math.min(Math.max(n - 1, 0), 3);
  return (
    <div ref={ref} className={cn(CARD, card(entered))}>
      <ConceptShell label="Carried across runs">
        <div className="flex flex-col gap-1.5">
          <div className={cn("border-border border px-2.5 py-2", REVEAL, rev(0 < n))}>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-foreground font-medium">Run 1</span>
              <span className="text-muted-foreground">decides · constrains · rejects</span>
            </div>
            <div className="mt-1.5 flex flex-col gap-1">
              {DECISIONS.map((d, i) => (
                <span key={d.k} className={cn("inline-flex items-center gap-1.5 text-[10.5px]", REVEAL, rev(i + 1 < n))}>
                  <span className="bg-primary/60 size-1 rounded-full" />
                  <span className="text-muted-foreground">
                    <span className="text-foreground font-medium">{d.k}</span> · {d.v}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <ArrowDown className={cn("text-primary mx-auto size-3.5", REVEAL, rev(4 < n))} strokeWidth={2} />
          <div className={cn("border-border flex items-center gap-2 border px-2.5 py-1.5", REVEAL, rev(4 < n))}>
            <Brain className="size-3.5 shrink-0" strokeWidth={2} style={{ color: "#c026d3" }} />
            <span className="text-foreground text-[11px] font-medium">Memory</span>
            <span className="text-muted-foreground ml-auto font-mono text-[10px] tabular-nums">{kept} kept</span>
          </div>
          <ArrowDown className={cn("mx-auto size-3.5 text-emerald-500", REVEAL, rev(5 < n))} strokeWidth={2} />
          <div className={cn("flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-2.5 py-1.5", REVEAL, rev(5 < n))}>
            <span className="text-foreground text-[11px] font-medium">Run 2</span>
            <span className="text-[10.5px] text-emerald-700">loads 3 decisions · starts ahead</span>
          </div>
        </div>
      </ConceptShell>
    </div>
  );
}

/* ── model-choice — chaque étape reçoit son modèle (+ la raison), ligne après ligne. ── */
const ROUTES = [
  { step: "Draft spec", model: "Local", reason: "on your hardware", icon: Server },
  { step: "Generate code", model: "Hosted", reason: "stronger model", icon: Cpu },
  { step: "Review & lint", model: "Local", reason: "fast · low cost", icon: Server },
];
function ModelPerStep() {
  const ref = useRef<HTMLDivElement>(null);
  const entered = useReveal(ref);
  const n = useSequence(ref, ROUTES.length, 320);
  return (
    <div ref={ref} className={cn(CARD, card(entered))}>
      <ConceptShell label="A model per step">
        <ul className="flex flex-col gap-2">
          {ROUTES.map((r, i) => {
            const Icon = r.icon;
            return (
              <li key={r.step} className={cn("border-border flex items-center gap-2 border px-2.5 py-2", REVEAL, rev(i < n))}>
                <span className="text-foreground w-[84px] shrink-0 text-[11px] font-medium">{r.step}</span>
                <ArrowRight className="text-primary size-3 shrink-0" strokeWidth={2.5} />
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="text-foreground size-3.5 shrink-0" strokeWidth={2} />
                  <span className="text-foreground text-[11px] font-semibold">{r.model}</span>
                </span>
                <span className="text-muted-foreground ml-auto text-[10px]">{r.reason}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground mt-3 text-[10.5px]">routed by need — privacy, strength, cost — not one model for all</p>
      </ConceptShell>
    </div>
  );
}

/* ── learning-from-reviews — les tours se posent l'un après l'autre ; l'édition rétrécit → accepted. ── */
const ROUNDS = [
  { fit: 30, label: "big edit" },
  { fit: 65, label: "small edit" },
  { fit: 100, label: "accepted" },
];
function ReviewCalibrate() {
  const ref = useRef<HTMLDivElement>(null);
  const entered = useReveal(ref);
  const n = useSequence(ref, ROUNDS.length, 360);
  return (
    <div ref={ref} className={cn(CARD, card(entered))}>
      <ConceptShell label="Overrides calibrate">
        <div className="grid grid-cols-3 gap-2">
          {ROUNDS.map((rd, i) => {
            const on = i < n;
            const accepted = rd.fit === 100;
            return (
              <div key={i} className={cn("border-border flex flex-col gap-1.5 border p-2", REVEAL, rev(on))}>
                <span className="text-muted-foreground font-mono text-[9.5px]">Round {i + 1}</span>
                <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-700 ease-out", accepted ? "bg-emerald-500" : "bg-primary/50")}
                    style={{ width: on ? `${rd.fit}%` : "0%" }}
                  />
                </div>
                <span className={cn("inline-flex items-center gap-1 text-[9.5px]", accepted ? "text-emerald-600" : "text-muted-foreground")}>
                  {accepted ? (
                    <>
                      <Check className="size-2.5" strokeWidth={3} /> accepted
                    </>
                  ) : (
                    <>
                      <PenLine className="size-2.5" strokeWidth={2} /> {rd.label}
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-3 text-[10.5px]">each correction is a signal — the next proposal lands closer</p>
      </ConceptShell>
    </div>
  );
}

export function LabsConcept({ kind }: { kind: string }) {
  switch (kind) {
    case "agent-roles":
      return <RolesHandoff />;
    case "run-memory":
      return <MemoryCarry />;
    case "model-choice":
      return <ModelPerStep />;
    case "learning-from-reviews":
      return <ReviewCalibrate />;
    default:
      return null;
  }
}
