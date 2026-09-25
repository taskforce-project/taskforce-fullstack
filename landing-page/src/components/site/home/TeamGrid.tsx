import { ArrowRight } from "lucide-react";
import { Section, SectionHeader } from "../Section";

/**
 * TeamGrid - « Who it's for » : le wedge engineering assumé, et l'horizon annoncé sans être simulé.
 *
 * Extrait de `Showcase.tsx` le 25/09 (nettoyage du code mort) : Showcase portait une douzaine
 * d'archétypes de section dont seul celui-ci était encore rendu. Les onglets d'équipe (Product,
 * Operations) avaient déjà été retirés (review 5, Option A) : seule la grille engineering reste.
 */
const CARDS: { title: string; text: string }[] = [
  { title: "Ship a feature", text: "Spec, break down, hand code to an agent, review the PR." },
  { title: "Triage the backlog", text: "Issues sized and routed to the right dev, or to an agent." },
  { title: "Reproduce a bug", text: "A clean repro and a failing test before anyone opens the file." },
];

export function TeamGrid() {
  return (
    <Section>
      <SectionHeader
        eyebrow="Who it’s for"
        title="Built for engineering teams first"
        lead="TaskForce is engineering-first, and we don’t hide it. But a governed run with a sign-off at each step isn’t specific to code. It expands to every team that ships reviewed work."
      />

      {/* Le wedge assumé : les cas engineering en clair, l'élargissement annoncé (pas simulé). */}
      <div className="mt-10 flex items-center gap-3">
        <span className="text-primary text-[12px] font-semibold tracking-[0.06em] uppercase">
          Engineering
        </span>
        <span className="bg-border h-px flex-1" />
      </div>

      <ul className="bg-border -mx-6 mt-6 grid gap-px border-y border-border sm:grid-cols-3 lg:-mx-10">
        {CARDS.map((c) => (
          <li key={c.title} className="bg-card flex flex-col p-6">
            <h3 className="t-h4">{c.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-[13.5px] leading-6">{c.text}</p>
          </li>
        ))}
      </ul>

      {/* La direction (ex-section « The direction » / WhereThisGoes, fusionnée le 24/09, validée
          CEO) : on assume le wedge et on montre l'horizon, sans simuler d'écrans pour d'autres
          métiers. Le Book a demo en double part, le CTA final le porte déjà. */}
      <div className="mt-10 flex flex-col gap-4 border-t pt-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
        <p className="text-muted-foreground max-w-2xl text-[14px] leading-6">
          <span className="text-foreground font-medium">Engineering is the wedge, not the ceiling.</span>{" "}
          The memory that keeps one run’s context is the same knowledge an organization loses in
          meetings, in chat and in people’s heads. The roadmap is public, so hold us to it.
        </p>
        <a
          href="/roadmap"
          className="link-underline text-primary inline-flex shrink-0 items-center gap-1 text-[14px] font-medium"
        >
          See the public roadmap
          <ArrowRight className="size-4" />
        </a>
      </div>
    </Section>
  );
}
