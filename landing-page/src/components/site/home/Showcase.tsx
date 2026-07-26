import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Section, SectionHeader } from "../Section";
import { Placeholder } from "../Placeholder";
import { cn } from "@/lib/utils";

/**
 * Showcase — des archétypes de section VARIÉS (inspirés de la structure de
 * relevanceai.com), pour casser la monotonie des `FeatureSplit` répétés.
 * Aucun faux écran animé : les visuels sont des placeholders, le reste est du
 * contenu. Ce qui change d'une section à l'autre, c'est le GABARIT.
 */

/* ─────────────────────────  A. Grille par équipe (onglets cliquables)  ─────────────────────────
 * Archétype « We've helped thousands of teams » : des onglets d'équipe (vrais
 * boutons) qui filtrent une grille de cartes. Sert la vision D10 (au-delà de la
 * tech). Interactif → îlot `client:idle` dans index.astro.
 * Chaque équipe a EXACTEMENT 3 cartes : la hauteur ne bouge pas d'un onglet à l'autre. */

const TEAMS: { key: string; label: string; cards: { title: string; text: string }[] }[] = [
  {
    key: "eng",
    label: "Engineering",
    cards: [
      { title: "Ship a feature", text: "Spec, break down, hand code to an agent, review the PR." },
      { title: "Triage the backlog", text: "Issues sized and routed to the right dev — or an agent." },
      { title: "Reproduce a bug", text: "A clean repro and a failing test before anyone opens the file." },
    ],
  },
  {
    key: "product",
    label: "Product",
    cards: [
      { title: "Turn intent into a spec", text: "Acceptance criteria and edge cases, for you to approve." },
      { title: "Check the roadmap", text: "Every spec cross-referenced with what you already committed to." },
      { title: "Draft the release note", text: "Generated from what shipped, not from memory." },
    ],
  },
  {
    key: "ops",
    label: "Operations",
    cards: [
      { title: "Route the backlog", text: "Sized, ordered and assigned across people and agents." },
      { title: "Balance the sprint", text: "Load-aware assignment, with the reason written down." },
      { title: "Escalate a blocker", text: "The run flags what is stuck and who needs to decide." },
    ],
  },
  {
    key: "cs",
    label: "Client services",
    cards: [
      { title: "Answer with the source", text: "Replies grounded in your docs, with the citation attached." },
      { title: "Summarise a thread", text: "The decision and its reason, pulled out of a long exchange." },
      { title: "Draft the follow-up", text: "On-brand, ready for a human to send." },
    ],
  },
  {
    key: "anyone",
    label: "Anyone",
    cards: [
      { title: "Standardise a request", text: "A repeatable run instead of a one-off ticket every time." },
      { title: "Ship through review", text: "The mechanism is a governed run — nothing about it is code-only." },
      { title: "Keep the audit trail", text: "Who decided what, and when — on every run." },
    ],
  },
];

