import { Check, Sparkles, Brain, Terminal, FileCheck2, ArrowRight } from "lucide-react";
import { AppWindow } from "./AppWindow";
import { WORKSPACE, PROJECT, RUN, SPEC_CRITERIA } from "@/lib/story";

/**
 * SpecPanel — le visuel produit du hero (statique, SSR, aucun îlot : on protège le LCP).
 *
 * Décision (audit v2 + plan d'exécution) : le hero ne montre PLUS un board kanban — c'était le
 * signal « outil de gestion de projet » n°1. Il montre l'ACTE réellement livré (Phase B ✅ du
 * road_to_v2) : une issue → l'IA rédige la spec + le prompt d'exécution (à coller dans Claude Code)
 * + le découpage, ancré dans la mémoire (« déjà vu ? »), et un humain approuve → la décision part
 * en mémoire. Aucune donnée inventée : tout vient de `lib/story` (issue CP-12, RUN #147, SPEC_CRITERIA).
 */
export function SpecPanel() {
  return (
    <AppWindow
      bleed
      active="Operations"
      breadcrumb={[WORKSPACE.name, PROJECT, "CP-12"]}
      className="w-full"
    >
      {/* En-tête de l'issue : la demande réelle, venue du support. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#f0f0f3] px-4 py-2.5">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-orange-400" />
        <span className="text-muted-foreground font-mono text-[10.5px]">CP-12</span>
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">{RUN.title}</span>
        <span className="flex gap-1">
          <span className="rounded border border-cyan-200 bg-cyan-50 px-1 py-px text-[8.5px] font-medium text-cyan-700">export</span>
          <span className="rounded border border-amber-200 bg-amber-50 px-1 py-px text-[8.5px] font-medium text-amber-700">billing</span>
        </span>
        <span className="text-muted-foreground ml-auto text-[10.5px]">from Support · Mon 09:14</span>
      </div>

      {/* Le corps : la spec rédigée par l'IA, à gauche ; le prompt + la mémoire, à droite. */}
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-[1.4fr_1fr]">
        {/* La spec rédigée */}
        <div className="rounded-lg border border-[#e9e9ed] bg-white p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <FileCheck2 className="text-primary size-3.5" strokeWidth={2} />
            <span className="text-[12px] font-semibold text-foreground">Product spec</span>
            <span className="border-primary/25 bg-primary/[0.06] text-primary inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] font-medium">
              <Sparkles className="size-2.5" /> drafted by CPO agent · 24s
            </span>
          </div>
          <p className="text-muted-foreground/70 mt-2.5 text-[9px] font-semibold tracking-wide uppercase">
            Acceptance criteria
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {SPEC_CRITERIA.map((c) => (
              <li key={c} className="flex items-start gap-1.5 text-[11px] leading-[1.45] text-foreground">
                <Check className="mt-[2px] size-3 shrink-0 text-emerald-500" strokeWidth={3} />
                {c}
              </li>
            ))}
          </ul>
        </div>

        {/* Le prompt d'exécution + l'ancrage mémoire */}
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-[#1c2230] bg-[#0e1016] p-3">
            <div className="flex items-center gap-1.5">
              <Terminal className="size-3 text-white/70" />
              <span className="text-[10px] font-medium text-white/80">Execution prompt</span>
              <span className="ml-auto rounded bg-white/10 px-1.5 py-px text-[8.5px] text-white/70">ready</span>
            </div>
            <p className="mt-1.5 font-mono text-[9.5px] leading-[1.5] text-white/55">
              Implement invoice export for a chosen period — PDF or CSV at export time; over 500 rows run in the background…
            </p>
            <p className="mt-1.5 text-[9px] text-white/40">Paste into Claude Code, Cursor or your agent</p>
          </div>
          <div className="bg-secondary/40 flex items-center gap-2 rounded-lg border border-[#e9e9ed] p-2.5">
            <Brain className="size-3.5 shrink-0 text-violet-500" strokeWidth={1.9} />
            <span className="text-[10.5px] leading-[1.35] text-foreground">
              Checked against <span className="text-muted-foreground">your past decisions in Memory</span>
            </span>
          </div>
        </div>
      </div>

      {/* La barre d'action : l'humain décide. Approuver écrit la décision en mémoire. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[#f0f0f3] px-4 py-2.5">
        <span className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-md px-2.5 py-[5px] text-[11px] font-medium">
          <Check className="size-3" strokeWidth={3} /> Approve
        </span>
        <span className="rounded-md border px-2.5 py-[5px] text-[11px] text-foreground">Edit</span>
        <span className="text-muted-foreground rounded-md border px-2.5 py-[5px] text-[11px]">Reject</span>
        <span className="text-muted-foreground ml-auto flex items-center gap-1 text-[10.5px]">
          Approve → saved to <span className="font-medium text-foreground">Memory</span>
          <ArrowRight className="size-3" />
        </span>
      </div>
    </AppWindow>
  );
}
