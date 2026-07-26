import { useEffect, useRef, useState } from "react";
import { Check, CornerDownLeft, Plus, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ApprovalLoop — illustration du bloc « Human in the loop ».
 *
 * Trois affirmations du produit, démontrées par une seule boucle plutôt qu'écrites :
 *  1. rien n'avance sans un humain,
 *  2. un refus **emporte le commentaire** dans la tentative suivante,
 *  3. tout est écrit dans la piste d'audit.
 *
 * La phase `changes` est le cœur : c'est là que la remarque humaine devient une ligne
 * de plus dans le contrat. Sans elle, l'approbation n'est qu'un bouton.
 */

type Phase = "proposed" | "changes" | "revised" | "approved";

const ORDER: Phase[] = ["proposed", "changes", "revised", "approved"];

const ENDPOINTS = [
  "POST   /api/workspaces/{slug}/sso",
  "GET    /api/workspaces/{slug}/sso",
  "PATCH  /api/workspaces/{slug}/sso",
  "DELETE /api/workspaces/{slug}/sso",
];

const ADDED = "POST   /api/workspaces/{slug}/sso/logout";

type AuditLine = { who: string; what: string; at: string; agent?: boolean; from: Phase };

const AUDIT: AuditLine[] = [
  { who: "CTO agent", what: "proposed 4 endpoints", at: "14:02", agent: true, from: "proposed" },
  { who: "Marie D.", what: "requested changes", at: "14:09", from: "changes" },
  { who: "CTO agent", what: "revised — 1 endpoint added", at: "14:10", agent: true, from: "revised" },
  { who: "Marie D.", what: "approved", at: "14:12", from: "approved" },
];

const PHASE_MS: Record<Phase, number> = {
  proposed: 2000,
  changes: 3000,
  revised: 2400,
  approved: 3400,
};

export function ApprovalLoop() {
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
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setI((p) => (p + 1) % ORDER.length), PHASE_MS[phase]);
    return () => window.clearTimeout(t);
  }, [playing, i, phase]);

  const reached = (p: Phase) => ORDER.indexOf(phase) >= ORDER.indexOf(p);
  const showAdded = reached("revised");
  const approved = phase === "approved";

  return (
    <div ref={rootRef} className="bg-card overflow-hidden rounded-2xl border shadow-lg">
      {/* En-tête */}
      <div className="bg-secondary/50 flex items-center gap-3 border-b px-5 py-3">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full ring-4 ring-card transition-colors duration-500",
            approved
              ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
              : "bg-primary/10 text-primary",
          )}
        >
          {approved ? (
            <Check className="size-3.5" strokeWidth={3} />
          ) : (
            <ShieldCheck className="size-3.5" strokeWidth={1.75} />
          )}
        </span>
        <span className="text-[13.5px] font-medium text-foreground">
          Checkpoint &middot; API contract
        </span>
        <span
          className={cn(
            "ml-auto rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-500",
            phase === "changes"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : approved
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "text-muted-foreground bg-card",
          )}
        >
          {phase === "proposed"
            ? "Waiting for you"
            : phase === "changes"
              ? "Changes requested"
              : phase === "revised"
                ? "Revised — waiting for you"
                : "Approved"}
        </span>
      </div>

      {/* Le contrat proposé */}
      <div className="p-5">
        <ul className="flex flex-col gap-1.5">
          {ENDPOINTS.map((e) => (
            <li
              key={e}
              className="bg-secondary/60 rounded-md px-3 py-1.5 font-mono text-[11px] whitespace-pre text-foreground"
            >
              {e}
            </li>
          ))}

          {/* La ligne née du commentaire humain.
              ⚠️ Pas de collapse en hauteur : elle reste dans le flux et joue sur l'opacité.
              Un `grid-rows-[0fr→1fr]` ferait grandir la carte à chaque cycle, et toute la
              section bougerait avec elle. La place est réservée une fois pour toutes. */}
          <li
            className={cn(
              "transition-[opacity,transform] duration-500 ease-out",
              showAdded ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
            )}
            aria-hidden={!showAdded}
          >
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5">
              <Plus className="size-3 shrink-0 text-emerald-600" strokeWidth={3} />
              <span className="font-mono text-[11px] whitespace-pre text-emerald-800">{ADDED}</span>
            </div>
          </li>
        </ul>

        {/* Le commentaire humain — place réservée en permanence, même raison. */}
        <div
          className={cn(
            "mt-4 transition-[opacity,transform] duration-500 ease-out",
            reached("changes") ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
          aria-hidden={!reached("changes")}
        >
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
            <span className="bg-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-background">
              MD
            </span>
            <div className="min-w-0">
              <p className="text-[12px] leading-5 text-foreground">
                &laquo; SSO logout has to terminate the TaskForce session too. Not just the provider
                one. &raquo;
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-800">
                <CornerDownLeft className="size-3" />
                {reached("revised")
                  ? "Carried into the next attempt"
                  : "Sent back with the comment attached"}
              </p>
            </div>
          </div>
        </div>

        {/* Les actions */}
        <div className="mt-4 flex items-center gap-2 border-t pt-4">
          <span
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-300",
              approved
                ? "bg-emerald-600 text-white"
                : "bg-foreground text-background",
              phase === "approved" && "ring-4 ring-emerald-500/20",
            )}
          >
            {approved ? "Approved" : "Approve"}
          </span>
          <span
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] transition-all duration-300",
              phase === "changes"
                ? "border-amber-300 bg-amber-50 text-amber-800 ring-4 ring-amber-500/15"
                : "text-muted-foreground",
            )}
          >
            Request changes
          </span>
          <span className="text-muted-foreground ml-auto text-[11px]">
            Nothing advances until one of these is pressed
          </span>
        </div>
      </div>

      {/* Piste d'audit */}
      <div className="bg-secondary/40 border-t px-5 py-3">
        <p className="text-muted-foreground mb-2 text-[11px] tracking-[0.06em] uppercase">
          Audit trail
        </p>
        <ol className="flex flex-col gap-1">
          {AUDIT.map((a) => {
            const on = reached(a.from);
            return (
              <li
                key={a.what}
                className={cn(
                  "flex items-center gap-2 text-[11.5px] transition-all duration-500",
                  on ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    a.agent ? "bg-primary" : "bg-foreground",
                  )}
                  aria-hidden
                />
                <span className="font-medium text-foreground">{a.who}</span>
                <span className="text-muted-foreground truncate">{a.what}</span>
                <span className="text-muted-foreground ml-auto shrink-0 font-mono tabular-nums">
                  {a.at}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
