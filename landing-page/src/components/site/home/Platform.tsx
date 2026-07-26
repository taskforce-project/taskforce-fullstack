import { cn } from "@/lib/utils";
import { Section, SectionHeader, FeatureBand, LevelBadge } from "../Section";
import type { Maturity } from "../nav";

/**
 * Platform — le diagnostic, la conséquence, et l'état réel du produit.
 * Trois blocs qui s'enchaînent : où le contexte se perd aujourd'hui → pourquoi il faut
 * un seul système → ce qui est réellement livré aujourd'hui.
 */

/* ─────────────────────────  Le diagnostic  ───────────────────────── */

export function Leaks() {
  return (
    <Section band>
      <div className="max-w-2xl">
        <SectionHeader
          eyebrow="The problem"
          title="A decision loses something at every handoff"
          lead="None of these are bad tools. But a decision, the reason behind it and the work it produced end up in three different places — and by the time someone needs the reason, it is the only part that was never written down."
        />
        <p className="mt-6 text-[14px] leading-7 text-foreground">
          The same sentence travels across a normal stack and nothing is deleted on purpose. It just
          never survives the copy.
        </p>
      </div>
    </Section>
  );
}

/* ─────────────────────────  La conséquence  ───────────────────────── */

export function WhyOneSystem() {
  return (
    <FeatureBand
      narrow
      eyebrow="The consequence"
      title="What you get from not integrating four tools"
      lead="Every pair below needs both of its halves to live in the same system. Wire two products together and you get the features; you do not get any of this."
      aside={
        <>
          That is the whole reason this is one platform rather than a set of plugins.
          <span className="text-muted-foreground block pt-3">
            It is also the part a competitor cannot bolt on afterwards.
          </span>
        </>
      }
    />
  );
}

/* ─────────────────────────  L'état réel du produit  ───────────────────────── */

/**
 * Carte de maturité — volontairement **sans carte blanche et sans animation**.
 * Après neuf illustrations animées, une bande dense et statique est une respiration :
 * la variété de formes fait autant pour la lecture que la variété de contenu.
 * Trois zones, de gauche à droite, dans le sens où les choses se déplacent.
 */
const ZONES: {
  level: Maturity;
  heading: string;
  note: string;
  items: { label: string; moved?: string }[];
}[] = [
  {
    level: "live",
    heading: "Shipped",
    note: "In production. Usable this afternoon.",
    items: [
      { label: "Workspaces, projects, boards, cycles" },
      { label: "Real-time collaboration" },
      { label: "Smart Assign", moved: "moved in June" },
      { label: "Delivery analytics" },
      { label: "Connector catalogue" },
      { label: "SSO, roles and permissions" },
      { label: "Self-hosting" },
    ],
  },
  {
    level: "beta",
    heading: "Partial",
    note: "Works, with edges. Not something we would sell on yet.",
    items: [
      { label: "AI assistant, streaming" },
      { label: "Brain OS retrieval", moved: "moved in July" },
      { label: "Approval checkpoints" },
      { label: "Audit trail" },
      { label: "Automatic document indexing" },
    ],
  },
  {
    level: "labs",
    heading: "Planned",
    note: "Dated on the public roadmap. Never sold as shipped.",
    items: [
      { label: "CPO / CTO / COO agent roles" },
      { label: "Full seven-checkpoint orchestration" },
      { label: "Model routing, local and hosted" },
      { label: "Runs that learn from rejections" },
      { label: "Teams beyond engineering" },
    ],
  },
];

export function Maturity() {
  return (
    <Section band>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-end lg:gap-16">
        <SectionHeader
          eyebrow="Where the product actually is"
          title="What ships today, and what is still ahead"
          lead="Most AI products blur this line on purpose. Buy the left column. Hold us to the right one — it has dates."
        />
        <p className="text-[14px] leading-7 text-foreground">
          Things move leftward over time.
          <span className="text-muted-foreground">
            {" "}
            When something arrives in a new column it is written in the{" "}
            <a href="/changelog" className="link-underline text-foreground">
              changelog
            </a>{" "}
            the same day, with the date.
          </span>
        </p>
      </div>

      {/* Trois zones, sans carte : ce sont les rails qui structurent. */}
      <div className="mt-12 grid border-t lg:grid-cols-3">
        {ZONES.map((z) => (
          <div key={z.heading} className="border-b py-7 lg:rail-x lg:px-7 lg:first:pl-0 lg:last:pr-0">
            <div className="flex items-center gap-2.5">
              <h3 className="font-display text-[16px] font-medium text-foreground">{z.heading}</h3>
              <LevelBadge level={z.level} />
              <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
                {z.items.length}
              </span>
            </div>
            <p className="text-muted-foreground mt-1.5 text-[12.5px] leading-5">{z.note}</p>

            <ul className="mt-5 flex flex-wrap gap-1.5">
              {z.items.map((i) => (
                <li
                  key={i.label}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-[12px]",
                    i.moved
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "bg-card text-foreground",
                  )}
                >
                  {i.label}
                  {i.moved && (
                    <span className="ml-1.5 font-mono text-[10px] text-emerald-600">{i.moved}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
