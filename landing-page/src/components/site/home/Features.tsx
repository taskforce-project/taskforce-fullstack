import { FeatureSplit, FeatureBand } from "../Section";

/**
 * Features - Brain OS, Smart Assign, modèles & coût, analytics.
 * Sections en TEXTE SEUL (décision user : pas de visuel là où il n'est pas nécessaire).
 */

/* ─────────────────────────  Brain OS  ───────────────────────── */

export function BrainOS() {
  return (
    <FeatureSplit
      band
      reverse
      eyebrow="Brain OS"
      level="beta"
      title="Define the context once, not in every prompt"
      lead="Your architecture, your decisions, your conventions. Agents read from the same place instead of being told again in every request."
      bullets={[
        "Documents and decisions are indexed as you work, not maintained on the side.",
        "Retrieval runs on pgvector with BGE-M3 embeddings - no separate vector database.",
        "Every generated step cites the context it drew from, so you can check it.",
      ]}
      cta={{ label: "Inside Brain OS", href: "/product/brain-os" }}
    />
  );
}

/* ─────────────────────────  Smart Assign  ───────────────────────── */

export function SmartAssign() {
  return (
    <FeatureSplit
      eyebrow="Smart Assign"
      level="live"
      title="The right task reaches the right person"
      lead="Triage is the meeting nobody defends. TaskForce scores five signals, explains the ranking, and lets you override it in one click."
      bullets={[
        "Five signals: skills, current load, history on the area, timezone overlap, recent reviews.",
        "You see the whole ranking, not just the winner - including who came close and why.",
        "Overriding takes one click, and the override becomes a signal of its own.",
      ]}
      cta={{ label: "How Smart Assign scores", href: "/product/smart-assign" }}
    />
  );
}

/* ─────────────────────────  Modèles  ───────────────────────── */

/**
 * ⚠️ Plus aucune promesse de prix dans ce bloc : les vrais montants vivent sur /pricing,
 * et « ça ne coûte rien » n'est pas crédible pour un produit qui fait tourner des agents.
 * L'argument tenable est le **contrôle** : quel modèle, où, et si la donnée sort.
 */
export function Models() {
  return (
    <FeatureBand
      band
      tinted
      eyebrow="Models"
      level="labs"
      title="Your models, your network, your call"
      lead="A run is a sequence of steps, and they do not all need the same brains. The routine ones can run on a model you host; the two that carry the real decisions can call something stronger - or never leave your network either."
      aside={
        <>
          The choice is per step, not per workspace, and it is a setting rather than a migration.
          <span className="text-muted-foreground block pt-3">
            Self-hosted by default, and whatever you send is never used to train anything -
            wherever it runs.
          </span>
        </>
      }
      cta={{ label: "How model routing works", href: "/product/orchestration" }}
    />
  );
}

/* ─────────────────────────  Analytics  ───────────────────────── */

export function Analytics() {
  return (
    <FeatureSplit
      reverse
      eyebrow="Analytics"
      level="live"
      title="The one number a tracker cannot give you"
      lead="Lead time and throughput, every tool has them. What only a checkpointed run can tell you is which step keeps getting sent back - because that is where your process is actually failing, not where people are slow."
      bullets={[
        "Every run and every decision is a data point. The chart is a by-product of working, not a report someone fills in.",
        "The send-back rate per step names the weak link, and the reasons say why.",
        "A step that is rejected a third of the time is a process problem, not a people problem.",
      ]}
      cta={{ label: "See delivery analytics", href: "/product/analytics" }}
    />
  );
}
