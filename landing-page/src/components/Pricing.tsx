import { useState } from "react";
import { Check, Minus, ArrowRight, ExternalLink, ChevronDown, ChevronUp, Zap, Shield, Users, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------- data ----------

const plans = [
  {
    id: "free",
    name: "Free",
    desc: "For individuals and small teams getting started.",
    monthlyPrice: 0,
    yearlyPrice: 0,
    cta: "Get started",
    ctaHref: "http://localhost:3000/auth/register",
    highlighted: false,
    badge: null,
  },
  {
    id: "pro",
    name: "Pro",
    desc: "For growing teams that need more power and automation.",
    monthlyPrice: 12,
    yearlyPrice: 9,
    cta: "Start free trial",
    ctaHref: "http://localhost:3000/auth/register",
    highlighted: true,
    badge: "Most popular",
  },
  {
    id: "business",
    name: "Business",
    desc: "For scaling organisations with advanced workflows.",
    monthlyPrice: 24,
    yearlyPrice: 19,
    cta: "Start free trial",
    ctaHref: "http://localhost:3000/auth/register",
    highlighted: false,
    badge: null,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    desc: "Custom deployment, SLA, and dedicated support.",
    monthlyPrice: null,
    yearlyPrice: null,
    cta: "Talk to sales",
    ctaHref: "/contact",
    highlighted: false,
    badge: null,
  },
] as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PlanId = (typeof plans)[number]["id"];

const featureGroups = [
  {
    id: "core",
    label: "Core features",
    features: [
      {
        id: "members",
        label: "Team members",
        free: "Up to 5",
        pro: "Unlimited",
        business: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        id: "projects",
        label: "Projects",
        free: "3 active",
        pro: "Unlimited",
        business: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        id: "storage",
        label: "File storage",
        free: "1 GB",
        pro: "25 GB",
        business: "100 GB",
        enterprise: "Unlimited",
      },
      {
        id: "views",
        label: "Views",
        free: "Kanban & List",
        pro: "All incl. Gantt",
        business: "All incl. Gantt",
        enterprise: "All incl. Gantt",
      },
    ],
  },
  {
    id: "ai",
    label: "AI & Automation",
    features: [
      {
        id: "ai-copilot",
        label: "AI co-pilot",
        free: false,
        pro: true,
        business: true,
        enterprise: true,
      },
      {
        id: "automation",
        label: "Workflow automations",
        free: false,
        pro: "10 / workspace",
        business: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        id: "ai-triage",
        label: "AI issue triage",
        free: false,
        pro: false,
        business: true,
        enterprise: true,
      },
    ],
  },
  {
    id: "collab",
    label: "Collaboration",
    features: [
      {
        id: "guests",
        label: "Guest access",
        free: false,
        pro: "5 guests",
        business: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        id: "wiki",
        label: "Team wiki & docs",
        free: true,
        pro: true,
        business: true,
        enterprise: true,
      },
      {
        id: "integrations",
        label: "Integrations (GitHub, Slack…)",
        free: "2 integrations",
        pro: true,
        business: true,
        enterprise: true,
      },
    ],
  },
  {
    id: "security",
    label: "Security & Compliance",
    features: [
      {
        id: "sso",
        label: "SSO / SAML",
        free: false,
        pro: false,
        business: true,
        enterprise: true,
      },
      {
        id: "audit",
        label: "Audit logs",
        free: false,
        pro: false,
        business: "90 days",
        enterprise: "Unlimited",
      },
      {
        id: "soc2",
        label: "SOC 2 Type II",
        free: false,
        pro: false,
        business: false,
        enterprise: true,
      },
      {
        id: "custom-roles",
        label: "Custom roles & permissions",
        free: false,
        pro: false,
        business: true,
        enterprise: true,
      },
    ],
  },
  {
    id: "support",
    label: "Support",
    features: [
      {
        id: "support-type",
        label: "Support channel",
        free: "Community",
        pro: "Email (48 h)",
        business: "Priority (24 h)",
        enterprise: "Dedicated SLA",
      },
      {
        id: "onboarding",
        label: "Onboarding & training",
        free: false,
        pro: false,
        business: false,
        enterprise: true,
      },
    ],
  },
] as const;

const faqs = [
  {
    id: "faq-trial",
    q: "Is there a free trial?",
    a: "Yes. Pro and Business plans come with a 14-day free trial - no credit card required. You can downgrade to Free at any time.",
  },
  {
    id: "faq-seats",
    q: "How does per-seat pricing work?",
    a: "You pay only for active members. If a member hasn't logged in for 30 days, they are automatically moved to an inactive (unpaid) seat.",
  },
  {
    id: "faq-selfhost",
    q: "Can I self-host Taskforce?",
    a: "Yes. Taskforce is open source under the AGPL-3.0 licence. You can deploy on your own infrastructure for free. Community support only.",
  },
  {
    id: "faq-cancel",
    q: "Can I cancel at any time?",
    a: "Absolutely. You can cancel, downgrade or delete your workspace at any time. No cancellation fees, no contracts.",
  },
] as const;

// ---------- helpers ----------

type FeatureValue = string | boolean;

function FeatureCell({ value }: { readonly value: FeatureValue }) {
  if (value === true) {
    return (
      <td className="py-3.5 px-4 text-center">
        <Check className="h-4 w-4 text-white mx-auto" />
      </td>
    );
  }
  if (value === false) {
    return (
      <td className="py-3.5 px-4 text-center">
        <Minus className="h-4 w-4 text-white/20 mx-auto" />
      </td>
    );
  }
  return (
    <td className="py-3.5 px-4 text-center text-sm text-white/60">{value}</td>
  );
}

// ---------- main component ----------

export default function Pricing() {
  const [annual, setAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(featureGroups.map((g) => [g.id, true]))
  );

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* ---------- Hero ---------- */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 text-center max-w-4xl mx-auto">
        <Badge
          variant="outline"
          className="mb-6 border-white/15 bg-white/5 text-white/60 uppercase tracking-widest text-[11px] px-3"
        >
          Pricing
        </Badge>
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-white mb-5 leading-[1.05]">
          Simple,{" "}
          <span className="bg-linear-to-r from-white to-white/50 bg-clip-text text-transparent">
            transparent pricing
          </span>
        </h1>
        <p className="text-lg text-white/50 max-w-xl mx-auto mb-10">
          Start free. Upgrade as your team grows. No surprise fees.
        </p>

        {/* Toggle */}
        <div className="inline-flex items-center gap-3 p-1 rounded-xl border border-white/10 bg-white/4">
          <button
            onClick={() => setAnnual(false)}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium transition-all",
              annual ? "text-white/50 hover:text-white" : "bg-white text-black"
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
              annual ? "bg-white text-black" : "text-white/50 hover:text-white"
            )}
          >
            Annual{" "}<span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-md font-semibold",
                annual ? "bg-black/10 text-black" : "bg-white/10 text-white/60"
              )}
            >
              {"\u221225%"}
            </span>
          </button>
        </div>
      </section>

      {/* ---------- Plan cards ---------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const resolvedPrice = annual ? plan.yearlyPrice : plan.monthlyPrice;
            const price = plan.monthlyPrice === null ? null : resolvedPrice;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative rounded-2xl border p-6 flex flex-col transition-all",
                  plan.highlighted
                    ? "border-white/30 bg-white/5 shadow-[0_0_60px_-12px_rgba(255,255,255,0.15)]"
                    : "border-white/8 bg-white/2 hover:border-white/15"
                )}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white text-black text-[11px] font-semibold px-3 py-1 rounded-full">
                    {plan.badge}
                  </span>
                )}

                <div className="mb-6">
                  <p className="text-white font-semibold text-base mb-1">{plan.name}</p>
                  <p className="text-white/40 text-sm leading-relaxed mb-5">{plan.desc}</p>

                  {price === null && (
                    <p className="text-3xl font-black text-white">Custom</p>
                  )}
                  {price === 0 && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-white">$0</span>
                      <span className="text-white/30 text-sm">forever</span>
                    </div>
                  )}
                  {price !== null && price > 0 && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-white">${price}</span>
                      <span className="text-white/30 text-sm">/ seat / mo</span>
                    </div>
                  )}

                  {annual && price !== null && price > 0 && (
                    <p className="text-white/30 text-xs mt-1">
                      Billed annually · ${plan.monthlyPrice}/mo if monthly
                    </p>
                  )}
                </div>

                <Button
                  asChild
                  className={cn(
                    "w-full mb-6 gap-1.5 font-medium",
                    plan.highlighted
                      ? "bg-white text-black hover:bg-white/90"
                      : "bg-white/6 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white"
                  )}
                  variant="ghost"
                >
                  <a href={plan.ctaHref}>
                    {plan.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- Comparison table ---------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <h2 className="text-2xl font-bold text-white mb-8 text-center">Compare plans</h2>
        <div className="overflow-x-auto rounded-2xl border border-white/8">
          <table className="w-full text-left min-w-160">
            <thead>
              <tr className="border-b border-white/8">
                <th className="py-4 px-4 text-white/40 text-sm font-medium w-[40%]">Features</th>
                {plans.map((p) => (
                  <th
                    key={p.id}
                    className={cn(
                      "py-4 px-4 text-center text-sm font-semibold",
                      p.highlighted ? "text-white" : "text-white/60"
                    )}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureGroups.map((group) => (
                <>
                  <tr key={group.id} className="border-t border-white/6 bg-white/2">
                    <td
                      colSpan={5}
                      className="py-2.5 px-4"
                    >
                      <button
                        onClick={() => toggleGroup(group.id)}
                        className="flex items-center gap-2 text-white/50 text-xs font-semibold uppercase tracking-widest hover:text-white/70 transition-colors"
                      >
                        {openGroups[group.id] ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        {group.label}
                      </button>
                    </td>
                  </tr>
                  {openGroups[group.id] &&
                    group.features.map((feat) => (
                      <tr
                        key={feat.id}
                        className="border-t border-white/4 hover:bg-white/2 transition-colors"
                      >
                        <td className="py-3.5 px-4 text-sm text-white/70">{feat.label}</td>
                        <FeatureCell value={feat.free} />
                        <FeatureCell value={feat.pro} />
                        <FeatureCell value={feat.business} />
                        <FeatureCell value={feat.enterprise} />
                      </tr>
                    ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- Self-host ---------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="rounded-2xl border border-white/10 bg-white/3 p-8 sm:p-12 flex flex-col sm:flex-row gap-8 items-start sm:items-center justify-between">
          <div className="flex items-start gap-5">
            <div className="w-12 h-12 rounded-xl border border-white/12 bg-white/6 flex items-center justify-center shrink-0">
              <Code2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1.5">Prefer to self-host?</h3>
              <p className="text-white/50 text-sm leading-relaxed max-w-lg">
                Taskforce is open source (AGPL-3.0). Deploy on your own server, keep full control of your data. Free forever, community support.
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                {["Docker Compose", "Kubernetes", "Railway", "Render"].map((t) => (
                  <span
                    key={t}
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-white/10 text-white/50"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button asChild className="bg-white text-black hover:bg-white/90 font-medium gap-1.5" variant="ghost">
              <a href="/self-host">
                <Code2 className="h-4 w-4" />
                Self-host guide
              </a>
            </Button>
            <a
              href="https://github.com/taskforce-project"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-white/50 hover:text-white transition-colors py-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ---------- Enterprise callout ---------- */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Shield, title: "SOC 2 Type II", desc: "Certified security and availability controls." },
            { icon: Users, title: "Dedicated CSM", desc: "A customer success manager just for your team." },
            { icon: Zap, title: "Custom SLA", desc: "99.9 % uptime SLA with financial penalties." },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="p-6 rounded-2xl border border-white/8 bg-white/2 hover:border-white/15 transition-colors"
            >
              <Icon className="h-5 w-5 text-white/50 mb-3" />
              <p className="text-white font-semibold mb-1">{title}</p>
              <p className="text-white/40 text-sm">{desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button
            asChild
            className="bg-white text-black hover:bg-white/90 font-semibold px-8 gap-2"
            variant="ghost"
          >
            <a href="/contact">
              Talk to our sales team
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pb-32">
        <h2 className="text-2xl font-bold text-white mb-8 text-center">Frequently asked</h2>
        <div className="space-y-2">
          {faqs.map((faq) => {
            const isOpen = openFaq === faq.id;
            return (
              <div
                key={faq.id}
                className="rounded-xl border border-white/8 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : faq.id)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-white/80 hover:text-white hover:bg-white/3 transition-colors"
                >
                  {faq.q}
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-white/40 shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-white/40 shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 pt-0 text-sm text-white/50 leading-relaxed border-t border-white/6">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
