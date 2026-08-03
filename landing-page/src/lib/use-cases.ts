/**
 * use-cases.ts — les 10 use-cases (job-to-be-done) du plan (Plan_Refonte_Site.md §3.1).
 * Chaque entrée porte son statut RÉEL : `labs`/Planned quand ça dépend de l'orchestration (pas livrée),
 * `beta` quand une feature shippée l'adosse (approvals, memory, cycles/analytics, onboarding). Zéro survente.
 */
import type { Maturity } from "@/components/site/nav";

export type UseCase = {
  key: string;
  name: string;
  level: Maturity;
  lead: string;
  what: string;
  inRun: string[];
  status: string;
  links: { href: string; label: string }[];
};

const ORCH = { href: "/product/orchestration", label: "See the run" };
const APPROVALS = { href: "/product/approvals", label: "Approvals" };
const MEMORY = { href: "/product/brain-os", label: "TaskForce Memory" };

export const USE_CASES: Record<string, UseCase> = {
  "product-spec": {
    key: "product-spec",
    name: "Product spec",
    level: "labs",
    lead: "Turn an outcome into a product spec — stories, acceptance criteria, edge cases — as a reviewed artifact, not a doc written from scratch.",
    what: "A product agent frames the problem and drafts the spec from your workspace context. It's a proposal, not a decision: a human reviews it, and once approved it becomes trusted context the rest of the run builds on.",
    inRun: [
      "Frame the problem, the users and the definition of done",
      "Draft stories and acceptance criteria",
      "Surface edge cases and priorities",
      "A human reviews, edits or approves",
    ],
    status: "Approving a drafted spec — so it becomes context in Memory — ships today. Generating the full spec is part of the Planned orchestration.",
    links: [ORCH, APPROVALS],
  },
  "architecture-decision": {
    key: "architecture-decision",
    name: "Architecture decision",
    level: "labs",
    lead: "Propose an approach and API contract with the trade-offs and risks made explicit — for a human to approve before anything is built.",
    what: "A technical agent proposes architecture, trade-offs and the API contract, grounded in your existing decisions and constraints. The value isn't a confident answer — it's a decision a human can weigh, approve and have remembered.",
    inRun: [
      "Propose an approach, with the trade-offs stated",
      "Write the API contract — endpoints, payloads, errors",
      "Flag technical risks and constraints",
      "A human approves; the decision and why are kept",
    ],
    status: "Part of the Planned orchestration. The Memory that keeps decisions and their reasoning ships today.",
    links: [ORCH, MEMORY],
  },
  "backlog-grooming": {
    key: "backlog-grooming",
    name: "Backlog grooming",
    level: "labs",
    lead: "Break an outcome into issues — estimated, sequenced and ready to assign — instead of grooming a backlog by hand.",
    what: "From an approved spec, a delivery agent proposes the breakdown: issues, dependencies, estimates and a delivery order. You review it, and Smart Assign can route each issue to the right owner — person or coding agent.",
    inRun: [
      "Break the work into issues from the spec",
      "Propose estimates, dependencies and a sequence",
      "A human adjusts and approves",
      "Route each issue with Smart Assign",
    ],
    status: "The breakdown is part of the Planned orchestration. Smart Assign — routing issues to the right owner — ships today.",
    links: [ORCH, { href: "/product/smart-assign", label: "Smart Assign" }],
  },
  "code-review": {
    key: "code-review",
    name: "Code review",
    level: "beta",
    lead: "Keep a human on the change: review and approve work, and link pull requests and commits back to the issue they belong to.",
    what: "TaskForce doesn't replace your code review — it governs it. A change is reviewed and approved as a checkpoint, and GitHub pull requests or commits link to the TaskForce issue, tracking live status (Open, Merged, Closed).",
    inRun: [
      "Link a PR or commit to the issue",
      "The link tracks status — Open, Merged, Closed",
      "A human approves before it counts as done",
      "The approval is recorded",
    ],
    status: "Human approval and GitHub PR/commit links ship today (Beta). The full checkpoint chain across a run is Planned.",
    links: [APPROVALS, { href: "/product/integrations/github", label: "GitHub integration" }],
  },
  "qa-testing": {
    key: "qa-testing",
    name: "QA & testing",
    level: "labs",
    lead: "Verify the work against the original acceptance criteria before it's signed off.",
    what: "A delivery agent derives a QA checklist from the acceptance criteria written earlier in the run, so verification maps straight back to what was agreed — not a generic checklist bolted on at the end.",
    inRun: [
      "Derive checks from the original acceptance criteria",
      "Verify the delivered work against them",
      "Flag gaps for a human to judge",
      "Sign off against the criteria the run started from",
    ],
    status: "Part of the Planned orchestration — it depends on the earlier checkpoints producing the acceptance criteria.",
    links: [ORCH],
  },
  documentation: {
    key: "documentation",
    name: "Documentation",
    level: "beta",
    lead: "The spec, the decision and the sign-off are outputs of the run itself, kept in Memory — not homework once the work is done.",
    what: "Because each stage produces a reviewed artifact, your documentation is a byproduct of delivery. Memory keeps the decisions, constraints and reasoning as a graph the next run can read — instead of pages someone has to keep current.",
    inRun: [
      "Artifacts produced at each checkpoint",
      "Decisions and reasoning kept in Memory",
      "Retrievable by the next run, as context",
      "No separate doc to write or maintain",
    ],
    status: "Memory ships today (Beta). The full chain of artifacts grows as orchestration lands.",
    links: [MEMORY, ORCH],
  },
  onboarding: {
    key: "onboarding",
    name: "Onboarding",
    level: "beta",
    lead: "A new teammate reads why the system is the way it is — instead of asking around and piecing it together.",
    what: "The decisions, constraints and trade-offs behind your project live in Memory, not in people's heads. A new person can retrieve the reasoning directly. A short onboarding also captures each member's skills, so work gets routed well from day one.",
    inRun: [
      "Retrieve the decisions behind the system from Memory",
      "Understand constraints and rejected alternatives",
      "Capture skills in a short onboarding",
      "Smart Assign routes work to the right people",
    ],
    status: "Memory and the onboarding that feeds Smart Assign ship today (Beta).",
    links: [MEMORY, { href: "/product/smart-assign", label: "Smart Assign" }],
  },
  "incident-postmortem": {
    key: "incident-postmortem",
    name: "Incident postmortem",
    level: "labs",
    lead: "Run a postmortem as governed stages, and keep the lessons where the next decision can find them.",
    what: "A postmortem is reviewed, approved work whose whole point is to be remembered. The governed-run pattern fits it well: produce the analysis, have a human approve it, and keep the lessons in Memory so they inform future decisions.",
    inRun: [
      "Gather the timeline and contributing factors",
      "Propose findings and actions for review",
      "A human approves the conclusions",
      "Lessons kept in Memory for next time",
    ],
    status: "Exploratory. The Memory that would keep the lessons ships today; a postmortem-specific workflow is not something we've shipped.",
    links: [MEMORY, ORCH],
  },
  "release-notes": {
    key: "release-notes",
    name: "Release notes",
    level: "labs",
    lead: "Turn a run's approved artifacts into release notes — drawn from what actually shipped, not written from memory.",
    what: "Because each stage of a run produces a reviewed artifact, the raw material for release notes already exists. Drafting them from those artifacts, for a human to approve, is a natural fit — and one we mark honestly as not yet shipped.",
    inRun: [
      "Draw from the approved artifacts of the run",
      "Draft notes grouped by what changed",
      "A human edits and approves",
      "Publish, with the source traceable",
    ],
    status: "Exploratory — it depends on the run producing the artifact chain, which is Planned.",
    links: [ORCH],
  },
  "sprint-planning": {
    key: "sprint-planning",
    name: "Sprint planning",
    level: "beta",
    lead: "Plan a cycle with real capacity and workload from the board — not a guess on a whiteboard.",
    what: "Cycles, issues and team workload are live in TaskForce. Planning a sprint starts from what your board actually contains: who's loaded, what's in flight, what slipped. AI-assisted sequencing of the plan is the part that grows with orchestration.",
    inRun: [
      "Group work into a cycle",
      "See capacity and workload, day by day",
      "Sequence with dependencies in view",
      "Route the work with Smart Assign",
    ],
    status: "Cycles and workload analytics ship today (Beta). AI-assisted planning is part of the Planned orchestration.",
    links: [{ href: "/product/analytics", label: "Analytics" }, { href: "/product/collaboration", label: "Collaboration" }],
  },
};

/** Ordre d'affichage du hub (= ordre du plan). */
export const USE_CASE_ORDER = [
  "product-spec",
  "architecture-decision",
  "backlog-grooming",
  "code-review",
  "qa-testing",
  "documentation",
  "onboarding",
  "incident-postmortem",
  "release-notes",
  "sprint-planning",
];
