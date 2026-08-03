/**
 * labs.ts — données des pages `/labs/{key}`.
 * DÉCISION D11 : Labs dit SUR QUOI on travaille + le bénéfice visé. JAMAIS le COMMENT (architecture,
 * boucle de raisonnement, méthode d'éval). Chaque page dit aussi ce qui SHIPPE vs ce qui est recherche.
 */

export type Lab = {
  key: string;
  name: string;
  lead: string;
  why: string;
  exploring: string[];
  status: string;
  links: { href: string; label: string }[];
};

export const LABS: Record<string, Lab> = {
  "agent-roles": {
    key: "agent-roles",
    name: "Agent roles",
    lead: "Why a small team of scoped agents beats one generalist trying to do everything.",
    why: "A single generalist agent has to be an expert at product, architecture and delivery all at once. Splitting responsibility — the way a strong organization does — makes each proposal more grounded, and far easier for a human to review.",
    exploring: [
      "Scoping an agent's responsibility so it stays in its lane",
      "How specialized roles hand work off to one another",
      "Where a human's judgment sits between them",
    ],
    status: "The direction shows up in Orchestration, which is Planned. This is research, not a shipped feature.",
    links: [{ href: "/product/orchestration", label: "Orchestration" }, { href: "/roadmap", label: "Roadmap" }],
  },
  "run-memory": {
    key: "run-memory",
    name: "Run memory",
    lead: "Runs that start from what your organization already decided — instead of a blank slate.",
    why: "Every run today re-derives context that already exists somewhere. Memory that carries decisions, constraints and rejected alternatives across runs is what makes the next one faster, and more consistent with the last.",
    exploring: [
      "What's actually worth remembering from a run",
      "Retrieving the right context at the right step",
      "How an approved decision becomes durable context",
    ],
    status: "TaskForce Memory ships today in Beta. The deeper run-to-run learning is still research.",
    links: [{ href: "/product/brain-os", label: "TaskForce Memory" }, { href: "/roadmap", label: "Roadmap" }],
  },
  "model-choice": {
    key: "model-choice",
    name: "Model choice",
    lead: "The right model for each step — local or hosted — instead of one model for everything.",
    why: "Different steps have different needs: some want a fast local model, some a stronger hosted one, some must stay on your own hardware. Choosing per step keeps cost, latency and privacy under your control.",
    exploring: [
      "Matching a model to what a step actually needs",
      "Staying independent of any single model provider",
      "How local and hosted models coexist in one run",
    ],
    status: "Running on your models ships today — local through Ollama, or hosted. Automatic per-step routing is research.",
    links: [{ href: "/enterprise", label: "Runtime & models" }, { href: "/roadmap", label: "Roadmap" }],
  },
  "learning-from-reviews": {
    key: "learning-from-reviews",
    name: "Learning from reviews",
    lead: "What you edit, reject or send back should make the next run better.",
    why: "Every override is a signal. A system that learns from what humans correct — without training on your private data — could calibrate its own proposals over time, and eventually tell you how reliable they are.",
    exploring: [
      "Turning overrides into signal",
      "Calibrating proposals without training on your data",
      "Measuring whether a decision was actually right",
    ],
    status: "This is the Prediction & calibration direction — Planned, not shipped. It's the honest edge of what we're building.",
    links: [{ href: "/product/orchestration", label: "Prediction" }, { href: "/roadmap", label: "Roadmap" }],
  },
};
