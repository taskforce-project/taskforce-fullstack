import { KeyRound, Users, ScrollText, Server, Lock, ShieldCheck } from "lucide-react";

/**
 * HomeSections — Integrations, Enterprise, Testimonials (light, statique/SSR).
 * ⚠️ Testimonials = placeholders (attribution générique, pas de vraie marque) à remplacer par de vrais avis.
 * Logos = initiales pour l'instant → à remplacer par de vrais SVG (SVGL).
 */

const TOOLS = [
  "Claude Code",
  "Cursor",
  "GitHub Copilot",
  "Windsurf",
  "VS Code",
  "GitHub",
  "GitLab",
  "Slack",
  "Linear",
  "Jira",
  "Notion",
  "Figma",
];

export function IntegrationsSection() {
  return (
    <section className="py-24 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-[13px] font-semibold uppercase tracking-wider text-indigo-600">
            Integrations
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-[40px] sm:leading-[1.1]">
            Connect your entire stack
          </h2>
          <p className="mt-4 text-[15px] text-muted-foreground sm:text-base">
            Orchestrate any coding agent and plug into the tools your team already runs on.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {TOOLS.map((t) => (
            <div
              key={t}
              className="flex items-center gap-3 rounded-xl border border-black/[0.08] bg-card px-4 py-3 transition-colors hover:border-black/[0.16]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-[11px] font-semibold text-foreground">
                {t.replace(/[^A-Za-z ]/g, "").split(" ").map((w) => w[0]).join("").slice(0, 2)}
              </span>
              <span className="text-[14px] font-medium text-foreground">{t}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TRUST: { icon: typeof KeyRound; t: string; d: string }[] = [
  { icon: KeyRound, t: "SSO / SAML", d: "Okta, Google, Azure AD" },
  { icon: Users, t: "RBAC", d: "Roles & granular permissions" },
  { icon: ScrollText, t: "Audit logs", d: "Every action, traceable" },
  { icon: Server, t: "Self-host", d: "Run on your own infrastructure" },
  { icon: Lock, t: "Encryption", d: "In transit & at rest" },
  { icon: ShieldCheck, t: "GDPR-ready", d: "DPA & subprocessors" },
];

export function EnterpriseSection() {
  return (
    <section className="py-24 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <div className="rounded-3xl border border-black/[0.08] bg-secondary/30 px-8 py-14 sm:px-12">
          <div className="max-w-2xl">
            <span className="text-[13px] font-semibold uppercase tracking-wider text-indigo-600">
              Enterprise
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-[38px] sm:leading-[1.1]">
              Security and control for teams that scale
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-muted-foreground sm:text-base">
              Enterprise-grade by default. Bring your own identity provider, keep your data in your
              own infrastructure, and prove compliance with a full audit trail.
            </p>
          </div>

          <div className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map((x) => (
              <div key={x.t} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-black/[0.08] bg-card text-foreground">
                  <x.icon className="size-4" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[14px] font-medium text-foreground">{x.t}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{x.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const QUOTES: { q: string; n: string; r: string }[] = [
  {
    q: "We describe the outcome and TaskForce handles the busywork. Our lead time dropped and nothing slips through the cracks anymore.",
    n: "Alex R.",
    r: "Head of Engineering · Series B fintech",
  },
  {
    q: "Smart Assign alone paid for itself. The right person picks up the right work, automatically — no more triage meetings.",
    n: "Priya M.",
    r: "Engineering Manager · dev-tools startup",
  },
  {
    q: "Finally, AI agents I can actually manage. Human approval at every checkpoint is exactly the guardrail we needed.",
    n: "Tomás L.",
    r: "CTO · SaaS scale-up",
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-24 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-[13px] font-semibold uppercase tracking-wider text-indigo-600">
            Loved by builders
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-[40px] sm:leading-[1.1]">
            Teams ship more, worry less
          </h2>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {QUOTES.map((x) => (
            <figure key={x.n} className="flex flex-col rounded-2xl border border-black/[0.08] bg-card p-6">
              <blockquote className="flex-1 text-[14px] leading-6 text-foreground">
                “{x.q}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-white">
                  {x.n.slice(0, 1)}
                </span>
                <div>
                  <div className="text-[13px] font-medium text-foreground">{x.n}</div>
                  <div className="text-[12px] text-muted-foreground">{x.r}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
