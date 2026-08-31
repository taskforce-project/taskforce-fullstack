import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AgentHandoff - illustration du bloc « Agents ».
 *
 * Remplace trois cartes descriptives par ce qu'elles décrivaient : les trois rôles
 * travaillent sur **le même run**, chacun émet ses livrables, et le relais passe de l'un
 * à l'autre. On voit la séparation des responsabilités au lieu de la lire.
 *
 * Hauteur figée : chaque colonne réserve la place de ses trois livrables dès le départ,
 * sinon la carte grandit à chaque cycle et fait bouger la section.
 */

type Lane = { key: "cpo" | "cto" | "coo"; role: string; scope: string; outputs: string[] };

const LANES: Lane[] = [
  {
    key: "cpo",
    role: "CPO",
    scope: "What we are doing, and why",
    outputs: ["Framing", "Specification", "Release note"],
  },
  {
    key: "cto",
    role: "CTO",
    scope: "How it will be built",
    outputs: ["Approach", "Contracts", "Risk flagged"],
  },
  {
    key: "coo",
    role: "COO",
    scope: "How it actually gets delivered",
    outputs: ["Breakdown", "Quality checks", "Rollout"],
  },
];

/** L'ordre réel d'un run : le relais passe, revient, repasse. */
const SEQUENCE: { lane: Lane["key"]; index: number }[] = [
  { lane: "cpo", index: 0 },
  { lane: "cpo", index: 1 },
  { lane: "cto", index: 0 },
  { lane: "cto", index: 1 },
  { lane: "cto", index: 2 },
  { lane: "coo", index: 0 },
  { lane: "coo", index: 1 },
  { lane: "cpo", index: 2 },
  { lane: "coo", index: 2 },
];

const STEP_MS = 1150;

export function AgentHandoff() {
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(SEQUENCE.length);
      return;
    }
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(
      () => setStep((s) => (s >= SEQUENCE.length ? -1 : s + 1)),
      step >= SEQUENCE.length ? STEP_MS * 2 : STEP_MS,
    );
    return () => window.clearTimeout(t);
  }, [playing, step]);

  const current = step >= 0 && step < SEQUENCE.length ? SEQUENCE[step] : null;

  /** Un livrable est acquis si son étape est déjà passée. */
  const doneAt = (lane: Lane["key"], index: number) =>
    SEQUENCE.findIndex((s) => s.lane === lane && s.index === index) < step;

  return (
    <div ref={rootRef} className="bg-card overflow-hidden rounded-2xl border shadow-lg">
      <div className="bg-secondary/50 flex items-center gap-3 border-b px-5 py-3">
        <span className="text-[13px] font-medium text-foreground">
          One run, three responsibilities
        </span>
        <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
          {Math.max(0, Math.min(step, SEQUENCE.length))}/{SEQUENCE.length}
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x">
        {LANES.map((lane) => {
          const active = current?.lane === lane.key;
          return (
            <div
              key={lane.key}
              className={cn(
                "flex flex-col p-4 transition-colors duration-500",
                active ? "bg-primary/[0.04]" : "bg-card",
              )}
            >
              {/* Tête de colonne */}
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-display flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold transition-colors duration-500",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {lane.role}
                </span>
                <span
                  className={cn(
                    "flex size-4 items-center justify-center transition-opacity duration-300",
                    active ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                >
                  <Loader2 className="text-primary size-3.5 animate-spin" />
                </span>
              </div>
              <p className="text-muted-foreground mt-2 text-[11.5px] leading-[1.4] min-h-[32px]">
                {lane.scope}
              </p>

              {/* Livrables - la place des trois est réservée dès le départ */}
              <ul className="mt-3 flex flex-col gap-1.5">
                {lane.outputs.map((o, idx) => {
                  const isDone = doneAt(lane.key, idx);
                  const isNow = active && current?.index === idx;
                  return (
                    <li
                      key={o}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-all duration-500",
                        isDone
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : isNow
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "text-muted-foreground/40 border-dashed bg-transparent",
                      )}
                    >
                      <span className="flex size-3 shrink-0 items-center justify-center">
                        {isDone ? (
                          <Check className="size-3" strokeWidth={3} />
                        ) : isNow ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <span className="bg-current size-1 rounded-full opacity-60" />
                        )}
                      </span>
                      <span className="truncate">{o}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="text-muted-foreground border-t px-5 py-3 text-[11.5px]">
        The baton moves. Each hand-off is a checkpoint you can stop at.
      </p>
    </div>
  );
}
