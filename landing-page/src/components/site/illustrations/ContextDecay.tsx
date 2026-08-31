import { useEffect, useRef, useState } from "react";
import { FileText, MessageSquare, KanbanSquare, User, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ContextDecay - illustration du bloc « The problem ».
 *
 * L'idée : ne pas *dire* que le contexte se perd, le **montrer**. Une même décision
 * est réécrite à chaque outil qu'elle traverse, et on voit ce qui disparaît à chaque saut.
 * La dernière ligne montre la même décision dans un run : rien ne tombe.
 *
 * Chaque mot porte `keep: false` quand il ne survit pas à l'étape - c'est la donnée qui
 * produit l'animation, pas une opacité décorative.
 */

type Word = { t: string; keep: boolean };

type Hop = {
  tool: string;
  icon: typeof FileText;
  /** Ce qui reste de la décision une fois arrivé ici. */
  words: Word[];
  retained: number;
  note: string;
};

const FULL =
  "We chose Keycloak over a SAML library because ADR-004 keeps identity outside the API";

const mk = (drop: string[]): Word[] =>
  FULL.split(" ").map((t) => ({ t, keep: !drop.includes(t.replace(/[^A-Za-z0-9-]/g, "")) }));

const HOPS: Hop[] = [
  {
    tool: "The spec, in a document",
    icon: FileText,
    words: mk([]),
    retained: 100,
    note: "Written once, in full.",
  },
  {
    tool: "The decision, in a chat thread",
    icon: MessageSquare,
    words: mk(["because", "ADR-004", "keeps", "identity", "outside", "the", "API"]),
    retained: 55,
    note: "The reason drops. Only the outcome is repeated.",
  },
  {
    tool: "The work, in a tracker",
    icon: KanbanSquare,
    words: mk([
      "We",
      "chose",
      "over",
      "a",
      "SAML",
      "library",
      "because",
      "ADR-004",
      "keeps",
      "identity",
      "outside",
      "the",
      "API",
    ]),
    retained: 20,
    note: "A ticket title. The alternative that was rejected is gone.",
  },
  {
    tool: "The rest, in someone's head",
    icon: User,
    words: mk(FULL.split(" ").map((w) => w.replace(/[^A-Za-z0-9-]/g, ""))),
    retained: 0,
    note: "Until that person changes team.",
  },
];

const RUN_HOP: Hop = {
  tool: "The same decision, inside a run",
  icon: GitBranch,
  words: mk([]),
  retained: 100,
  note: "Produced by the step that made it, kept with the work it produced.",
};

const STEP_MS = 1800;

function Sentence({ words, dim }: { words: Word[]; dim: boolean }) {
  return (
    <p className="text-[13px] leading-6">
      {words.map((w, i) => (
        <span
          key={`${w.t}-${i}`}
          className={cn(
            "transition-all duration-700",
            w.keep
              ? dim
                ? "text-muted-foreground"
                : "text-foreground"
              : "text-muted-foreground/25 line-through decoration-muted-foreground/25",
          )}
        >
          {w.t}{" "}
        </span>
      ))}
    </p>
  );
}

export function ContextDecay() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(HOPS.length);
      return;
    }
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), {
      threshold: 0.3,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(
      () => setStep((s) => (s >= HOPS.length ? 0 : s + 1)),
      step >= HOPS.length ? STEP_MS * 2 : STEP_MS,
    );
    return () => window.clearTimeout(t);
  }, [playing, step]);

  const shownRun = step >= HOPS.length;

  return (
    <div ref={rootRef} className="bg-card overflow-hidden rounded-2xl border shadow-lg">
      <div className="bg-secondary/50 flex items-center justify-between gap-3 border-b px-5 py-3">
        <span className="text-[13px] font-medium text-foreground">
          One decision, four tools later
        </span>
        <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
          context retained
        </span>
      </div>

      <ol className="divide-y">
        {HOPS.map((hop, i) => {
          const reached = i <= step;
          const isCurrent = i === step;
          return (
            <li
              key={hop.tool}
              className={cn(
                "px-5 py-4 transition-[opacity,background-color] duration-500",
                reached ? "opacity-100" : "opacity-30",
                isCurrent && "bg-secondary/30",
              )}
            >
              <div className="mb-2 flex items-center gap-2.5">
                <hop.icon className="text-muted-foreground size-3.5 shrink-0" strokeWidth={1.75} />
                <span className="text-[12px] font-medium text-foreground">{hop.tool}</span>
                <span
                  className={cn(
                    "ml-auto shrink-0 font-mono text-[11px] tabular-nums transition-colors duration-500",
                    hop.retained === 0
                      ? "text-destructive"
                      : hop.retained < 60
                        ? "text-amber-600"
                        : "text-emerald-600",
                  )}
                >
                  {reached ? `${hop.retained}%` : "-"}
                </span>
              </div>

              <Sentence words={reached ? hop.words : HOPS[0].words} dim={!isCurrent} />

              <p
                className={cn(
                  "text-muted-foreground mt-1.5 text-[11.5px] transition-opacity duration-500",
                  isCurrent ? "opacity-100" : "opacity-0",
                )}
              >
                {hop.note}
              </p>

              {/* Jauge de rétention */}
              <div className="bg-secondary mt-3 h-1 overflow-hidden rounded-full">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width,background-color] duration-700 ease-out",
                    hop.retained === 0
                      ? "bg-destructive"
                      : hop.retained < 60
                        ? "bg-amber-500"
                        : "bg-emerald-500",
                  )}
                  style={{ width: reached ? `${hop.retained}%` : "100%" }}
                />
              </div>
            </li>
          );
        })}
      </ol>

      {/* La même décision dans un run */}
      <div
        className={cn(
          "border-primary/25 bg-primary/[0.05] border-t px-5 py-4 transition-all duration-700",
          shownRun ? "opacity-100" : "opacity-35",
        )}
      >
        <div className="mb-2 flex items-center gap-2.5">
          <RUN_HOP.icon className="text-primary size-3.5 shrink-0" strokeWidth={1.75} />
          <span className="text-[12px] font-medium text-foreground">{RUN_HOP.tool}</span>
          <span className="text-primary ml-auto shrink-0 font-mono text-[11px] tabular-nums">
            100%
          </span>
        </div>
        <Sentence words={RUN_HOP.words} dim={!shownRun} />
        <p className="text-muted-foreground mt-1.5 text-[11.5px]">{RUN_HOP.note}</p>
      </div>
    </div>
  );
}
