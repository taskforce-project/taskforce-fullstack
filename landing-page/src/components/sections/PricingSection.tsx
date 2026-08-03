import { useState } from "react";
import { Check } from "lucide-react";
import { APP_URL } from "@/components/site/nav";

/**
 * PricingSection — page Pricing (light-only). Raconte la MONTÉE EN GAMME, pas une grille de features :
 *   Free = delivery workspace · Pro = cloud AI · Business = cloud + controls & scale · Enterprise = self-host + gouvernance.
 * Décision user (02/08, corrigée) :
 *   · **Self-hosting = ENTERPRISE = Custom = « Talk to sales »** (« si tu veux self-host, tu es en entreprise »).
 *     Ce n'est PAS un tier self-serve bon marché → on ne se tire pas une balle dans le pied.
 *   · Le tier intermédiaire est **« Business »** (cloud managé : controls, scale, SSO), pas « Self-hosted ».
 *   · Modèles locaux (Ollama, coût modèle zéro) = capacité Enterprise/self-host, jamais un fait universel.
 *   · Orchestration reste HORS pricing (Planned) ; on ne vend que « AI agents · Beta ».
 *   · Per-seat façon Linear (membres illimités) ; seul cap = collaborateurs projet privé Free (façon GitHub).
 * ⚠️ Prix = INDICATIFS à confirmer (note affichée).
 */

type Feature = { label: string; badge?: "Beta" };
type Tier = {
  name: string;
  kicker: string;
  priceMonthly: number | null; // null = "Custom"
  priceAnnual: number | null;
  unit?: string;
  tagline: string;
  cta: { label: string; href: string };
  featured?: boolean;
  features: Feature[];
};

const REGISTER = `${APP_URL}/auth/register`;

const TIERS: Tier[] = [
  {
    name: "Free",
    kicker: "Delivery workspace",
    priceMonthly: 0,
    priceAnnual: 0,
    unit: "forever",
    tagline: "Run your delivery — boards, issues, cycles and Smart Assign.",
    cta: { label: "Get started", href: REGISTER },
    features: [
      { label: "2 workspaces" },
      { label: "Up to 5 collaborators on private projects" },
      { label: "Boards, issues & cycles" },
      { label: "Smart Assign" },
      { label: "Community support" },
    ],
  },
  {
    name: "Pro",
    kicker: "Cloud AI delivery",
    priceMonthly: 12,
    priceAnnual: 10,
    unit: "per user / month",
    tagline: "Add AI agents and memory to the workflow your team already runs.",
    cta: { label: "Start free trial", href: REGISTER },
    featured: true,
    features: [
      { label: "Everything in Free" },
      { label: "10 workspaces" },
      { label: "Unlimited members — billed per seat" },
      { label: "AI agents", badge: "Beta" },
      { label: "TaskForce Memory", badge: "Beta" },
      { label: "Analytics & reporting" },
      { label: "AI usage billed by consumption" },
      { label: "Priority support" },
    ],
  },
  {
    name: "Business",
    kicker: "Controls & scale",
    priceMonthly: 16,
    priceAnnual: 13,
    unit: "per user / month",
    tagline: "Advanced controls and scale — fully managed in the cloud.",
    cta: { label: "Start free trial", href: REGISTER },
    features: [
      { label: "Everything in Pro" },
      { label: "Unlimited workspaces" },
      { label: "SSO / SAML" },
      { label: "Advanced RBAC & per-project access" },
      { label: "Audit logging" },
      { label: "Priority support" },
    ],
  },
  {
    name: "Enterprise",
    kicker: "Self-hosted & governed",
    priceMonthly: null,
    priceAnnual: null,
    tagline: "Self-hosting, local models and governance for organizations.",
    cta: { label: "Talk to sales", href: "/book-a-demo" },
    features: [
      { label: "Everything in Business" },
      { label: "Self-hosted deployment (Docker)" },
      { label: "Local models via Ollama — zero model cost" },
      { label: "Prompts & data stay on your network" },
      { label: "Custom data retention" },
      { label: "DPA & subprocessors" },
      { label: "Security review & deployment assistance" },
      { label: "Dedicated support & SLA" },
    ],
  },
];

/* ── Grille comparative : le land-and-expand, lisible d'un coup d'œil ── */
type Cell = boolean | string; // true = ✓ · false = — · string = libellé (ex. "Beta")
type Row = { label: string; free: Cell; pro: Cell; biz: Cell; ent: Cell };

