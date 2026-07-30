import { useState } from "react";
import { Check } from "lucide-react";
import { APP_URL } from "@/components/site/nav";

/**
 * PricingSection — page Pricing (light-only). 3 tiers alignés sur le modèle produit
 * (Free 2 ws / 5 membres, Pro 10 ws / 50 membres, Enterprise custom). Toggle mensuel/annuel.
 * Badges « Beta » (honnêteté) sur l'orchestration/Brain OS. ⚠️ Prix = placeholders à confirmer.
 * Spec : taskforce-docs/v1/14-design/landing-refonte/Spec_Master.md §7.
 */

type Feature = { label: string; badge?: "Beta" | "Soon" };
type Tier = {
  name: string;
  priceMonthly: number | null; // null = "Custom"
  priceAnnual: number | null;
  unit?: string;
  tagline: string;
  cta: { label: string; href: string };
  featured?: boolean;
  features: Feature[];
};

const TIERS: Tier[] = [
  {
    name: "Free",
    priceMonthly: 0,
    priceAnnual: 0,
    unit: "forever",
    tagline: "For individuals trying out AI delivery.",
    cta: { label: "Get started", href: `${APP_URL}/auth/register` },
    features: [
      { label: "2 workspaces" },
      { label: "Up to 5 members" },
      { label: "Smart Assign" },
      { label: "Kanban, issues & cycles" },
      { label: "Community support" },
    ],
  },
  {
    name: "Pro",
    priceMonthly: 12,
    priceAnnual: 10,
    unit: "per user / month",
    tagline: "For teams shipping software with AI agents.",
    cta: { label: "Start free trial", href: `${APP_URL}/auth/register` },
    featured: true,
    features: [
      { label: "Everything in Free" },
      { label: "10 workspaces" },
      { label: "Up to 50 members" },
      { label: "AI agents & orchestration", badge: "Beta" },
      { label: "Brain OS — auto docs", badge: "Beta" },
      { label: "Analytics & reporting" },
      { label: "Priority support" },
    ],
  },
  {
    name: "Enterprise",
    priceMonthly: null,
    priceAnnual: null,
    tagline: "For organizations delivering at scale.",
    cta: { label: "Talk to sales", href: "/book-a-demo" },
    features: [
      { label: "Everything in Pro" },
      { label: "Unlimited workspaces & members" },
      { label: "SSO / SAML" },
      { label: "Self-host option" },
      { label: "DPA & subprocessors" },
      { label: "Audit logs" },
      { label: "Dedicated support & SLA" },
    ],
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Can I try TaskForce for free?",
    a: "Yes — the Free plan is free forever, and Pro includes a 14-day trial. No credit card required.",
  },
  {
    q: "What counts as a member?",
    a: "Any user you invite to a workspace. You can adjust seats anytime and billing prorates automatically.",
  },
  {
    q: "Can I self-host TaskForce?",
    a: "Yes. Enterprise can run TaskForce on its own infrastructure, and the core is open-source.",
  },
  {
    q: "How does AI agent orchestration work?",
    a: "TaskForce plans the delivery pipeline and drives your coding agents (Claude Code, Cursor…) through validated checkpoints — you approve every step.",
  },
];

function PriceCard({ tier, annual }: { tier: Tier; annual: boolean }) {
  const price = annual ? tier.priceAnnual : tier.priceMonthly;
  return (
    <div
      className={
        "relative flex flex-col rounded-2xl p-6 " +
        (tier.featured
          ? "border border-foreground/15 bg-card shadow-[0_24px_60px_-24px_rgba(0,0,0,0.2)] ring-1 ring-foreground/10"
          : "border border-black/[0.08] bg-card")
      }
    >
      {tier.featured && (
        <span className="absolute -top-3 left-6 rounded-full bg-foreground px-3 py-1 text-[11px] font-medium text-white">
          Most popular
        </span>
      )}
      <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
      <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{tier.tagline}</p>

      <div className="mt-5 flex items-baseline gap-1.5">
        {price === null ? (
          <span className="text-4xl font-semibold tracking-tight text-foreground">Custom</span>
        ) : (
          <>
            <span className="text-4xl font-semibold tracking-tight text-foreground">${price}</span>
            {tier.unit && <span className="text-[13px] text-muted-foreground">{tier.unit}</span>}
          </>
        )}
      </div>
      <p className="mt-1 h-4 text-[12px] text-muted-foreground">
        {price !== null && price > 0 && annual ? "billed annually" : ""}
      </p>

      <a
        href={tier.cta.href}
        className={
          "mt-5 inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition " +
          (tier.featured
            ? "bg-foreground text-white hover:opacity-90"
            : "border border-black/[0.1] text-foreground hover:bg-secondary/60")
        }
      >
        {tier.cta.label}
      </a>

      <ul className="mt-6 space-y-2.5">
        {tier.features.map((f) => (
          <li key={f.label} className="flex items-start gap-2.5 text-[13px]">
            <Check className="mt-0.5 size-4 shrink-0 text-green-600" />
            <span className="text-foreground">
              {f.label}
              {f.badge && (
                <span className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                  {f.badge}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PricingSection() {
  const [annual, setAnnual] = useState(true);

  return (
    <section className="pb-28">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        {/* Hero */}
        <div className="mx-auto max-w-2xl pt-20 text-center">
          <span className="inline-flex items-center rounded-full border border-black/[0.08] bg-background px-3 py-1 text-[13px] font-medium text-muted-foreground">
            Pricing
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.02em] text-foreground sm:text-5xl">
            Pricing that scales with your delivery
          </h1>
          <p className="mt-4 text-[15px] text-muted-foreground sm:text-lg">
            Start free. Upgrade when your team ships with AI agents. No credit card required.
          </p>

          {/* Billing toggle */}
          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-secondary/40 p-1 text-[13px]">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={
                "rounded-full px-3.5 py-1.5 font-medium transition " +
                (!annual ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")
              }
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition " +
                (annual ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")
              }
            >
              Annual
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                −20%
              </span>
            </button>
          </div>
        </div>

        {/* Tiers */}
        <div className="mx-auto mt-14 grid max-w-5xl items-start gap-6 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <PriceCard key={tier.name} tier={tier} annual={annual} />
          ))}
        </div>

        <p className="mt-8 text-center text-[13px] text-muted-foreground">
          All plans include SSL encryption, GDPR compliance, and 99.9% uptime.
        </p>

        {/* FAQ */}
        <div className="mx-auto mt-24 max-w-3xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground">
            Frequently asked questions
          </h2>
          <div className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q}>
                <h3 className="text-[15px] font-medium text-foreground">{item.q}</h3>
                <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-[13px] text-muted-foreground">
            Still have questions?{" "}
            <a href="/book-a-demo" className="font-medium text-foreground underline underline-offset-4">
              Talk to sales
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
