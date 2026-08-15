import { useState } from "react";
import { Check, CircleCheck } from "lucide-react";

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
  priceMonthly: number | null; // null = "Custom"
  priceAnnual: number | null;
  unit?: string;
  tagline: string;
  cta: { label: string; href: string };
  featured?: boolean;
  features: Feature[];
};

const REGISTER = "/waitlist";

const TIERS: Tier[] = [
  {
    name: "Free",
    priceMonthly: 0,
    priceAnnual: 0,
    unit: "forever",
    tagline: "To explore TaskForce.",
    cta: { label: "Get started", href: REGISTER },
    features: [
      { label: "Unlimited members" },
      { label: "2 workspaces" },
      { label: "250 issues" },
      { label: "Boards, lists & cycles" },
      { label: "Smart Assign" },
      { label: "100K Cortex AI tokens / month" },
    ],
  },
  {
    name: "Basic",
    priceMonthly: 10,
    priceAnnual: 8,
    unit: "per member / month",
    tagline: "For small teams getting started.",
    cta: { label: "Start free trial", href: REGISTER },
    features: [
      { label: "Everything in Free" },
      { label: "5 workspaces" },
      { label: "Unlimited issues" },
      { label: "Unlimited file uploads" },
      { label: "Admin roles" },
      { label: "500K Cortex AI tokens / month" },
    ],
  },
  {
    name: "Business",
    priceMonthly: 16,
    priceAnnual: 13,
    unit: "per member / month",
    tagline: "For teams that ship fast.",
    cta: { label: "Start free trial", href: REGISTER },
    featured: true,
    features: [
      { label: "Everything in Basic" },
      { label: "Unlimited workspaces" },
      { label: "Guests & private projects" },
      { label: "Advanced analytics + burndown" },
      { label: "AI decisions & workflows", badge: "Beta" },
      { label: "GitHub integration" },
      { label: "2M Cortex AI tokens / month" },
    ],
  },
  {
    name: "Enterprise",
    priceMonthly: null,
    priceAnnual: null,
    tagline: "Security, compliance and dedicated deployment.",
    cta: { label: "Talk to sales", href: "/book-a-demo" },
    features: [
      { label: "Everything in Business" },
      { label: "SSO / SAML / SCIM" },
      { label: "Granular admin controls" },
      { label: "Audit & GDPR compliance" },
      { label: "On-premise deployment" },
      { label: "Priority support & onboarding" },
      { label: "Unlimited Cortex AI tokens" },
    ],
  },
];

/* ── Grille comparative : le land-and-expand, lisible d'un coup d'œil ── */
type Cell = boolean | string; // true = ✓ · false = — · string = libellé (ex. "Beta")
type Row = { label: string; free: Cell; pro: Cell; biz: Cell; ent: Cell };

