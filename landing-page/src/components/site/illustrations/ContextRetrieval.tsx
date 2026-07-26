import { useEffect, useRef, useState } from "react";
import { Search, FileText, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ContextRetrieval — illustration du bloc « Brain OS ».
 *
 * Remplace le graphe de nœuds décoratif : un graphe joli ne répond pas à la question
 * « qu'est-ce que ça m'apporte ». Ici on montre le seul comportement qui compte —
 * une étape du run **cite les décisions de l'équipe**, et on voit lesquelles ont été
 * retenues, avec quel score, et lesquelles ont été écartées.
 *
 * Hauteur figée : tous les blocs restent dans le flux, seule l'opacité change.
 */

type Source = { id: number; title: string; kind: string; score: number; used: boolean };

const SOURCES: Source[] = [
  { id: 1, title: "ADR-004 · Auth strategy", kind: "Decision", score: 0.91, used: true },
  { id: 2, title: "API conventions", kind: "Reference", score: 0.84, used: true },
  { id: 3, title: "Keycloak module notes", kind: "Note", score: 0.78, used: true },
  { id: 4, title: "Billing spec v2", kind: "Spec", score: 0.34, used: false },
  { id: 5, title: "Onboarding checklist", kind: "Note", score: 0.19, used: false },
];

type Phase = "idle" | "searching" | "ranked" | "answered";
const ORDER: Phase[] = ["idle", "searching", "ranked", "answered"];
const MS: Record<Phase, number> = { idle: 1100, searching: 1600, ranked: 1800, answered: 4200 };

export function ContextRetrieval() {
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
  const scored = at >= ORDER.indexOf("ranked");
  const answered = phase === "answered";

  return (
    <div ref={rootRef} className="bg-card overflow-hidden rounded-2xl border shadow-lg">
      {/* La requête : une étape du run, pas un chat */}
      <div className="bg-secondary/50 flex items-center gap-2.5 border-b px-4 py-3">
        <Search
          className={cn(
            "size-3.5 shrink-0 transition-colors duration-300",
            at >= 1 ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className="truncate text-[12.5px] text-foreground">
          Step 3 &middot; Propose the architecture
        </span>
        <span
          className={cn(
            "text-muted-foreground ml-auto shrink-0 font-mono text-[10.5px] transition-opacity duration-300",
            at >= 1 ? "opacity-100" : "opacity-0",
          )}
        >
          {scored ? "3 of 128 used" : "searching 128…"}
        </span>
      </div>

      {/* Le corpus, classé */}
      <ul className="flex flex-col gap-1.5 p-4">
        {SOURCES.map((s, idx) => {
          const on = scored && s.used;
          const off = scored && !s.used;
          return (
            <li
              key={s.id}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all duration-500",
                on
                  ? "border-primary/30 bg-primary/[0.06]"
                  : off
                    ? "border-transparent bg-transparent opacity-35"
                    : "bg-secondary/40",
              )}
              style={{ transitionDelay: at === 2 ? `${idx * 90}ms` : "0ms" }}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold transition-colors duration-500",
                  on ? "bg-primary text-primary-foreground" : "text-muted-foreground bg-secondary",
                )}
              >
                {on ? s.id : <FileText className="size-3" strokeWidth={2} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-foreground">
                  {s.title}
                </span>
                <span className="text-muted-foreground text-[10.5px]">{s.kind}</span>
              </span>

              {/* Le score : barre + valeur, seulement une fois classé */}
              <span
                className={cn(
                  "flex shrink-0 items-center gap-2 transition-opacity duration-500",
                  scored ? "opacity-100" : "opacity-0",
                )}
              >
                <span className="bg-secondary hidden h-1 w-12 overflow-hidden rounded-full sm:block">
                  <span
                    className={cn(
                      "block h-full rounded-full transition-[width] duration-700 ease-out",
                      on ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                    style={{ width: scored ? `${s.score * 100}%` : "0%" }}
                  />
                </span>
                <span
                  className={cn(
                    "w-7 text-right font-mono text-[10.5px] tabular-nums",
                    on ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {s.score.toFixed(2)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* La réponse — citée. La place est réservée en permanence. */}
      <div className="border-t p-4">
        <div
          className={cn(
            "flex gap-2.5 transition-opacity duration-700",
            answered ? "opacity-100" : "opacity-25",
          )}
        >
          <Quote className="text-muted-foreground mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
          <p className="text-[12.5px] leading-6 text-foreground">
            Delegate identity to Keycloak, one realm per workspace
            <Cite n={1} on={answered} />. A SAML library inside the API was considered and
            rejected — it would leave two auth paths to maintain
            <Cite n={2} on={answered} />.
          </p>
        </div>
        <p className="text-muted-foreground mt-3 text-[11px]">
          Every generated step carries the sources it drew from. You can check the reasoning
          against your own decisions.
        </p>
      </div>
    </div>
  );
}

/** Puce de citation renvoyant à une source du corpus. */
function Cite({ n, on }: { n: number; on: boolean }) {
  return (
    <span
      className={cn(
        "mx-0.5 inline-flex size-[15px] translate-y-[1px] items-center justify-center rounded font-mono text-[9px] font-semibold transition-colors duration-500",
        on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
      )}
    >
      {n}
    </span>
  );
}
