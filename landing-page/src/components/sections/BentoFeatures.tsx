import { Workflow, Sparkles, Brain, Zap, BarChart3, ShieldCheck } from "lucide-react";

/** BentoFeatures — grille des capacités (light). Badges d'honnêteté sur les capacités v2 (Beta). */

type Tile = { icon: typeof Zap; title: string; text: string; badge?: string };

const TILES: Tile[] = [
  {
    icon: Workflow,
    title: "Orchestration pipeline",
    text: "Vision → spec → architecture → build → QA → deploy, as validated checkpoints.",
    badge: "Beta",
  },
  {
    icon: Sparkles,
    title: "Smart Assign",
    text: "The right task to the right person — reasoned from skills, load and history.",
  },
  {
    icon: Brain,
    title: "Brain OS",
    text: "A living knowledge graph. Your docs write themselves as you ship.",
    badge: "Beta",
  },
  {
    icon: Zap,
    title: "Real-time collaboration",
    text: "Live boards, issues and cycles. Everyone sees the same source of truth.",
  },
  {
    icon: BarChart3,
    title: "Analytics & reporting",
    text: "Lead time, throughput, approval rate — the delivery metrics that matter.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise security",
    text: "SSO, RBAC, audit logs, self-host. GDPR-ready, your data stays yours.",
  },
];

export function BentoFeatures() {
  return (
    <section className="py-24 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-[13px] font-semibold uppercase tracking-wider text-indigo-600">
            Capabilities
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-[40px] sm:leading-[1.1]">
            Everything you need to ship with AI
          </h2>
          <p className="mt-4 text-[15px] text-muted-foreground sm:text-base">
            A complete delivery workspace — orchestration, assignment, docs, analytics and security in one place.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map((t) => (
            <div
              key={t.title}
              className="group rounded-2xl border border-black/[0.08] bg-card p-6 transition-colors hover:border-black/[0.16]"
            >
              <span className="flex size-10 items-center justify-center rounded-xl border border-black/[0.06] bg-secondary/50 text-foreground">
                <t.icon className="size-5" strokeWidth={1.75} />
              </span>
              <div className="mt-5 flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-foreground">{t.title}</h3>
                {t.badge && (
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                    {t.badge}
                  </span>
                )}
              </div>
              <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{t.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
