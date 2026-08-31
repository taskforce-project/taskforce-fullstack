import { useEffect, useRef, useState } from "react";
import { Cpu, Cloud, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ModelRouting - illustration du bloc « Models ».
 *
 * ⚠️ Aucune promesse de prix ici. Dire « €0 » n'est pas crédible pour un produit qui fait
 * tourner des agents, et la tarification réelle vit sur /pricing. Ce que cette illustration
 * démontre, c'est le seul point qui nous distingue vraiment : **le choix par étape** -
 * où le modèle tourne, et si la donnée sort du réseau.
 */

type Where = "local" | "hosted";
type Row = { step: string; local: string; hosted: string; hardStep: boolean };

const ROWS: Row[] = [
  { step: "Framing", local: "Qwen2.5 14B", hosted: "Qwen2.5 14B", hardStep: false },
  { step: "Specification", local: "Qwen2.5 14B", hosted: "Qwen2.5 14B", hardStep: false },
  { step: "Approach", local: "Qwen2.5 14B", hosted: "Frontier model", hardStep: true },
  { step: "Contracts", local: "Qwen2.5 14B", hosted: "Frontier model", hardStep: true },
  { step: "Breakdown", local: "Qwen2.5 14B", hosted: "Qwen2.5 14B", hardStep: false },
  { step: "Quality checks", local: "Qwen2.5 14B", hosted: "Qwen2.5 14B", hardStep: false },
];

const PROFILES = [
  {
    id: "local" as const,
    label: "Everything on your hardware",
    summary: "No request leaves your network.",
  },
  {
    id: "mixed" as const,
    label: "Hard steps hosted",
    summary: "2 of 6 steps call a hosted model. The other 4 never leave.",
  },
];

const MS = 4200;

export function ModelRouting() {
  const [p, setP] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const profile = PROFILES[p];
  const mixed = profile.id === "mixed";

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
    const t = window.setTimeout(() => setP((v) => (v + 1) % PROFILES.length), MS);
    return () => window.clearTimeout(t);
  }, [playing, p]);

  const whereOf = (r: Row): Where => (mixed && r.hardStep ? "hosted" : "local");

  return (
    <div ref={rootRef} className="bg-card overflow-hidden rounded-2xl border shadow-lg">
      {/* Le choix de profil */}
      <div className="bg-secondary/50 border-b p-3">
        <div className="bg-card flex gap-1 rounded-lg border p-1">
          {PROFILES.map((x, idx) => (
            <span
              key={x.id}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-center text-[11.5px] font-medium transition-all duration-500",
                idx === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {x.label}
            </span>
          ))}
        </div>
      </div>

      {/* Le routage, étape par étape */}
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Which model runs each step, and where</caption>
        <thead>
          <tr className="text-muted-foreground text-[10.5px] tracking-[0.05em] uppercase">
            <th scope="col" className="px-4 py-2 font-medium">Step</th>
            <th scope="col" className="px-4 py-2 font-medium">Model</th>
            <th scope="col" className="px-4 py-2 font-medium">Runs</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Leaves your network</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const where = whereOf(r);
            const out = where === "hosted";
            return (
              <tr
                key={r.step}
                className={cn(
                  "border-t transition-colors duration-500",
                  out && "bg-amber-50/50",
                )}
              >
                <td className="px-4 py-2.5 text-[12px] font-medium text-foreground">{r.step}</td>
                <td className="text-muted-foreground px-4 py-2.5 font-mono text-[11px]">
                  <span className="transition-opacity duration-300">
                    {out ? r.hosted : r.local}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors duration-500",
                      out
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700",
                    )}
                  >
                    {out ? <Cloud className="size-3" /> : <Cpu className="size-3" />}
                    {out ? "Hosted" : "Your hardware"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span
                    className={cn(
                      "inline-flex size-5 items-center justify-center rounded-full transition-colors duration-500",
                      out ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700",
                    )}
                    title={out ? "Yes" : "No"}
                  >
                    {out ? (
                      <Check className="size-3" strokeWidth={3} />
                    ) : (
                      <X className="size-3" strokeWidth={3} />
                    )}
                    <span className="sr-only">{out ? "Yes" : "No"}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Conséquence du profil - hauteur réservée */}
      <div className="bg-secondary/40 flex min-h-[52px] items-center border-t px-4 py-3">
        <p className="text-[11.5px] leading-5 text-foreground">
          {profile.summary}{" "}
          <span className="text-muted-foreground">
            The routing is a setting, not a rebuild - and it is per step, not per workspace.
          </span>
        </p>
      </div>
    </div>
  );
}
