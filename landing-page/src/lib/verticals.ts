/**
 * verticals.ts - données des verticales `/solutions/{key}` (métiers NON prouvés, décision D10).
 * HONNÊTETÉ : ces pages disent « le modèle POURRAIT s'appliquer », jamais « ça marche ». On n'invente
 * pas de workflow qu'on n'a pas livré. Engineering est le seul métier prouvé (page séparée).
 */

import type { UseCaseDemoSpec } from "@/components/site/illustrations/UseCaseDemo";

export type Vertical = {
  key: string;
  name: string;
  lead: string;
  idea: string;
  couldApply: string[];
  honest: string;
};

/**
 * Un demo ILLUSTRATIF par verticale - la FORME d'un run gouverné appliquée à un artefact de ce métier.
 * Honnêteté (D10) : c'est le *pattern* (prouvé sur l'ingénierie), pas un workflow livré pour ce métier -
 * la page garde le badge « Exploratory » et une légende « the shape, not a shipped workflow ».
 */
export const VERTICAL_DEMOS: Record<string, UseCaseDemoSpec> = {
  product: {
    kind: "draft",
    title: "Spec · Onboarding revamp",
    chip: "Reviewed → approved",
    items: [
      "Outcome: activation +10% in 30 days",
      "AC: 3-step signup, no dead ends",
      "Sequenced: research → spec → build",
      "Owner signs off before build",
    ],
  },
  operations: {
    kind: "draft",
    title: "Runbook · Vendor onboarding",
    chip: "Reviewed → approved",
    items: [
      "Steps: KYC → contract → access",
      "Dependency: legal sign-off first",
      "An owner and an approver per step",
      "Kept as an auditable record",
    ],
  },
  marketing: {
    kind: "draft",
    title: "Campaign · Q3 launch",
    chip: "Reviewed → approved",
    items: [
      "Brief: audience, message, channels",
      "Assets reviewed before they publish",
      "Dependencies and approvals explicit",
      "Reasoning kept for the next campaign",
    ],
  },
  "client-services": {
    kind: "draft",
    title: "Deliverable · Security audit",
    chip: "Sign-off before client",
    items: [
      "Scope agreed and recorded",
      "Findings drafted, then reviewed",
      "Explicit sign-off before delivery",
      "An audit trail the client can rely on",
    ],
  },
};

export const VERTICALS: Record<string, Vertical> = {
  product: {
    key: "product",
    name: "Product",
    lead: "Product teams turn outcomes into specs, priorities and sequenced work - the same shape as a governed run. A natural fit in theory; we haven't proven it as a standalone product workflow.",
    idea: "A governed run - an artifact produced, reviewed and approved before the next step - maps closely to product work: framing an outcome, drafting a spec, setting acceptance criteria, and sequencing what gets built.",
    couldApply: [
      "Frame an outcome into a reviewed spec",
      "Prioritize and sequence with the trade-offs made explicit",
      "Keep the reasoning behind product decisions",
      "A human signs off at each stage",
    ],
    honest: "Engineering is the use we've proven. For product, the pieces exist - specs, approvals, memory - but we haven't shipped a product-specific workflow. We'll build it with real teams rather than claim it.",
  },
  operations: {
    key: "operations",
    name: "Operations",
    lead: "Operational delivery is reviewed, sequenced work with dependencies and a paper trail - the same governed checkpoints could structure it. Exploratory, not proven.",
    idea: "Operations runs on stages that need review and a record. That's exactly what a checkpoint is: an artifact produced, approved, and kept.",
    couldApply: [
      "Structure operational work as governed stages",
      "Keep dependencies and approvals explicit",
      "An auditable trail of who decided what, and when",
      "Memory of past operational decisions",
    ],
    honest: "This is exploration. The governance and memory primitives are real; an operations-specific workflow is not something we've shipped or proven yet.",
  },
  marketing: {
    key: "marketing",
    name: "Marketing",
    lead: "Campaigns are reviewed, approved work with dependencies and a trail - a natural fit for governed runs in theory, unproven in practice.",
    idea: "A campaign is a sequence of reviewed artifacts with sign-offs and dependencies. The governed-run pattern fits the shape of the work.",
    couldApply: [
      "Turn a campaign brief into reviewed stages",
      "Make approvals and dependencies explicit",
      "Keep the reasoning and the record",
      "Route work to the people and tools involved",
    ],
    honest: "We haven't run marketing on TaskForce. It's a plausible fit we're honest about not having proven - so it carries this exploratory label, not a product claim.",
  },
  "client-services": {
    key: "client-services",
    name: "Client services",
    lead: "Client deliverables that need review and sign-off could run on the same rails - exploratory, not proven.",
    idea: "Client work is deliverables plus review plus sign-off - the same governed run, with a clear record for the client.",
    couldApply: [
      "Structure client deliverables as governed stages",
      "An explicit sign-off before anything goes to the client",
      "An audit trail the client can rely on",
      "Memory that carries across engagements",
    ],
    honest: "Exploration, not a shipped workflow. If this is your team, we'd rather build it with you than pretend it already exists.",
  },
};