const COMPARE: Row[] = [
  { label: "Workspaces", free: "2", pro: "10", biz: "Unlimited", ent: "Unlimited" },
  { label: "Members", free: "5 collaborators", pro: "Unlimited", biz: "Unlimited", ent: "Unlimited" },
  { label: "Boards, issues & cycles", free: true, pro: true, biz: true, ent: true },
  { label: "Smart Assign", free: true, pro: true, biz: true, ent: true },
  { label: "Analytics", free: false, pro: true, biz: true, ent: true },
  { label: "AI agents", free: false, pro: "Beta", biz: "Beta", ent: "Beta" },
  { label: "TaskForce Memory", free: false, pro: "Beta", biz: "Beta", ent: "Beta" },
  { label: "SSO / SAML", free: false, pro: false, biz: true, ent: true },
  { label: "Advanced RBAC & per-project access", free: false, pro: false, biz: true, ent: true },
  { label: "Audit logging", free: false, pro: false, biz: true, ent: true },
  { label: "AI model usage", free: false, pro: "Usage-based", biz: "Usage-based", ent: "Local or usage-based" },
  { label: "Self-hosted deployment", free: false, pro: false, biz: false, ent: true },
  { label: "Local models (zero model cost)", free: false, pro: false, biz: false, ent: true },
  { label: "Custom retention · DPA · subprocessors", free: false, pro: false, biz: false, ent: true },
  { label: "Dedicated support & SLA", free: false, pro: false, biz: false, ent: true },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Can I try TaskForce for free?",
    a: "Yes — Free is free forever, and Pro and Business include a 14-day trial. No credit card required.",
  },
  {
    q: "How does billing work?",
    a: "Pro and Business are billed per seat. A seat is any user you invite to a workspace; you can adjust seats anytime and billing prorates. Enterprise is a custom agreement.",
  },
  {
    q: "Are AI models included in the subscription?",
    a: "Your subscription covers the platform. On Pro and Business, hosted model usage (Claude, OpenAI…) is metered by tokens and billed on consumption. On a self-hosted Enterprise deployment, local models through Ollama incur no TaskForce model charges.",
  },
  {
    q: "How do AI agents work today?",
    a: "TaskForce agents propose each delivery step — spec, approach, breakdown — and you approve it before your coding agent (Claude Code, Cursor…) implements. The full multi-checkpoint run is on the roadmap.",
  },
  {
    q: "Can I self-host TaskForce?",
    a: "Yes — self-hosting comes with Enterprise. It runs TaskForce inside your own infrastructure with local models, so prompts and data stay on your network. It's a custom agreement, so talk to sales and we'll map the deployment with you.",
  },
];

function FeatureBadge({ badge }: { badge: "Beta" }) {
  return (
    <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
      {badge}
    </span>
  );
}

function Cell({ value }: { value: Cell }) {
  if (value === true) return <Check className="mx-auto size-4 text-emerald-600" strokeWidth={2.5} />;
  if (value === false) return <span className="text-muted-foreground/40">—</span>;
  if (value === "Beta")
    return (
      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">Beta</span>
    );
  return <span className="text-[13px] text-foreground">{value}</span>;
}

