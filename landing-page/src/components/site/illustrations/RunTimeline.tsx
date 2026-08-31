import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  FileText,
  BrainCircuit,
  ShieldCheck,
  ListTree,
  CornerDownLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * RunTimeline - l'illustration du bloc Orchestration.
 *
 * Structure reprise du composant « agent planning » fourni en référence : une timeline
 * d'étapes repliables, avec statut, durée et contenu riche par étape.
 * Adaptations : jetons de l'app (light-only), contenu TaskForce réel, et surtout
 * **le run se déroule tout seul** - c'est une démonstration, pas une capture figée.
 *
 * Garde-fous : l'animation ne tourne que si le composant est visible (IntersectionObserver)
 * et jamais si `prefers-reduced-motion` est demandé - sinon on affiche l'état final.
 */

type Status = "pending" | "active" | "success" | "returned";

type Step = {
  id: string;
  title: string;
  icon: ReactNode;
  took: string;
  /** Étape de validation : le run s'arrête là et attend un humain. */
  gate?: boolean;
  content?: ReactNode;
};

/* ─── Blocs de contenu ─── */

function Sources() {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-muted-foreground text-[11.5px]">
        Retrieved 3 sources from the workspace
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {["ADR-004 · Auth strategy", "API conventions", "Keycloak module"].map((s) => (
          <li
            key={s}
            className="bg-card text-muted-foreground rounded-md border px-2 py-1 font-mono text-[10.5px]"
          >
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Criteria() {
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {[
        "A workspace admin can connect an identity provider",
        "Existing password sessions stay valid until expiry",
        "SSO logout terminates the TaskForce session",
      ].map((c) => (
        <div key={c} className="flex items-start gap-2 text-[11.5px] leading-5 text-foreground">
          <Check className="mt-[3px] size-3 shrink-0 text-emerald-600" strokeWidth={3} />
          {c}
        </div>
      ))}
      <div className="mt-1.5 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
        <CornerDownLeft className="mt-[3px] size-3 shrink-0 text-amber-700" />
        <p className="text-[11px] leading-5 text-amber-800">
          Sent back once - <span className="font-medium">&laquo; the logout case is missing &raquo;</span>.
          The third criterion came from that comment.
        </p>
      </div>
    </div>
  );
}

function Tradeoff() {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-1.5 rounded-md border bg-secondary/40 p-2.5 text-[11.5px]">
        <span className="text-muted-foreground">Proposed</span>
        <span className="text-foreground">Delegate to Keycloak, one realm per workspace</span>
        <span className="text-muted-foreground">Rejected</span>
        <span className="text-foreground">
          A SAML library in the API{" "}
          <span className="text-muted-foreground">- two auth paths to maintain</span>
        </span>
        <span className="text-muted-foreground">Because</span>
        <span className="text-foreground">ADR-004 already puts identity outside the API</span>
      </div>
    </div>
  );
}

function Gate() {
  return (
    <div className="border-primary/25 bg-primary/[0.06] mt-2 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2.5">
      <span className="text-[11.5px] text-foreground">
        Nothing advances until someone approves this.
      </span>
      <span className="bg-foreground ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium text-background">
        Approve
      </span>
      <span className="text-muted-foreground rounded-full border px-2.5 py-1 text-[11px]">
        Request changes
      </span>
    </div>
  );
}

const STEPS: Step[] = [
  {
    id: "ctx",
    title: "Read the workspace context",
    icon: <Search className="size-3.5" />,
    took: "0.4s",
    content: <Sources />,
  },
  {
    id: "spec",
    title: "Draft the product spec",
    icon: <FileText className="size-3.5" />,
    took: "22s",
    content: <Criteria />,
  },
  {
    id: "arch",
    title: "Propose the architecture",
    icon: <BrainCircuit className="size-3.5" />,
    took: "18s",
    content: <Tradeoff />,
  },
  {
    id: "gate",
    title: "Checkpoint - your approval",
    icon: <ShieldCheck className="size-3.5" />,
    took: "waiting",
    gate: true,
    content: <Gate />,
  },
  {
    id: "issues",
    title: "Break the work into issues",
    icon: <ListTree className="size-3.5" />,
    took: "11s",
  },
];

const GATE_INDEX = STEPS.findIndex((s) => s.gate);
const STEP_MS = 1500;
const GATE_MS = 3600;

const RING: Record<Status, string> = {
  success: "bg-emerald-50 text-emerald-600 ring-emerald-200",
  active: "bg-primary/10 text-primary ring-primary/25",
  returned: "bg-amber-50 text-amber-700 ring-amber-200",
  pending: "bg-secondary text-muted-foreground ring-border",
};

export function RunTimeline() {
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [playing, setPlaying] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Ne jouer que quand c'est visible : une animation qui tourne hors écran ne sert
  // qu'à chauffer le CPU (et à désynchroniser ce que la personne voit en arrivant).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(GATE_INDEX);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setPlaying(entry.isIntersecting),
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const atGate = progress === GATE_INDEX;
    const last = progress >= STEPS.length;
    const t = window.setTimeout(
      () => setProgress((p) => (p >= STEPS.length ? 0 : p + 1)),
      last ? GATE_MS : atGate ? GATE_MS : STEP_MS,
    );
    return () => window.clearTimeout(t);
  }, [playing, progress]);

  const statusOf = (i: number): Status => {
    if (i < progress) return "success";
    if (i === progress) return "active";
    return "pending";
  };

  const done = progress >= STEPS.length;

  return (
    /**
     * `min-h` : les panneaux dépliés n'ont pas tous la même hauteur, donc la carte
     * variait de 150 px au fil du cycle et faisait bouger toute la section.
     * On réserve la hauteur du plus grand état une fois pour toutes - mesuré à 459 px
     * en desktop, arrondi avec de la marge pour le repli du texte sur écran étroit.
     */
    <div
      ref={rootRef}
      className="bg-card flex min-h-[500px] flex-col overflow-hidden rounded-2xl border shadow-lg"
    >
      {/* En-tête */}
      <div className="bg-secondary/50 flex items-center gap-3 border-b px-4 py-3">
        <span className="flex size-5 items-center justify-center">
          {done ? (
            <Check className="size-4 text-emerald-600" strokeWidth={2.5} />
          ) : (
            <Loader2 className="text-primary size-4 animate-spin" />
          )}
        </span>
        <span className="text-[14px] font-medium tracking-tight text-foreground">
          Run #145 &middot; Add SSO to the workspace settings
        </span>
        <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
          {Math.min(progress, STEPS.length)}/{STEPS.length}
        </span>
      </div>

      {/* Timeline */}
      <div className="flex flex-col p-5">
        {STEPS.map((step, i) => {
          const status = statusOf(i);
          const isOpen = open[step.id] ?? status === "active";
          const isLast = i === STEPS.length - 1;

          return (
            <div
              key={step.id}
              className={cn(
                "relative flex gap-4 transition-opacity duration-500",
                status === "pending" ? "opacity-45" : "opacity-100",
              )}
            >
              {/* Colonne icône + trait */}
              <div className="relative z-10 flex flex-none flex-col items-center">
                <span
                  className={cn(
                    "ring-card flex size-6 items-center justify-center rounded-full ring-4 transition-colors duration-300",
                    RING[status],
                  )}
                >
                  {status === "success" ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : status === "active" && !step.gate ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    step.icon
                  )}
                </span>
                {!isLast && (
                  <span className="relative mt-1 w-px flex-1 bg-border" aria-hidden>
                    <span
                      className="bg-primary absolute inset-x-0 top-0 origin-top transition-transform duration-700 ease-out"
                      style={{
                        bottom: 0,
                        transform: `scaleY(${i < progress ? 1 : 0})`,
                      }}
                    />
                  </span>
                )}
              </div>

              {/* Contenu */}
              <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-5")}>
                <button
                  type="button"
                  disabled={!step.content}
                  onClick={() => setOpen((o) => ({ ...o, [step.id]: !isOpen }))}
                  className={cn(
                    "group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-1 text-left transition-colors",
                    step.content ? "hover:bg-secondary/60 cursor-pointer" : "cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "flex-1 truncate text-[13.5px] tracking-tight transition-colors",
                      status === "active"
                        ? "font-semibold text-foreground"
                        : "font-medium text-foreground/85",
                    )}
                  >
                    {step.title}
                  </span>
                  <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                    {status === "pending" ? "-" : step.took}
                  </span>
                  {step.content && (
                    <span className="text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 transition-colors">
                      {isOpen ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                    </span>
                  )}
                </button>

                {step.content && (
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-400 ease-in-out",
                      isOpen && status !== "pending"
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="overflow-hidden">{step.content}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
