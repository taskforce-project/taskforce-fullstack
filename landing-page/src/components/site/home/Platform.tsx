import { cn } from "@/lib/utils";
import { Section, SectionHeader, FeatureBand } from "../Section";
import type { Maturity } from "../nav";

/**
 * Platform - le diagnostic, la conséquence, et l'état réel du produit.
 * Trois blocs qui s'enchaînent : où le contexte se perd aujourd'hui → pourquoi il faut
 * un seul système → ce qui est réellement livré aujourd'hui.
 */

/* ─────────────────────────  Le problème (la douleur, avant la solution)  ─────────────────────────
 * Décision review (26/07) : les meilleurs sites font RESSENTIR le problème avant
 * de présenter la solution. Ici, la « taxe de coordination » : une intention qui
 * passe de main en main. La cascade de « Someone… » se lit comme une litanie, puis
 * bascule sur la promesse. Éditorial, sans carte ni icône - c'est du texte qui doit
 * faire mouche, pas une illustration. Arrive juste après le hero. */

const HANDOFFS = [
  "Someone writes a spec.",
  "Someone re-explains it at kickoff.",
  "Someone opens tickets that drop the why.",
  "Someone explains the architecture, again.",
  "Someone re-briefs the agent from scratch.",
  "Someone reviews it without the original context.",
  "Someone ships it and hopes it matched the intent.",
];

export function Problem() {
  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
        <SectionHeader
          eyebrow="The problem"
          title="Teams don’t lose time building. They lose it transferring context."
          lead="Most software delivery moves the same way: an intention is passed from hand to hand until something ships. At each handoff the reason behind a decision gets thinner - and the reason is the part nobody writes down."
        />

        <div className="border-l pl-6">
          <ul className="flex flex-col gap-2.5">
            {HANDOFFS.map((line) => (
              <li key={line} className="text-muted-foreground text-[15px] leading-6">
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[18px] leading-8 font-semibold text-foreground">
            The work isn’t the problem. The transfer is.
          </p>
          <p className="text-primary mt-2 text-[15px] leading-7 font-medium">
            TaskForce keeps the context in one governed run - written down once, carried from outcome
            to ship.
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ─────────────────────────  Le diagnostic  ───────────────────────── */

export function Leaks() {
  return (
    <Section band>
      <div className="max-w-2xl">
        <SectionHeader
          eyebrow="The problem"
          title="A decision loses something at every handoff"
          lead="None of these are bad tools. But a decision, the reason behind it and the work it produced end up in three different places - and by the time someone needs the reason, it is the only part that was never written down."
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
 * Carte de maturité - volontairement **sans carte blanche et sans animation**.
 * Après neuf illustrations animées, une bande dense et statique est une respiration :
 * la variété de formes fait autant pour la lecture que la variété de contenu.
 * Trois zones, de gauche à droite, dans le sens où les choses se déplacent.
 */
const ZONES: {
  level: Maturity;
  heading: string;
  note: string;
  /** Une date rend le statut vérifiable plutôt que déclaratif (décision review 26/07). */
  when: string;
  items: { label: string; moved?: string }[];
}[] = [
  {
    level: "live",
    heading: "Available now",
    note: "In production today.",
    when: "Updated July 2026",
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
    heading: "In progress",
    note: "Works, with rough edges.",
    when: "Updated July 2026",
    items: [
      { label: "AI assistant, streaming" },
      { label: "TaskForce Memory retrieval", moved: "moved in July" },
      { label: "Approval checkpoints" },
      { label: "Audit trail" },
      { label: "Automatic document indexing" },
    ],
  },
  {
    level: "labs",
    heading: "Coming next",
    note: "On the public roadmap, with dates.",
    when: "Target Q4 2026",
    items: [
      { label: "Product, architecture and delivery agents" },
      { label: "Full seven-checkpoint orchestration" },
      { label: "Model routing, local and hosted" },
      { label: "Runs that learn from rejections" },
      { label: "Expanding beyond engineering" },
    ],
  },
];

/** Une pastille de couleur par statut, façon page de statut produit. Rien de plus. */
const DOT: Record<Maturity, string> = {
  live: "bg-emerald-500",
  beta: "bg-amber-500",
  labs: "bg-[#c7c7cf]",
};

export function Maturity() {
  return (
    <Section band>
      <SectionHeader
        eyebrow="Product status"
        title="What ships today, and what is planned"
        lead="What runs in production, what works but is still rough, and what is on the roadmap. It changes over time, and the changelog carries the dates."
      />

      <div className="mt-12 grid gap-x-12 gap-y-10 border-t pt-10 sm:grid-cols-3">
        {ZONES.map((z, i) => (
          <div key={z.heading} className={cn(i > 0 && "sm:border-l sm:pl-12")}>
            <div className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", DOT[z.level])} />
              <h3 className="text-[14px] font-semibold text-foreground">{z.heading}</h3>
            </div>
            <p className="text-muted-foreground mt-1 text-[12.5px] leading-5">{z.note}</p>
            <p className="text-muted-foreground/70 mt-0.5 text-[11.5px] tracking-[0.02em] uppercase">
              {z.when}
            </p>
            <ul className="mt-5 flex flex-col gap-2.5">
              {z.items.map((item) => (
                <li key={item.label} className="text-foreground/80 text-[13.5px] leading-5">
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-muted-foreground mt-8 text-[13px]">
        When something changes column it lands in the{" "}
        <a href="/changelog" className="link-underline text-foreground">
          changelog
        </a>{" "}
        the same day, with the date.
      </p>
    </Section>
  );
}