function PriceCard({ tier, annual }: { tier: Tier; annual: boolean }) {
  const price = annual ? tier.priceAnnual : tier.priceMonthly;
  return (
    <div
      className={
        "relative flex flex-col rounded-2xl p-6 " +
        (tier.featured
          ? "border-primary/30 ring-primary/10 border bg-card shadow-[0_24px_60px_-24px_rgba(0,0,0,0.2)] ring-1"
          : "border bg-card")
      }
    >
      {tier.featured && (
        <span className="bg-primary text-primary-foreground absolute -top-3 left-6 rounded-full px-3 py-1 text-[11px] font-medium">
          Most popular
        </span>
      )}
      <p className="text-primary text-[12px] font-semibold tracking-[0.04em] uppercase">{tier.kicker}</p>
      <h3 className="mt-1 text-lg font-semibold text-foreground">{tier.name}</h3>
      <p className="text-muted-foreground mt-1 text-[13px] leading-5">{tier.tagline}</p>

      <div className="mt-5 flex items-baseline gap-1.5">
        {price === null ? (
          <span className="text-4xl font-semibold tracking-tight text-foreground">Custom</span>
        ) : (
          <>
            <span className="text-4xl font-semibold tracking-tight text-foreground">${price}</span>
            {tier.unit && <span className="text-muted-foreground text-[13px]">{tier.unit}</span>}
          </>
        )}
      </div>
      <p className="text-muted-foreground mt-1 h-4 text-[12px]">
        {price !== null && price > 0 && annual ? "billed annually" : ""}
      </p>

      <a
        href={tier.cta.href}
        className={
          "mt-5 inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium transition " +
          (tier.featured
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "text-foreground hover:bg-secondary/60 border")
        }
      >
        {tier.cta.label}
      </a>

      <ul className="mt-6 space-y-2.5">
        {tier.features.map((f) => (
          <li key={f.label} className="flex items-start gap-2.5 text-[13px]">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" strokeWidth={2.5} />
            <span className="text-foreground">
              {f.label}
              {f.badge && <FeatureBadge badge={f.badge} />}
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
          <span className="border-border bg-card text-muted-foreground inline-flex items-center rounded-full border px-3 py-1 text-[13px] font-medium">
            Pricing
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.02em] text-foreground sm:text-5xl">
            Pricing that scales with your delivery
          </h1>
          <p className="text-muted-foreground mt-4 text-[15px] sm:text-lg">
            Start with the delivery workspace. Add AI when you're ready. Scale with controls, and go
            self-hosted with Enterprise when you need it.
          </p>

          {/* Billing toggle */}
          <div className="border-border bg-secondary/40 mt-8 inline-flex items-center gap-1 rounded-full border p-1 text-[13px]">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={
                "rounded-full px-3.5 py-1.5 font-medium transition " +
                (!annual ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")
              }
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition " +
                (annual ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")
              }
            >
              Annual
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                −17%
              </span>
            </button>
          </div>
        </div>

        {/* Tiers */}
        <div className="mx-auto mt-14 grid max-w-6xl items-start gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <PriceCard key={tier.name} tier={tier} annual={annual} />
          ))}
        </div>

        <p className="text-muted-foreground mt-8 text-center text-[13px]">
          Prices are indicative and may change before launch. All plans include TLS encryption and
          GDPR-oriented data controls. Availability targets and SLAs vary by plan — see the{" "}
          <a href="/trust" className="link-underline text-foreground font-medium">
            trust center
          </a>
          .
        </p>
        <p className="text-muted-foreground mt-2 text-center text-[13px]">
          On Pro and Business, hosted model usage is metered by tokens and billed on consumption. A
          self-hosted Enterprise deployment runs on local models — no TaskForce model charges.
        </p>

        {/* Comparaison — la montée en gamme, ligne par ligne */}
        <div className="mx-auto mt-20 max-w-5xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground">
            Workspace → AI delivery → controls & scale → self-hosted enterprise
          </h2>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
              <thead>
                <tr className="text-[13px]">
                  <th className="w-[34%] pb-3 font-normal"></th>
                  <th className="pb-3 text-center font-semibold text-foreground">Free</th>
                  <th className="pb-3 text-center font-semibold text-foreground">Pro</th>
                  <th className="pb-3 text-center font-semibold text-foreground">Business</th>
                  <th className="pb-3 text-center font-semibold text-foreground">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.label} className="border-t">
                    <td className="border-border border-t py-2.5 text-[13.5px] text-foreground">
                      {row.label}
                    </td>
                    <td className="border-border border-t py-2.5 text-center">
                      <Cell value={row.free} />
                    </td>
                    <td className="border-border bg-secondary/20 border-t py-2.5 text-center">
                      <Cell value={row.pro} />
                    </td>
                    <td className="border-border border-t py-2.5 text-center">
                      <Cell value={row.biz} />
                    </td>
                    <td className="border-border border-t py-2.5 text-center">
                      <Cell value={row.ent} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Deux façons de faire tourner l'IA — pont vers Trust Center / Orchestration */}
        <div className="mx-auto mt-20 max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              One platform. Two ways to run AI.
            </h2>
            <p className="text-muted-foreground mt-3 text-[15px]">
              Use hosted models on the cloud plans, or run your own on a self-hosted Enterprise deployment.
            </p>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border bg-card p-6">
              <h3 className="text-[16px] font-semibold text-foreground">Hosted</h3>
              <p className="text-muted-foreground mt-1 text-[13.5px]">Claude · OpenAI · other providers</p>
              <p className="mt-4 text-[13.5px] leading-6 text-foreground">
                Usage-based model costs, metered by tokens. The simplest way to start — on Pro and Business.
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-6">
              <h3 className="text-[16px] font-semibold text-foreground">Self-hosted</h3>
              <p className="text-muted-foreground mt-1 text-[13.5px]">Ollama · local models · Enterprise</p>
              <p className="mt-4 text-[13.5px] leading-6 text-foreground">
                Your infrastructure, zero model cost — and no prompts or outputs leave your network.
                Available with Enterprise; talk to sales.
              </p>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mx-auto mt-24 max-w-3xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground">
            Frequently asked questions
          </h2>
          <div className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q}>
                <h3 className="text-[15px] font-medium text-foreground">{item.q}</h3>
                <p className="text-muted-foreground mt-1.5 text-[13px] leading-5">{item.a}</p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-10 text-center text-[13px]">
            Still have questions?{" "}
            <a href="/book-a-demo" className="text-foreground font-medium underline underline-offset-4">
              Talk to sales
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