const COMPARE: Row[] = [
  { label: "Members", free: "Unlimited", pro: "Unlimited", biz: "Unlimited", ent: "Unlimited" },
  { label: "Workspaces", free: "2", pro: "5", biz: "Unlimited", ent: "Unlimited" },
  { label: "Issues", free: "250", pro: "Unlimited", biz: "Unlimited", ent: "Unlimited" },
  { label: "Boards, lists & cycles", free: true, pro: true, biz: true, ent: true },
  { label: "Smart Assign", free: true, pro: true, biz: true, ent: true },
  { label: "Unlimited file uploads", free: false, pro: true, biz: true, ent: true },
  { label: "Admin roles", free: false, pro: true, biz: true, ent: true },
  { label: "Guests & private projects", free: false, pro: false, biz: true, ent: true },
  { label: "Advanced analytics + burndown", free: false, pro: false, biz: true, ent: true },
  { label: "AI decisions & workflows", free: false, pro: false, biz: "Beta", ent: "Beta" },
  { label: "GitHub integration", free: false, pro: false, biz: true, ent: true },
  { label: "SSO / SAML / SCIM", free: false, pro: false, biz: false, ent: true },
  { label: "Granular admin controls", free: false, pro: false, biz: false, ent: true },
  { label: "Audit & GDPR compliance", free: false, pro: false, biz: false, ent: true },
  { label: "On-premise deployment", free: false, pro: false, biz: false, ent: true },
  { label: "Cortex AI tokens / month", free: "100K", pro: "500K", biz: "2M", ent: "Unlimited" },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Can I try TaskForce for free?",
    a: "Yes — Free is free forever, and Basic and Business include a 14-day trial. No credit card required.",
  },
  {
    q: "How does billing work?",
    a: "Basic and Business are billed per member. A member is any user you invite to a workspace; you can adjust members anytime and billing prorates. Enterprise is a custom agreement.",
  },
  {
    q: "What are Cortex AI tokens?",
    a: "Cortex is the AI engine behind TaskForce. Every plan includes a monthly token allotment — 100K on Free, 500K on Basic, 2M on Business, unlimited on Enterprise. Beyond the allotment, usage is metered. A self-hosted Enterprise deployment on local models (Ollama) incurs no token charges.",
  },
  {
    q: "How do AI decisions & workflows work today?",
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

/* Une COLONNE du bloc unique (les 4 tiers sont collés, séparés par des filets, et montent crescendo). */
function PriceColumn({ tier, annual }: { tier: Tier; annual: boolean }) {
  const price = annual ? tier.priceAnnual : tier.priceMonthly;
  return (
    <div className={"flex flex-col p-6 " + (tier.featured ? "bg-primary/[0.04]" : "bg-card")}>
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
        {tier.featured && (
          <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
            Most popular
          </span>
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        {price === null ? (
          <span className="text-4xl font-semibold tracking-tight text-foreground">Custom</span>
        ) : (
          <>
            <span className="text-4xl font-semibold tracking-tight text-foreground">{price} €</span>
            {tier.unit && <span className="text-muted-foreground text-[13px]">{tier.unit}</span>}
          </>
        )}
      </div>
      <p className="text-muted-foreground mt-1 h-4 text-[12px]">
        {price !== null && price > 0 && annual ? "billed annually" : ""}
      </p>

      <p className="text-muted-foreground mt-4 text-[13px] leading-5">{tier.tagline}</p>

      <a
        href={tier.cta.href}
        className={
          "mt-5 inline-flex h-10 w-full items-center justify-center rounded-full px-4 text-sm font-medium transition " +
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
            <CircleCheck className="text-primary mt-0.5 size-4 shrink-0" strokeWidth={2} />
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
                (!annual ? "bg-card text-foreground" : "text-muted-foreground")
              }
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition " +
                (annual ? "bg-card text-foreground" : "text-muted-foreground")
              }
            >
              Annual
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                −17%
              </span>
            </button>
          </div>
        </div>

        {/* Tiers — UN SEUL BLOC : colonnes collées, séparées par des filets (style app), qui montent crescendo */}
        <div className="mx-auto mt-14 max-w-6xl overflow-hidden rounded-2xl border">
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((tier) => (
              <PriceColumn key={tier.name} tier={tier} annual={annual} />
            ))}
          </div>
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
          Every plan includes a monthly Cortex AI token allotment; beyond it, usage is metered. A
          self-hosted Enterprise deployment on local models incurs no token charges.
        </p>

        {/* Comparaison — la montée en gamme, ligne par ligne */}
        <div className="mx-auto mt-20 max-w-5xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground">
            Everything from a free workspace to a governed enterprise deployment
          </h2>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
              <thead>
                <tr className="text-[13px]">
                  <th className="w-[34%] pb-3 font-normal"></th>
                  <th className="pb-3 text-center font-semibold text-foreground">Free</th>
                  <th className="pb-3 text-center font-semibold text-foreground">Basic</th>
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
                    <td className="border-border border-t py-2.5 text-center">
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
          <div className="mt-8 grid gap-px overflow-hidden border bg-border sm:grid-cols-2">
            <div className="bg-card p-6">
              <h3 className="text-[16px] font-semibold text-foreground">Hosted</h3>
              <p className="text-muted-foreground mt-1 text-[13.5px]">Cortex · Claude · OpenAI · other providers</p>
              <p className="mt-4 text-[13.5px] leading-6 text-foreground">
                Each plan includes a monthly Cortex AI token allotment; beyond it, usage is metered. The
                simplest way to start — on any cloud plan.
              </p>
            </div>
            <div className="bg-card p-6">
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
            <a href="/book-a-demo" className="link-underline text-foreground font-medium">
              Talk to sales
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
