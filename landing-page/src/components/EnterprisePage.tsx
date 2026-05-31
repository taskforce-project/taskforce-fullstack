import { useState } from "react";
import {
  Shield, Users, Settings, Globe, ArrowRight,
  CheckCircle2, ChevronDown, Lock, BarChart3, Layers
} from "lucide-react";

const benefits = [
  {
    icon: Shield,
    accent: "#4ade80",
    hover: "hover:bg-gradient-to-br hover:from-green-500/[0.07] hover:to-emerald-500/[0.04]",
    title: "Security & Compliance",
    desc: "SOC 2 Type II, ISO 27001:2022, GDPR, CCPA, and HIPAA-ready. BAA available on request. Full audit log export.",
    features: ["SCIM user provisioning", "SAML SSO (Okta, Azure AD)", "Audit logs & export", "BYOK encryption"],
  },
  {
    icon: Settings,
    accent: "#60a5fa",
    hover: "hover:bg-gradient-to-br hover:from-blue-500/[0.07] hover:to-cyan-500/[0.04]",
    title: "Advanced Workflows",
    desc: "Multi-stage approval workflows, automated state transitions, SLA tracking, and custom escalation paths.",
    features: ["Multi-stage approvals", "SLA enforcement", "Custom automations", "Webhook triggers"],
  },
  {
    icon: Layers,
    accent: "#c084fc",
    hover: "hover:bg-gradient-to-br hover:from-purple-500/[0.07] hover:to-pink-500/[0.04]",
    title: "Org-wide Hierarchy",
    desc: "Workspace → Portfolio → Initiative → Project → Cycle. One view from strategy to sprint, for every stakeholder.",
    features: ["Unlimited portfolios", "Cross-project dependencies", "Executive dashboards", "Custom reporting"],
  },
  {
    icon: Globe,
    accent: "#fb923c",
    hover: "hover:bg-gradient-to-br hover:from-orange-500/[0.07] hover:to-yellow-500/[0.04]",
    title: "Deployment Flexibility",
    desc: "Cloud, self-hosted on Docker/Kubernetes, or fully air-gapped. Feature parity across all deployment modes.",
    features: ["Cloud (managed)", "Self-hosted (on-prem)", "Air-gapped deployment", "AWS Marketplace"],
  },
  {
    icon: BarChart3,
    accent: "#60a5fa",
    hover: "hover:bg-gradient-to-br hover:from-blue-500/[0.07] hover:to-cyan-500/[0.04]",
    title: "Analytics & Insights",
    desc: "Velocity, cycle time, burndown, and custom dashboards. Export to BI tools via our REST API or webhooks.",
    features: ["Custom dashboards", "BI integration", "Velocity tracking", "Resource analytics"],
  },
  {
    icon: Users,
    accent: "#c084fc",
    hover: "hover:bg-gradient-to-br hover:from-purple-500/[0.07] hover:to-pink-500/[0.04]",
    title: "Dedicated Support",
    desc: "Named customer success manager, 24/7 priority SLA, guided migration from Jira or any PM tool in 3 weeks.",
    features: ["Named CSM", "24/7 SLA", "Migration service", "Training & onboarding"],
  },
];

const logos = ["Sony", "Accenture", "Zerodha", "Dolby", "Airbus", "Datum"];

const faqs = [
  {
    q: "How does the enterprise migration from Jira work?",
    a: "We run a structured 3-week migration: Week 1 is Discovery (mapping your Jira config to Taskforce), Week 2 is Parallel Run (both tools live, team testing), Week 3 is Cutover & Onboarding. Most teams complete a dry-run import in under 3 hours.",
  },
  {
    q: "Can Taskforce run fully air-gapped?",
    a: "Yes. Our Commercial edition supports fully air-gapped deployments with zero outbound calls. You control every bit of telemetry and can run our AI models locally via Ollama or self-hosted Anthropic/OpenAI endpoints.",
  },
  {
    q: "What identity providers are supported for SSO?",
    a: "We support SAML 2.0 and OIDC, making us compatible with Okta, Microsoft Azure AD, Google Workspace, OneLogin, Ping Identity, and any standard IdP. SCIM provisioning is available for automated user lifecycle management.",
  },
  {
    q: "What's the uptime SLA for Enterprise?",
    a: "Enterprise customers receive a 99.99% uptime SLA with financial credits for downtime. We maintain a public status page at status.taskforce.app and provide incident post-mortems within 48 hours.",
  },
  {
    q: "Can we keep our data in the EU?",
    a: "Yes. Enterprise cloud customers can select EU data residency (Frankfurt region). Self-hosted customers keep data wherever their infrastructure lives. We sign DPAs and provide SCCs for cross-border transfers.",
  },
];

const migrationWeeks = [
  { week: "Week 1", title: "Discovery",  desc: "Map your Jira config, custom fields, workflows, and users to Taskforce equivalents.", accent: "#60a5fa" },
  { week: "Week 2", title: "Parallel Run", desc: "Both tools live simultaneously. Team validates data integrity and tries new workflows.", accent: "#c084fc" },
  { week: "Week 3", title: "Cutover",    desc: "Clean cutover with rollback plan. Onboarding sessions for power users and admins.", accent: "#4ade80" },
];

