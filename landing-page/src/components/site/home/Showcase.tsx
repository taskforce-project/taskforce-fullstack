import { useState } from "react";
import { ArrowRight, Play, Quote, ScrollText, Server, GitBranch, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionHeader } from "../Section";
import { Placeholder, LogoPlaceholder } from "../Placeholder";
import { DecisionGraph } from "./DecisionGraph";
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
];

export function TeamGrid() {
  const eng = TEAMS[0]; // Engineering — le wedge assumé (review 5, Option A). Statique, plus d'onglet.

  return (
    <Section band>
      <SectionHeader
        eyebrow="Who it’s for"
        title="Built for engineering teams first"
        lead="TaskForce is engineering-first, and we don’t hide it. But a governed run with a sign-off at each step isn’t specific to code — it expands to every team that ships reviewed work."
      />

      {/* Le wedge assumé : les cas engineering en clair, l'élargissement annoncé (pas simulé). */}
      <div className="mt-10 flex items-center gap-3">
        <span className="text-primary text-[12px] font-semibold tracking-[0.06em] uppercase">
          Engineering
        </span>
        <span className="bg-border h-px flex-1" />
      </div>

      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {eng.cards.map((c) => (
          <li key={c.title} className="card-hover bg-card flex flex-col rounded-2xl border p-5">
            <h3 className="text-[15px] font-semibold text-foreground">{c.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-[13.5px] leading-6">{c.text}</p>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-8">
        <p className="text-muted-foreground max-w-xl text-[14px]">
          <span className="text-foreground font-medium">Start with one workflow, not a migration.</span>{" "}
          TaskForce is the missing layer between your tracker and your coding agent — it sits on top
          of the board, repo and review you already use.
        </p>
        <Button asChild size="pill">
          <a href="/book-a-demo">Book a demo</a>
        </Button>
      </div>
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
        title="Start with one workflow, not a migration"
        lead="No rip-and-replace. TaskForce is the missing layer between your tracker and your coding agent — it sits on top of the board, repo and review you already use, and hands the work back."
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

/* ─────────────────────────  F. Témoignage + vidéo (placeholder)  ─────────────────────────
 * Archétype « The ability to be vendor agnostic… » : citation à gauche, vidéo à
 * droite, onglets-logos au-dessus. On n'a PAS de clients → tout est placeholder
 * (règle d'honnêteté D9). La STRUCTURE est là, à remplir quand on aura des cas. */

export function Testimonials() {
  return (
    <Section band>
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Quote className="text-primary/30 size-8" />
          <div className="mt-4 space-y-2.5">
            <div className="bg-secondary/70 h-4 w-full rounded" />
            <div className="bg-secondary/70 h-4 w-[92%] rounded" />
            <div className="bg-secondary/70 h-4 w-[70%] rounded" />
          </div>
          <p className="text-muted-foreground mt-6 text-[13px]">
            Customer stories go here once early teams are live — a real quote, name and role.
          </p>
        </div>

        <div>
          {/* Onglets-logos (placeholder) au-dessus de la vidéo. */}
          <div className="flex gap-2 border-b pb-3">
            {[0, 1, 2].map((i) => (
              <LogoPlaceholder key={i} className="h-6 w-20" />
            ))}
          </div>
          <div className="relative mt-4">
            <Placeholder label="Customer video" ratio="16 / 10" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="bg-card/90 flex size-14 items-center justify-center rounded-full border shadow-lg">
                <Play className="text-foreground ml-0.5 size-5" />
              </span>
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ─────────────────────────  G. Les pièces se renforcent (carousel + bento)  ─────────────────────────
 * Archétype « On one platform, the pieces make each other better » : une rangée
 * de combo-cards (A + B, mini-visuel placeholder) puis une grande carte bento
 * (contexte partagé). Porte l'argument « un seul système » de façon concrète. */

const SYSTEMS = [
  { verb: "Plan", part: "Agent runtime", text: "Agents draft each checkpoint — the vision, the spec, the architecture." },
  { verb: "Remember", part: "TaskForce Memory", text: "Links every decision, constraint and trade-off — with the reason attached." },
  { verb: "Execute", part: "Workflow engine", text: "The governed run: checkpoints, approvals and assignment." },
  { verb: "Verify", part: "Audit system", text: "Every decision, approval and model call, recorded." },
];

export function Synergy() {
  return (
    <Section band>
      <SectionHeader
        index="2.0"
        indexHref="/product"
        eyebrow="Why it’s different"
        title="A delivery system, not an assistant"
        lead="Most AI tools optimize execution. TaskForce optimizes the system that decides what gets executed — one platform where planning, memory, the governed run and the audit trail already know about each other, instead of four tools you wire together."
      />

      {/* Le « pourquoi les outils actuels ne suffisent pas », en trois lignes (review 4). */}
      <p className="mt-8 max-w-2xl text-[16px] leading-8 font-medium text-foreground">
        Agents without context become assistants.
        <br />
        Context without execution becomes documentation.
        <br />
        <span className="text-primary">TaskForce connects both.</span>
      </p>

      <ul className="bg-border mt-12 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-4">
        {SYSTEMS.map((s, i) => (
          <li key={s.part} className="bg-card flex flex-col p-6">
            <span className="text-muted-foreground font-mono text-[12px] tracking-[0.12em]">
              {`0${i + 1}`}
            </span>
            <h3 className="mt-2 text-[16px] font-semibold text-foreground">{s.verb}</h3>
            <p className="text-muted-foreground mt-0.5 text-[12px]">{s.part}</p>
            <p className="text-muted-foreground mt-2 text-[13.5px] leading-6">{s.text}</p>
          </li>
        ))}
      </ul>

      {/* Bento : la couche de savoir — c'est elle qui retient le contexte (lien avec « The problem »). */}
      <div className="bg-card mt-5 grid items-center gap-8 rounded-2xl border p-6 sm:p-8 lg:grid-cols-2 lg:gap-14">
        <div>
          <h3 className="t-h3">Git remembers what changed. TaskForce remembers why.</h3>
          <p className="text-muted-foreground mt-3 text-[14px] leading-7">
            Not a search box over your docs — a map of why. TaskForce Memory links the decisions,
            constraints and trade-offs behind the system, and how they connect. Every run reads why
            the system is the way it is, and writes its own decisions back. Retrieval hands you
            passages; this hands you the reasoning.
          </p>
          <a
            href="/product/brain-os"
            className="link-underline text-primary mt-6 inline-flex items-center gap-1 text-[14px] font-medium"
          >
            Inside TaskForce Memory
            <ArrowRight className="size-4" />
          </a>
        </div>
        <DecisionGraph />
      </div>

      {/* Gain quotidien (fondu depuis l'ancien Pillars) — équilibre le discours de contrôle. */}
      <p className="text-muted-foreground mt-10 max-w-2xl text-[14px] leading-7">
        The payoff is daily: fewer meetings, fewer half-written tickets, less context re-explained —
        and agents that already understand your system.
      </p>
    </Section>
  );
}

/* ─────────────────────────  H. Grand bloc feature + sous-features + bullets  ─────────────────────────
 * Gabarit riche à la Linear (« Set the product direction ») : un grand visuel,
 * puis 2-3 sous-blocs, puis une rangée de petites features à icône. Sert le
 * mécanisme du run (l'ancien Pipeline/Approvals, en un seul bloc dense). */

const RUN_SUB = [
  { title: "Every step is attributable", text: "Each checkpoint names what produced it and the model it ran on." },
  { title: "Nothing advances without you", text: "The run stops at each checkpoint and waits for a human to approve." },
  { title: "Rejections carry your comment", text: "Send a step back with a note and it comes into the next attempt." },
];

const RUN_BULLETS = [
  { icon: ScrollText, label: "Full audit trail", text: "Who approved what, and when." },
  { icon: Server, label: "Self-hosted", text: "Your infrastructure, your network." },
  { icon: GitBranch, label: "Any coding agent", text: "Claude Code, Cursor, or your own." },
  { icon: Cpu, label: "A model per step", text: "Routine local, hard steps stronger." },
];

export function FeatureShowcase() {
  return (
    <Section>
      <SectionHeader
        eyebrow="The run"
        title="One run, seven checkpoints, a human at each one"
        lead="A delivery is a sequence of decisions, not a single prompt. TaskForce makes each one explicit, attributable and reversible."
      />

      <div className="mt-12 rounded-2xl border p-4 sm:p-8 [background:radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_7%,transparent),transparent_70%)]">
        <Placeholder label="The run, checkpoint by checkpoint" ratio="16 / 8" className="bg-card/70 shadow-lg" />
      </div>

      <div className="mt-10 grid gap-8 sm:grid-cols-3">
        {RUN_SUB.map((s) => (
          <div key={s.title}>
            <Placeholder label="" ratio="16 / 9" className="mb-4" />
            <h3 className="text-[15px] font-semibold text-foreground">{s.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-[13.5px] leading-6">{s.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 grid gap-x-8 gap-y-6 border-t pt-8 sm:grid-cols-2 lg:grid-cols-4">
        {RUN_BULLETS.map((b) => (
          <div key={b.label} className="flex gap-3">
            <b.icon className="text-muted-foreground mt-0.5 size-5 shrink-0" strokeWidth={1.75} />
            <div>
              <p className="text-[14px] font-medium text-foreground">{b.label}</p>
              <p className="text-muted-foreground text-[13px] leading-5">{b.text}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ─────────────────────────  I. Trois piliers (façon Linear « FIG 0.x »)  ─────────────────────────
 * Gabarit repris tel quel de la home de Linear : les 3 cartes juste après le hero
 * (« Purpose-built / Powered by agents / Designed for speed »). Étiquette monospace
 * « FIG 0x », titre court, une ligne. Ici : les 3 piliers du différenciateur, posés
 * juste après le problème — la réponse en trois affirmations avant la démonstration. */

const PILLARS = [
  { n: "01", title: "Governed by design", text: "An agent drafts each step; a human approves it. Nothing ships on its own." },
  { n: "02", title: "Yours to run", text: "Self-hosted, a model per step, and any coding agent you already use." },
  { n: "03", title: "On the record", text: "Every decision, approval and model call lands in one audit trail." },
];

export function Pillars() {
  return (
    <Section band>
      <SectionHeader
        align="center"
        eyebrow="Why it’s different"
        title="A delivery system, not an assistant"
        lead="Most AI tools optimize execution. TaskForce optimizes the system that decides what gets executed — a governed run you can watch, approve and audit."
      />
      <ul className="bg-border mt-14 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-3">
        {PILLARS.map((p) => (
          <li key={p.n} className="bg-card flex flex-col p-7">
            <Placeholder label="" ratio="16 / 10" className="mb-6" />
            <span className="text-muted-foreground font-mono text-[12px] tracking-[0.12em]">{p.n}</span>
            <h3 className="mt-2 text-[16px] font-semibold text-foreground">{p.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-[13.5px] leading-6">{p.text}</p>
          </li>
        ))}
      </ul>

      {/* Équilibrer le contrôle par le GAIN QUOTIDIEN (review 8 : trop de gouvernance, pas assez
          de bénéfice dev au jour le jour). */}
      <p className="text-muted-foreground mx-auto mt-10 max-w-2xl text-center text-[15px] leading-7">
        The payoff is daily: fewer meetings, fewer half-written tickets, less context re-explained —
        and agents that already understand your system.
      </p>
    </Section>
  );
}

/* ─────────────────────────  J. « Built on strong foundations » (liste + visuel)  ─────────────────────────
 * Gabarit Linear : en-tête, puis liste de fondations à gauche (index monospace + titre
 * + une ligne) et un visuel à droite qui reflète la fondation sélectionnée. Rendu
 * INTERACTIF (clic → change le visuel) → îlot `client:idle`. Les descriptions restent
 * toujours visibles : pas de repli animé, donc aucun décalage de mise en page (CLS). */

const FOUNDATIONS = [
  { n: "01", title: "Self-hosting", text: "Run TaskForce and your models on your own infrastructure — a first-class Enterprise deployment.", visual: "Self-hosted deployment" },
  { n: "02", title: "Audit trail", text: "Every decision, approval and model call is recorded: who, what, when, and on whose hardware.", visual: "Audit trail" },
  { n: "03", title: "A model per step", text: "Routine steps on a model you host; the hard ones can call something stronger, or never leave your network.", visual: "Model routing" },
  { n: "04", title: "Access control", text: "SSO and SAML through Keycloak, roles and permissions, and per-project access.", visual: "SSO & roles" },
  { n: "05", title: "Production-grade core", text: "The same engine the product runs on: real-time boards, migrations, backups and monitoring — built to run in production, not just to demo.", visual: "Production core" },
];

export function Foundations() {
  const [active, setActive] = useState(0);
  const item = FOUNDATIONS[active];

  return (
    <Section band>
      <SectionHeader
        index="3.0"
        indexHref="/trust"
        eyebrow="Foundations"
        title="Built on strong foundations"
        lead="The run is the visible part. Underneath it is the boring, load-bearing work an enterprise actually asks about — and the part that is hard to bolt on later."
      />

      <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        {/* Liste interactive à gauche */}
        <ul className="flex flex-col">
          {FOUNDATIONS.map((f, i) => {
            const on = i === active;
            return (
              <li key={f.n}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-pressed={on}
                  className={cn(
                    "flex w-full items-start gap-4 border-l-2 py-4 pl-5 text-left transition-colors",
                    on ? "border-primary" : "border-border hover:border-[#c9c9d0]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 font-mono text-[11px] tracking-[0.1em]",
                      on ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {f.n}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-[15px] font-semibold",
                        on ? "text-foreground" : "text-foreground/70",
                      )}
                    >
                      {f.title}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-[13.5px] leading-6">
                      {f.text}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Visuel à droite : reflète la fondation active. */}
        <div className="lg:sticky lg:top-28">
          <Placeholder key={item.visual} label={item.visual} ratio="4 / 3" className="shadow-lg" />
        </div>
      </div>
    </Section>
  );
}

/* ─────────────────────────  K. Avant / Après (résumé de la proposition)  ─────────────────────────
 * Décision review (27/07) : une démonstration VISUELLE qui résume toute la proposition —
 * la chaîne longue et fuyante d'aujourd'hui vs le run court et gouverné. Statique, aucune
 * fausse donnée : juste deux flux, l'un long (6 mains), l'autre court (4 étapes). La longueur
 * qui diffère PORTE le message (moins de mains = moins d'endroits où le contexte se perd). */

/** L'idée centrale, rendue VISIBLE : à chaque main, ce que le contexte perd (review 13). */
const BEFORE: { step: string; loss?: string }[] = [
  { step: "Intent", loss: "lives in someone’s head" },
  { step: "Meetings", loss: "notes scattered, half-remembered" },
  { step: "Specs", loss: "written once, never updated" },
  { step: "Tickets", loss: "the reason gets dropped" },
  { step: "Prompts", loss: "the agent is re-briefed from scratch" },
  { step: "Review", loss: "the original context is already gone" },
];
const AFTER: { step: string; loss?: string }[] = [
  { step: "Outcome" },
  { step: "Context" },
  { step: "Plan" },
  { step: "Approvals" },
  { step: "Ship" },
];

function Flow({ steps, tone }: { steps: { step: string; loss?: string }[]; tone: "muted" | "primary" }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((s, i) => (
        <li key={s.step} className="relative flex items-start gap-3">
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                "absolute top-7 -bottom-3 left-[13px] w-px",
                tone === "primary" ? "bg-primary/30" : "bg-border",
              )}
            />
          )}
          <span
            className={cn(
              "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
              tone === "primary"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground border",
            )}
          >
            {i + 1}
          </span>
          <div className="min-w-0 pt-1">
            <span
              className={cn(
                "text-[14px]",
                tone === "primary" ? "text-foreground font-medium" : "text-foreground/70",
              )}
            >
              {s.step}
            </span>
            {s.loss && (
              <span className="text-muted-foreground/70 mt-0.5 block text-[12.5px] leading-5">
                {s.loss}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function BeforeAfter() {
  return (
    <Section>
      <SectionHeader
        align="center"
        eyebrow="From idea to shipped"
        title="Same outcome. Fewer places for context to disappear."
        lead="The building is the same. What changes is how many times the context has to survive a handoff."
      />

      <div className="mt-12 grid gap-5 lg:grid-cols-2 lg:gap-6">
        {/* Avant */}
        <div className="bg-secondary/40 rounded-2xl border p-6 sm:p-8">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-[12px] font-semibold tracking-[0.06em] uppercase">
              Before TaskForce
            </span>
            <span className="text-muted-foreground text-[12px]">6 handoffs · context leaks at each</span>
          </div>
          <Flow steps={BEFORE} tone="muted" />
        </div>

        {/* Après */}
        <div className="relative overflow-hidden rounded-2xl border p-6 sm:p-8 [background:radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_70%)]">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-2">
            <span className="text-primary text-[12px] font-semibold tracking-[0.06em] uppercase">
              With TaskForce
            </span>
            <span className="text-muted-foreground text-[12px]">One governed run · context kept</span>
          </div>
          <Flow steps={AFTER} tone="primary" />
        </div>
      </div>
    </Section>
  );
}
