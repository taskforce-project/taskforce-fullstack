import { Check, ArrowRight, FileCode2, Compass, Cpu } from "lucide-react";
import { Section, SectionHeader, LevelBadge } from "../Section";
import { cn } from "@/lib/utils";

/**
 * WhatShipsToday — le beat manquant de la home (audit v2 + plan, position 5).
 *
 * Décision cadrante : « on vend la v2, mais pas au présent ce qui est Planned » ET « on n'est PAS
 * un outil de gestion de projet ». Le piège : si « ce qui marche aujourd'hui » = board/issues/cycles,
 * on redevient un PM tool. L'échappatoire : mener « aujourd'hui » par l'ACTE IA réellement livré
 * (Phase B + C du road_to_v2) — génération de spec/prompt/découpage ancrée en mémoire, et le
 * decision board OODA — le board n'étant que le substrat où ça atterrit. Le run complet reste la direction.
 */

/** Le socle Live, cadré comme support (pas comme le produit). */
const ALSO_LIVE = [
  "Boards, issues & cycles",
  "Real-time sync",
  "Smart Assign",
  "Delivery analytics",
  "SSO & RBAC",
  "Self-hosting",
  "Audit logging",
];

/** Une carte = un acte IA réellement livré. Un mini-flux en puces porte la démonstration. */
function ActCard({
  icon: Icon,
  title,
  text,
  flow,
  hl,
}: {
  icon: typeof FileCode2;
  title: string;
  text: string;
  flow: string[];
  /** Index de l'étape « humaine » à mettre en avant. */
  hl: number;
}) {
  return (
    <div className="bg-card flex flex-col rounded-2xl border p-6">
      <div className="flex items-center gap-2">
        <span className="bg-secondary/60 text-foreground flex size-10 items-center justify-center rounded-lg border">
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
        <LevelBadge level="live" />
      </div>
      <h3 className="mt-4 text-[16px] font-semibold text-foreground">{title}</h3>
      <p className="text-muted-foreground mt-2 flex-1 text-[13.5px] leading-6">{text}</p>
      <div className="mt-5 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[11.5px]">
        {flow.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            {i > 0 && <ArrowRight className="text-muted-foreground/40 size-3" />}
            <span
              className={cn(
                "rounded-md border px-2 py-0.5",
                i === hl
                  ? "border-primary/30 bg-primary/5 text-primary font-medium"
                  : "bg-secondary/60 text-foreground",
              )}
            >
              {s}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function WhatShipsToday() {
  return (
    <Section band>
      <SectionHeader
        eyebrow="What ships today"
        title="Not a someday demo. This part is already live."
        lead="The full governed run is the direction. But the core act works today — grounded in your memory, on the models you choose."
      />

      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        <ActCard
          icon={FileCode2}
          title="Turn an issue into a spec — and a prompt"
          text="Point TaskForce at an issue. It drafts the product spec, a ready-to-run prompt for your coding agent and the breakdown — checked against your past decisions. You approve; the decision is saved to Memory."
          flow={["Issue", "Spec", "Claude Code prompt", "Approve", "Memory"]}
          hl={3}
        />
        <ActCard
          icon={Compass}
          title="Ask your project what to do next"
          text="The decision board reads your real project — what's open, what's late, what's due this week — and proposes your next three priorities, with the reasoning. One click turns a priority into an issue."
          flow={["Reads your board", "Reflects", "Your 3 priorities"]}
          hl={2}
        />
      </div>

      {/* Coût zéro + le socle Live cadré comme support. */}
      <div className="bg-secondary/30 mt-6 flex flex-col gap-4 rounded-2xl border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-[14px] font-medium text-foreground">
          <Cpu className="text-primary size-4" strokeWidth={1.9} />
          Hosted in the cloud, or self-hosted on local models — zero model cost.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ALSO_LIVE.map((x) => (
            <span
              key={x}
              className="text-muted-foreground bg-card inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px]"
            >
              <Check className="size-3 text-emerald-500" strokeWidth={2.5} />
              {x}
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}