export function EnterprisePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-black">
      {/* Hero */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-white/[0.012] rounded-full blur-[130px]" />
          <div className="bg-grid absolute inset-0" />
        </div>
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <div className="badge-dark mb-6 inline-flex">Enterprise</div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-white leading-[1.05] mb-6">
            Enterprise-grade.
            <br />
            <span className="gradient-text">Without the enterprise drag.</span>
          </h1>
          <p className="text-xl text-white/40 max-w-2xl mx-auto leading-relaxed mb-8">
            Taskforce scales to Fortune 10 without becoming the next Jira. SOC 2 certified, air-gap capable, and built to get out of your way.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {["SOC 2 Type II", "ISO 27001:2022", "GDPR", "CCPA", "HIPAA"].map((c) => (
              <span key={c} className="px-3 py-1 rounded-full text-xs font-medium border border-green-400/25 bg-green-400/[0.06] text-green-400">
                {c}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="/contact"
              className="group inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-black bg-white rounded-lg hover:bg-white/90 transition-colors"
            >
              Talk to sales <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white/60 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              View enterprise pricing
            </a>
          </div>
        </div>
      </section>

      {/* Trusted by */}
      <section className="py-12 border-t border-b border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] mb-7">Trusted by teams at</p>
          <div className="flex flex-wrap justify-center gap-8">
            {logos.map((name) => (
              <span key={name} className="text-white/25 font-bold text-base tracking-tight hover:text-white/50 transition-colors cursor-default">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits grid */}
      <section className="py-24 bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="badge-dark mb-5 inline-flex">Enterprise Features</div>
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-4">Everything large teams need</h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto">Not a checklist of features nobody asked for - tools that actually unblock teams at scale.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {benefits.map(({ icon: Icon, accent, hover, title, desc, features }) => (
              <div
                key={title}
                className={`group rounded-2xl border border-white/[0.07] bg-[#0a0a0a] p-6 transition-all duration-300 hover:border-white/[0.12] cursor-default ${hover}`}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${accent}15`, border: `1px solid ${accent}25` }}
                >
                  <Icon className="h-4 w-4" style={{ color: accent }} />
                </div>
                <h3 className="font-semibold text-white text-sm mb-2">{title}</h3>
                <p className="text-white/40 text-xs leading-relaxed mb-4">{desc}</p>
                <ul className="space-y-1.5">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-white/40">
                      <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-24 bg-black">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="badge-dark mb-5 inline-flex">Get in touch</div>
              <h2 className="text-4xl font-black text-white tracking-tight mb-5 leading-tight">
                Let's talk about
                <br />
                <span className="gradient-text">your deployment</span>
              </h2>
              <p className="text-white/40 leading-relaxed mb-6 text-sm">
                Book a 30-minute call with our enterprise team. We'll cover your security requirements, migration path, and deployment options - no slides, no generic demo.
              </p>
              <ul className="space-y-3">
                {["Security review & certifications", "Migration plan from Jira / Asana", "Deployment options & SLA", "Custom pricing for your headcount"].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-white/50 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-7 rounded-2xl bg-[#0a0a0a] border border-white/[0.07]">
              <h3 className="text-lg font-bold text-white mb-6">Schedule a call</h3>
              <div className="space-y-4">
                {[
                  { label: "Full name",   type: "text",  placeholder: "Alex Martin" },
                  { label: "Work email",  type: "email", placeholder: "alex@company.com" },
                  { label: "Company",     type: "text",  placeholder: "Acme Inc." },
                ].map(({ label, type, placeholder }) => (
                  <div key={label}>
                    <label className="block text-[10px] text-white/30 uppercase tracking-widest mb-1.5">{label}</label>
                    <input
                      type={type}
                      placeholder={placeholder}
                      className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.07] rounded-xl text-white/80 placeholder-white/20 text-sm focus:outline-none focus:border-white/20 transition-colors"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-[10px] text-white/30 uppercase tracking-widest mb-1.5">Team size</label>
                  <select className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.07] rounded-xl text-white/50 text-sm focus:outline-none focus:border-white/20 transition-colors appearance-none">
                    <option value="">Select range</option>
                    <option>10 – 50</option>
                    <option>50 – 200</option>
                    <option>200 – 1,000</option>
                    <option>1,000+</option>
                  </select>
                </div>
                <button className="w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-black bg-white rounded-xl hover:bg-white/90 transition-colors mt-2">
                  Book a 30-min call <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Migration highlight */}
      <section className="py-24 bg-[#050505]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="badge-dark mb-5 inline-flex">Migration</div>
          <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-5">We do the heavy lifting</h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto mb-12">
            Two Fortune 10 companies chose Taskforce for their Jira migration. Our structured 3-week process means zero productivity loss.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {migrationWeeks.map(({ week, title, desc, accent }) => (
              <div key={week} className="p-6 rounded-2xl bg-[#0a0a0a] border border-white/[0.07] text-left">
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: accent }}>{week}</p>
                <h3 className="text-white font-bold text-lg mb-3">{title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-black">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="badge-dark mb-5 inline-flex">FAQ</div>
            <h2 className="text-4xl font-black text-white tracking-tight">Enterprise FAQ</h2>
          </div>
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.07] bg-[#0a0a0a] overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left text-white/70 font-medium text-sm hover:text-white transition-colors"
                >
                  {faq.q}
                  <ChevronDown className={`h-4 w-4 shrink-0 text-white/30 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-white/40 text-sm leading-relaxed border-t border-white/[0.05] pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-[#050505]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <Lock className="h-7 w-7 text-white/20 mx-auto mb-4" />
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-5 tracking-tight">
            Enterprise complexity,
            <br />
            <span className="gradient-text">zero slowdown</span>
          </h2>
          <p className="text-white/40 text-lg mb-10 max-w-lg mx-auto">Taskforce adapts to your organisation - not the other way around.</p>
          <a
            href="/contact"
            className="group inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-black bg-white rounded-lg hover:bg-white/90 transition-colors"
          >
            Contact our enterprise team <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </a>
        </div>
      </section>
    </div>
  );
}

export default EnterprisePage;
