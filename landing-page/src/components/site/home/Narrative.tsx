import { ArrowRight } from "lucide-react";
import { Section, SectionHeader, FeatureBand, LevelBadge } from "../Section";
import { BrandLogo } from "../BrandLogo";
import { Placeholder } from "../Placeholder";

/**
 * Narrative - la thèse, les 3 temps, le pipeline, les agents.
 * Aucun logo client, aucun témoignage : la preuve est technique (décision D9).
 * Les logos ici sont des OUTILS (pas des clients) - on les a, donc on les met.
 */

/* ─────────────────────────  1. Le mur de logos  ───────────────────────── */

/** Clés du catalogue de connecteurs - vrais logos vendorisés (`public/logos/`). */
const WALL = [
  { key: "github", label: "GitHub" },
  { key: "gitlab", label: "GitLab" },
  { key: "linear", label: "Linear" },
  { key: "slack", label: "Slack" },
  { key: "notion", label: "Notion" },
  { key: "figma", label: "Figma" },
  { key: "sentry", label: "Sentry" },
  { key: "vscode", label: "VS Code" },
  { key: "docker", label: "Docker" },
  { key: "anthropic", label: "Anthropic" },
];

export function LogoWall() {
  return (
    <section className="bg-card border-b">
      <div className="container-rail py-12">
        <p className="text-muted-foreground text-center text-[13px]">
          Runs alongside the tools your team already opens every morning
        </p>
        <ul className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {WALL.map((b) => (
            <li key={b.key} className="flex flex-col items-center gap-3">
              <BrandLogo
                brand={b.key}
                label={b.label}
                className="h-7 opacity-60 grayscale transition-[opacity,filter] duration-200 hover:opacity-100 hover:grayscale-0"
              />
              <span className="text-muted-foreground text-[12.5px]">{b.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────────  1a. Manifeste (entre le hero et le problème)  ─────────────────────────
 * Décision review 3 (27/07) : une phrase-catégorie à dimension historique, façon Linear -
 * le workflow a été fait pour des humains qui se passent des documents ; l'IA change le
 * bâtisseur ; le workflow doit changer aussi. Pose la thèse avant d'énoncer le problème. */

export function Manifesto() {
  return (
    <section className="bg-secondary border-b">
      <div className="container-rail py-20 lg:py-28">
        <div className="max-w-3xl">
          <p className="t-eyebrow">Why now</p>
          <p className="t-h2 mt-4">
            Software delivery was built for humans passing documents.
            <br />
            AI changes who produces the work.
            <br />
            <span className="text-primary">
              The workflow must evolve around human judgment, not replace it.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  1b. Teaser Brain OS « memory layer » (tôt)  ─────────────────────────
 * Décision review (26/07 → 27/07, reviews 5-6) : Brain OS arrivait trop tard. On le TEASE tôt
 * (bande fine, une phrase), la démonstration complète reste plus bas (Synergy → « Inside Brain
 * OS »). Un seul nom : « Brain OS », descripteur « the memory layer » (plus « context layer »). */

export function BrainTeaser() {
  return (
    <section className="bg-card border-b">
      <div className="container-rail py-14">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <p className="t-eyebrow">TaskForce Memory</p>
              <span className="text-muted-foreground text-[12px]">powered by Brain OS</span>
            </div>
            <h2 className="t-h3 mt-2">Your organization has memory. Your AI should too.</h2>
            <p className="text-muted-foreground mt-2 text-[14px] leading-6">
              Every architectural decision, constraint and convention becomes reusable intelligence -
              so a senior stops re-explaining the system for two hours, and the next run (or the next
              hire) never starts from a blank page.
            </p>
          </div>
          <a
            href="/product/brain-os"
            className="link-underline text-primary inline-flex shrink-0 items-center gap-1 text-[14px] font-medium"
          >
            Inside TaskForce Memory
            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────  2. Anatomie d'un run  ───────────────────────── */

/**
 * Remplace le « how it works » en trois cartes : ici on montre, checkpoint par checkpoint,
 * ce qui atterrit réellement dans le workspace et ce que la personne décide.
 * L'ordre est le vrai ordre d'exécution - c'est ce qui fait l'explication.
 */
const ANATOMY: { step: string; by: string; artifact: string; decision: string; level?: "live" | "beta" | "labs" }[] = [
  {
    step: "Vision",
    by: "CPO agent",
    artifact: "One page: the problem, who has it, what « done » would look like.",
    decision: "Approve the framing, or reframe it before anything is built on top.",
    level: "labs",
  },
  {
    step: "Product spec",
    by: "CPO agent",
    artifact: "Stories with acceptance criteria, and the edge cases nobody asked about.",
    decision: "Approve, or send it back with what is missing.",
    level: "labs",
  },
  {
    step: "Architecture",
    by: "CTO agent",
    artifact: "The proposed approach - and the option that was rejected, with the reason.",
    decision: "Approve the trade-off. This is the decision that is expensive to reverse later.",
    level: "labs",
  },
  {
    step: "API contract",
    by: "CTO agent",
    artifact: "Endpoints, payloads and error cases, written against your existing conventions.",
    decision: "Approve or amend. Downstream steps are generated from what you sign here.",
    level: "labs",
  },
  {
    step: "Breakdown",
    by: "COO agent",
    artifact: "Issues, sized and ordered, each one linked back to the line of spec it came from.",
    decision: "Approve - then Smart Assign routes each issue to a person.",
    level: "live",
  },
  {
    step: "Implementation",
    by: "Your coding agent",
    artifact: "A branch. TaskForce hands over the context and stays out of the way.",
    decision: "Your normal code review. We do not replace it.",
    level: "live",
  },
  {
    step: "QA & deploy",
    by: "COO agent",
    artifact: "A checklist derived from the acceptance criteria you approved in step two.",
    decision: "Sign off. The whole chain is in the audit trail.",
    level: "beta",
  },
];

export function Anatomy() {
  return (
    <Section band>
      <SectionHeader
        eyebrow="Anatomy of a run"
        title="Every checkpoint leaves something behind that you can read"
        lead="This is the whole product, in order. Not a black box that returns a pull request - a sequence of artifacts, each one attributable, each one refusable."
      />

      <div className="bg-card mt-14 overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <caption className="sr-only">
            What each checkpoint of a run produces and what the human decides
          </caption>
          <thead>
            <tr className="bg-secondary/50 text-muted-foreground text-[11px] tracking-[0.06em] uppercase">
              <th scope="col" className="px-5 py-3 font-medium">Checkpoint</th>
              <th scope="col" className="rail-x px-5 py-3 font-medium">Produced by</th>
              <th scope="col" className="rail-x px-5 py-3 font-medium">What lands in your workspace</th>
              <th scope="col" className="rail-x px-5 py-3 font-medium">What you decide</th>
            </tr>
          </thead>
          <tbody>
            {ANATOMY.map((r, i) => (
              <tr key={r.step} className="border-t align-top transition-colors hover:bg-secondary/30">
                <th scope="row" className="px-5 py-4 text-left">
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="text-[14px] font-medium text-foreground">{r.step}</span>
                    {r.level && <LevelBadge level={r.level} />}
                  </span>
                </th>
                <td className="rail-x text-muted-foreground px-5 py-4 text-[13px] whitespace-nowrap">
                  {r.by}
                </td>
                <td className="rail-x px-5 py-4 text-[13.5px] leading-6 text-foreground">
                  {r.artifact}
                </td>
                <td className="rail-x text-muted-foreground px-5 py-4 text-[13.5px] leading-6">
                  {r.decision}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground mt-6 text-[13px]">
        Seven checkpoints is the default. A run can be shortened - a bug fix rarely needs a vision
        step - but it cannot skip the approval.
      </p>
    </Section>
  );
}

/* ─────────────────────────  4. Le pipeline  ───────────────────────── */

/**
 * Suite directe du hero : la scène s'arrêtait sur votre approbation, celle-ci
 * reprend au battement suivant. Même run, même issue, même écran - c'est ce
 * plan-séquence qui fait qu'on suit quelque chose au lieu de feuilleter des
 * fonctionnalités.
 */
export function Pipeline() {
  return (
    <FeatureBand
      tinted
      eyebrow="Assignment"
      level="labs"
      title="The breakdown goes out - to people, and to agents"
      lead="Once you approve the spec, TaskForce splits it into issues and routes each one. A coding agent is an assignee like any other: same card, same column, same review checkpoint."
      aside={
        <>
          Smart Assign writes down <span className="text-foreground">why</span>, so a routing you
          disagree with is one you can argue with.
          <span className="text-muted-foreground block pt-3">
            Claude Code here, or any coding agent you already run. TaskForce hands over the context
            and stays out of the way.
          </span>
        </>
      }
      cta={{ label: "How assignment works", href: "/product/smart-assign" }}
    >
      <Placeholder label="Assignment - Smart Assign" />
    </FeatureBand>
  );
}

/**
 * Le troisième plan : ce que l'agent a réellement fait. C'est la scène qui ferme
 * la boucle - l'étape marquée `criterion 4` travaille sur la ligne née du
 * commentaire humain du hero.
 */
export function AgentDelivery() {
  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-14">
        <div>
          <SectionHeader
            eyebrow="The agent's work"
            level="labs"
            title="You get the work back, not a black box"
            lead="Delegating to an agent is only worth it if you can read what it did. Every step is a fact you can open: a file, a diff, a test result, a pull request number."
          />
          <ul className="mt-8 flex flex-col gap-3">
            {[
              "The step that edits the service carries the acceptance criterion it serves - the one your comment created.",
              "Tests run before the pull request exists, and the result is written down.",
              "The pull request does not merge itself. It goes back through your normal review.",
            ].map((b) => (
              <li key={b} className="flex gap-3 text-[14px] leading-6 text-foreground">
                <span className="bg-primary mt-[9px] size-1.5 shrink-0 rounded-full" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
          <a
            href="/product/agents"
            className="link-underline text-primary mt-8 inline-block text-[14px] font-medium"
          >
            See how agents are supervised
          </a>
        </div>
        <Placeholder label="Agent run" />
      </div>
    </Section>
  );
}

/* ─────────────────────────  5. Les agents  ───────────────────────── */

export function Agents() {
  return (
    <FeatureBand
      band
      eyebrow="Agents"
      level="labs"
      title="Three responsibilities, not one generalist"
      lead="A single agent asked to do everything produces work nobody can review. Split the run the way a team already splits it, and every output has an owner - and a reviewer who knows what they are looking at."
      aside={
        <>
          The hand-off between roles is exactly where a checkpoint belongs.
          <span className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-[13px]">
            <LevelBadge level="labs" />
            Not shipped yet - dated on the{" "}
            <a href="/roadmap" className="link-underline text-foreground">
              public roadmap
            </a>
            .
          </span>
        </>
      }
    />
  );
}

/* ─────────────────────────  6. Human-in-the-loop  ───────────────────────── */

export function Approvals() {
  return (
    <Section>
      <div className="max-w-2xl">
        <SectionHeader
          eyebrow="Human in the loop"
          level="beta"
          title="Autonomy you can actually sign off on"
          lead="The point is not to remove the human. It is to give the human something worth reviewing, at the moment the decision still costs nothing to change."
        />
        <ul className="mt-8 flex flex-col gap-3">
          {[
            "Nothing advances to the next step without an approval.",
            "Every approval and rejection is written to the audit trail, with who and when.",
            "Rejections carry your comment into the next attempt.",
          ].map((b) => (
            <li key={b} className="flex gap-3 text-[14px] leading-6 text-foreground">
              <span className="bg-primary mt-[9px] size-1.5 shrink-0 rounded-full" aria-hidden />
              {b}
            </li>
          ))}
        </ul>
        <a href="/product/approvals" className="link-underline text-primary mt-8 inline-block text-[14px] font-medium">
          See how approvals work
        </a>
      </div>
    </Section>
  );
}