export function TeamGrid() {
  const [active, setActive] = useState(TEAMS[0].key);
  const team = TEAMS.find((t) => t.key === active) ?? TEAMS[0];

  return (
    <Section>
      <SectionHeader
        eyebrow="For the whole team"
        title="Purpose-built runs, not one generic assistant"
        lead="A governed run with a sign-off at each step is not specific to engineering. Any team that ships work through review has the same problem — and can use the same shape."
      />

      {/* Onglets d'équipe — vrais boutons cliquables. */}
      <ul className="mt-8 flex flex-wrap gap-2">
        {TEAMS.map((t) => (
          <li key={t.key}>
            <button
              type="button"
              onClick={() => setActive(t.key)}
              aria-pressed={t.key === active}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors",
                t.key === active
                  ? "border-primary bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground bg-card hover:text-foreground hover:border-[#dcdce2]",
              )}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {team.cards.map((c) => (
          <li
            key={c.title}
            className="card-hover bg-card flex flex-col overflow-hidden rounded-2xl border"
          >
            <Placeholder label="" ratio="16 / 10" className="rounded-none border-0 border-b border-dashed" />
            <div className="p-4">
              <p className="text-primary text-[11px] font-medium tracking-[0.04em] uppercase">
                {team.label}
              </p>
              <h3 className="mt-1 text-[14.5px] font-semibold text-foreground">{c.title}</h3>
              <p className="text-muted-foreground mt-1 text-[13px] leading-6">{c.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ─────────────────────────  B. Cartes en étapes (rollout)  ─────────────────────────
 * Archétype « Drive ROI in six weeks » : une rangée de cartes-étapes, la
 * dernière mise en avant (teintée + visuel placeholder). */

const PHASES = [
  { when: "Day one", title: "Run one outcome", text: "Describe something you were going to spec by hand this week. Approve or reject what comes back." },
  { when: "Week one", title: "Put it in your flow", text: "Connect your tracker and your repo. Runs live next to the work you already do." },
];

export function Phases() {
  return (
    <Section band>
      <SectionHeader
        eyebrow="Getting started"
        title="Start with one run, not a migration"
        lead="No rip-and-replace. You keep your board, your repo and your review — TaskForce sits on top and hands the work back."
      />

      <div className="mt-12 grid gap-5 lg:grid-cols-[1fr_1fr_1.4fr]">
        {PHASES.map((p) => (
          <div key={p.title} className="card-hover bg-card flex flex-col justify-end rounded-2xl border p-6">
            <p className="text-muted-foreground text-[12px]">{p.when}</p>
            <h3 className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
              {p.title}
            </h3>
            <p className="text-muted-foreground mt-2 text-[13.5px] leading-6">{p.text}</p>
          </div>
        ))}

        {/* Carte mise en avant : teintée + placeholder de visuel. */}
        <div className="card-hover relative overflow-hidden rounded-2xl border p-6 [background:radial-gradient(120%_120%_at_100%_0%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_60%)]">
          <Placeholder label="Your team, building weekly" ratio="16 / 8" className="mb-5 bg-card/60" />
          <p className="text-muted-foreground text-[12px]">Ongoing</p>
          <h3 className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
            Your team builds new runs weekly
          </h3>
          <p className="text-muted-foreground mt-2 text-[13.5px] leading-6">
            Once a run is reliable, it becomes a template. New use cases stop waiting on us.
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ─────────────────────────  C. « Remplace ta stack » (split + like-X)  ─────────────────────────
 * Archétype « All of your agents on one stack » : un visuel placeholder à gauche,
 * une liste de capacités « comme X » à droite. */

const STACK = [
  { cap: "Triggered by events", like: "like a scheduler" },
  { cap: "Reads your context", like: "like a vector DB" },
  { cap: "Runs any model", like: "like a router" },
  { cap: "Assigns the work", like: "like a tracker" },
  { cap: "Approved by a human", like: "like a review tool" },
  { cap: "Audited end to end", like: "like an observability stack" },
];

export function StackReplaces() {
  return (
    <Section>
      <SectionHeader
        eyebrow="One system"
        title="One platform instead of four you wire together"
        lead="Most teams bolt a router, a queue, a tracker and an audit log together just to run agents through review. Here it is one system — and the pieces already know about each other."
      />

      <div className="mt-12 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Placeholder label="One stack" ratio="1 / 1" className="mx-auto max-w-[420px]" />

        <ul className="divide-y">
          {STACK.map((s) => (
            <li key={s.cap} className="flex items-center justify-between py-3.5">
              <span className="text-[15px] font-medium text-foreground">{s.cap}</span>
              <span className="text-muted-foreground text-[13px]">{s.like}</span>
            </li>
          ))}
          <li className="pt-5">
            <a
              href="/product"
              className="link-underline text-primary inline-flex items-center gap-1 text-[14px] font-medium"
            >
              See the whole platform
              <ArrowRight className="size-4" />
            </a>
          </li>
        </ul>
      </div>
    </Section>
  );
}

/* ─────────────────────────  E. Grille de features (bento)  ─────────────────────────
 * Remplace 4 `FeatureSplit` texte identiques par UNE grille de cartes — même
 * contenu, gabarit différent. Chaque carte : placeholder + badge de maturité + texte. */

const FEATURES: { title: string; level: "live" | "beta" | "labs"; text: string; wide?: boolean }[] = [
  {
    title: "Brain OS",
    level: "beta",
    text: "Define the context once — your architecture, decisions, conventions. Agents read from the same place instead of being told again in every prompt.",
    wide: true,
  },
  {
    title: "Smart Assign",
    level: "live",
    text: "The right task reaches the right person. Five signals, an explained ranking, one-click override.",
  },
  {
    title: "Models, your call",
    level: "labs",
    text: "Routine steps on a model you host; the hard ones can call something stronger — or never leave your network.",
  },
  {
    title: "Delivery analytics",
    level: "live",
    text: "The one number a tracker cannot give you: which checkpoint keeps getting sent back, and why.",
    wide: true,
  },
];

const LEVEL_PILL: Record<"live" | "beta" | "labs", { label: string; className: string }> = {
  live: { label: "Live", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  beta: { label: "Beta", className: "border-amber-200 bg-amber-50 text-amber-700" },
  labs: { label: "Planned", className: "border-violet-200 bg-violet-50 text-violet-700" },
};

export function FeatureCards() {
  return (
    <Section band>
      <SectionHeader
        eyebrow="What makes a run work"
        title="Four things that only pay off in the same system"
        lead="Each is useful alone. Together, in one platform, they feed each other — which is exactly what you cannot bolt on afterwards."
      />
      <ul className="mt-12 grid gap-5 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <li
            key={f.title}
            className={cn(
              "card-hover bg-card flex flex-col overflow-hidden rounded-2xl border",
              f.wide && "sm:col-span-2 sm:flex-row",
            )}
          >
            <Placeholder
              label=""
              ratio={f.wide ? "16 / 9" : "16 / 10"}
              className={cn(
                "rounded-none border-0",
                f.wide
                  ? "border-b border-dashed sm:w-1/2 sm:border-r sm:border-b-0"
                  : "border-b border-dashed",
              )}
            />
            <div className="flex flex-col justify-center p-6">
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-semibold text-foreground">{f.title}</h3>
                <span
                  className={cn(
                    "rounded border px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase",
                    LEVEL_PILL[f.level].className,
                  )}
                >
                  {LEVEL_PILL[f.level].label}
                </span>
              </div>
              <p className="text-muted-foreground mt-2 text-[13.5px] leading-6">{f.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ─────────────────────────  D. Gros visuel centré  ─────────────────────────
 * Archétype « Take what's working in Cowork » : un grand visuel placeholder
 * centré dans une bande teintée. Sert de respiration entre deux sections denses. */

export function BigShot() {
  return (
    <Section band>
      <SectionHeader
        align="center"
        eyebrow="The workspace"
        title="Everything lands in one place you can read"
        lead="Runs, checkpoints, approvals and the audit trail — in the same workspace your team already lives in."
      />
      <div className="mt-12 rounded-3xl border p-4 sm:p-8 [background:radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_70%)]">
        <Placeholder label="TaskForce workspace" ratio="16 / 9" className="bg-card/70 shadow-lg" />
      </div>
    </Section>
  );
}
