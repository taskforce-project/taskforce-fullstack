import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DeliveryInsights — illustration du bloc « Analytics ».
 *
 * L'ancien visuel était un tableau de bord générique : trois chiffres et des barres qui
 * montent. N'importe quel SaaS montre ça, ça ne prouve rien.
 *
 * Ici on montre la **seule métrique qu'un système à checkpoints peut produire** :
 * le taux de renvoi *par étape*. C'est ce qui désigne l'endroit où le processus fait
 * réellement mal — et aucun tracker classique ne peut le calculer, faute de checkpoints.
 */

const KPIS = [
  { label: "Lead time", value: "2.1 d", delta: "−18%", good: true },
  { label: "Throughput", value: "34/wk", delta: "+12%", good: true },
  { label: "Approved first time", value: "94%", delta: "+2%", good: true },
];

type Bar = { step: string; rate: number };

const BARS: Bar[] = [
  { step: "Framing", rate: 4 },
  { step: "Specification", rate: 9 },
  { step: "Approach", rate: 31 },
  { step: "Contracts", rate: 12 },
  { step: "Breakdown", rate: 6 },
  { step: "Quality checks", rate: 8 },
];

const WORST = BARS.reduce((a, b) => (b.rate > a.rate ? b : a));
const MAX = WORST.rate;

const REASONS = [
  { label: "Trade-off not explained", n: 11 },
  { label: "Conflicts with an existing decision", n: 6 },
  { label: "Scope drifted from the spec", n: 4 },
];

type Phase = "idle" | "bars" | "flagged" | "reasons";
const ORDER: Phase[] = ["idle", "bars", "flagged", "reasons"];
const MS: Record<Phase, number> = { idle: 800, bars: 1800, flagged: 1600, reasons: 4200 };

export function DeliveryInsights() {
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
  const grown = at >= 1;
  const flagged = at >= 2;
  const explained = at >= 3;

  return (
    <div ref={rootRef} className="bg-card overflow-hidden rounded-2xl border shadow-lg">
      {/* Les chiffres qu'on attend */}
      <div className="grid grid-cols-3 divide-x border-b">
        {KPIS.map((k) => (
          <div key={k.label} className="p-4">
            <div className="text-muted-foreground text-[10.5px]">{k.label}</div>
            <div className="font-display mt-1 text-[19px] leading-none font-medium text-foreground">
              {k.value}
            </div>
            <div className="mt-1 text-[10.5px] text-emerald-600">{k.delta}</div>
          </div>
        ))}
      </div>

      {/* Le chiffre que personne d'autre ne peut sortir */}
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[12px] font-medium text-foreground">Sent back, by checkpoint</span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[9.5px] font-semibold tracking-wide text-amber-700 uppercase">
            Beta
          </span>
          <span className="text-muted-foreground ml-auto text-[10.5px]">last 30 days</span>
        </div>

        <ul className="flex flex-col gap-2">
          {BARS.map((b, idx) => {
            const isWorst = b.step === WORST.step;
            const hot = flagged && isWorst;
            return (
              <li key={b.step} className="flex items-center gap-3">
                <span
                  className={cn(
                    "w-[86px] shrink-0 truncate text-[11px] transition-colors duration-500",
                    hot ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {b.step}
                </span>
                <span className="bg-secondary h-2 flex-1 overflow-hidden rounded-full">
                  <span
                    className={cn(
                      "block h-full rounded-full transition-[width,background-color] duration-700 ease-out",
                      hot ? "bg-amber-500" : flagged ? "bg-primary/35" : "bg-primary",
                    )}
                    style={{
                      width: grown ? `${(b.rate / MAX) * 100}%` : "0%",
                      transitionDelay: `${idx * 70}ms`,
                    }}
                  />
                </span>
                <span
                  className={cn(
                    "w-8 shrink-0 text-right font-mono text-[11px] tabular-nums transition-[opacity,color] duration-500",
                    grown ? "opacity-100" : "opacity-0",
                    hot ? "font-semibold text-amber-700" : "text-muted-foreground",
                  )}
                >
                  {b.rate}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* La lecture — place réservée en permanence */}
      <div className="min-h-[104px] border-t bg-amber-50/40 px-4 py-3">
        <p
          className={cn(
            "flex items-start gap-2 text-[11.5px] leading-5 transition-opacity duration-500",
            flagged ? "opacity-100" : "opacity-0",
          )}
        >
          <TriangleAlert className="mt-[2px] size-3.5 shrink-0 text-amber-600" strokeWidth={2} />
          <span className="text-foreground">
            <span className="font-medium">{WORST.step}</span> is where your process actually hurts —
            nearly a third of runs go back there.
          </span>
        </p>

        <ul
          className={cn(
            "mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-5 transition-opacity duration-500",
            explained ? "opacity-100" : "opacity-0",
          )}
        >
          {REASONS.map((r) => (
            <li key={r.label} className="text-muted-foreground text-[11px]">
              {r.label}{" "}
              <span className="text-foreground font-mono tabular-nums">({r.n})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
