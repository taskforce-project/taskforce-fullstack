import {
  Shield, Lock, Eye, Key, Server, FileCheck, AlertTriangle,
  CheckCircle2, ArrowRight, Globe, UserCheck, Database
} from "lucide-react";

const coreFeatures = [
  { icon: Lock,      accent: "#60a5fa", hover: "hover:bg-gradient-to-br hover:from-blue-500/[0.07] hover:to-cyan-500/[0.04]",   title: "AES-256 Encryption",       desc: "All data encrypted at rest using AES-256. All transit encrypted via TLS 1.3 - no exceptions." },
  { icon: Key,       accent: "#c084fc", hover: "hover:bg-gradient-to-br hover:from-purple-500/[0.07] hover:to-pink-500/[0.04]", title: "Two-Factor Authentication", desc: "TOTP-based 2FA for all users. Admins can enforce it workspace-wide via policy." },
  { icon: UserCheck, accent: "#fb923c", hover: "hover:bg-gradient-to-br hover:from-orange-500/[0.07] hover:to-yellow-500/[0.04]",title: "RBAC & Granular Access",    desc: "Role-based access controls with per-project, per-page, and per-member granularity." },
  { icon: Eye,       accent: "#4ade80", hover: "hover:bg-gradient-to-br hover:from-green-500/[0.07] hover:to-emerald-500/[0.04]",title: "Audit Logs",               desc: "Every action is logged with actor, timestamp, and resource. Exportable for compliance." },
  { icon: Server,    accent: "#60a5fa", hover: "hover:bg-gradient-to-br hover:from-blue-500/[0.07] hover:to-cyan-500/[0.04]",   title: "Private Projects",         desc: "Isolate sensitive projects so only explicitly invited members can see them." },
  { icon: FileCheck, accent: "#c084fc", hover: "hover:bg-gradient-to-br hover:from-purple-500/[0.07] hover:to-pink-500/[0.04]", title: "GDPR & CCPA Ready",        desc: "Data residency options, DPA signing, right-to-erasure tooling built in." },
];

const compliance = [
  { label: "SOC 2 Type II", sub: "Certified",   ok: true },
  { label: "ISO 27001:2022", sub: "Certified",  ok: true },
  { label: "GDPR",          sub: "Compliant",   ok: true },
  { label: "CCPA",          sub: "Compliant",   ok: true },
  { label: "HIPAA",         sub: "BAA available", ok: true },
  { label: "FedRAMP",       sub: "In progress", ok: false },
];

const selfHostedFeatures = [
  "Modular Docker / Kubernetes architecture with service isolation",
  "God Mode admin panel with restricted super-admin access",
  "SSO via OIDC / SAML 2.0 - connect to any identity provider",
  "Air-gapped deployment with zero outbound calls",
  "Self-managed encryption keys (BYOK)",
  "Configurable telemetry - fully opt-out",
];

const enterpriseControls = [
  { icon: UserCheck, accent: "#c084fc", title: "SCIM Provisioning", desc: "Automatically sync users and groups from Okta, Azure AD, or any SCIM-compatible IdP." },
  { icon: Key,       accent: "#60a5fa", title: "SAML SSO",          desc: "Single sign-on with SAML 2.0. Works with Okta, OneLogin, Google Workspace, and more." },
  { icon: Database,  accent: "#fb923c", title: "Audit Export",      desc: "Export full audit logs as JSON or CSV. Pipe to SIEM tools like Splunk or Datadog." },
  { icon: Globe,     accent: "#4ade80", title: "Data Residency",    desc: "Choose where your data lives: US, EU, or self-hosted on your own infrastructure." },
];

export function SecurityPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Hero */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-green-400/[0.04] rounded-full blur-[140px]" />
          <div className="bg-grid absolute inset-0" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="badge-dark mb-6 inline-flex">Security &amp; Compliance</div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-white leading-[1.05] mb-6">
            Secure by design,
            <br />
            <span className="gradient-text">not by add-on</span>
          </h1>
          <p className="text-xl text-white/40 max-w-2xl mx-auto leading-relaxed mb-10">
            Every tier of Taskforce - free to enterprise - ships with encryption, access controls, and compliance tooling out of the box. Security isn't a paid upgrade.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="/contact"
              className="group inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-black bg-white rounded-lg hover:bg-white/90 transition-colors"
            >
              Request security review <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="https://security.taskforce.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white/60 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              <FileCheck className="h-4 w-4" /> Trust centre
            </a>
          </div>
        </div>
      </section>

      {/* Compliance badges */}
      <section className="py-14 border-t border-b border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <p className="text-center text-white/20 text-[10px] uppercase tracking-[0.2em] mb-8">Certifications &amp; compliance</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {compliance.map(({ label, sub, ok }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1.5 p-4 rounded-2xl border bg-white/[0.02]"
                style={{ borderColor: ok ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.06)" }}
              >
                <CheckCircle2 className="h-4 w-4 mb-0.5" style={{ color: ok ? "#4ade80" : "rgba(255,255,255,0.2)" }} />
                <p className="text-white/70 font-semibold text-xs text-center">{label}</p>
                <p className="text-white/30 text-[10px]">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Core security features */}
      <section className="py-24 bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="badge-dark mb-5 inline-flex">Core Security</div>
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-4">Security on every plan</h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto">These features ship to every workspace - free, Pro, Business, and Enterprise.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {coreFeatures.map(({ icon: Icon, accent, hover, title, desc }) => (
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
                <p className="text-white/40 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Self-hosted advantages */}
      <section className="py-24 bg-black">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <div className="badge-dark mb-5 inline-flex">Self-Hosted</div>
              <h2 className="text-4xl font-black text-white tracking-tight mb-5 leading-tight">
                Maximum control
                <br />
                <span className="gradient-text">on your infrastructure</span>
              </h2>
              <p className="text-white/40 text-lg leading-relaxed mb-8">
                Run Taskforce entirely on your own servers - on-prem or air-gapped. Nothing leaves your network unless you choose it to.
              </p>
              <a
                href="/self-host"
                className="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white/60 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
              >
                Explore self-hosting <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
            <div className="space-y-2">
              {selfHostedFeatures.map((text) => (
                <div key={text} className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                  <span className="text-white/60 text-sm">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise controls */}
      <section className="py-24 bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="badge-dark mb-5 inline-flex">Enterprise Controls</div>
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">Built for regulated industries</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {enterpriseControls.map(({ icon: Icon, accent, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl border border-white/[0.07] bg-[#0a0a0a] p-6 hover:border-white/[0.12] transition-all"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${accent}15`, border: `1px solid ${accent}25` }}
                >
                  <Icon className="h-4 w-4" style={{ color: accent }} />
                </div>
                <h3 className="font-semibold text-white text-sm mb-2">{title}</h3>
                <p className="text-white/40 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Responsible disclosure */}
      <section className="py-20 border-t border-white/[0.05] bg-black">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <AlertTriangle className="h-7 w-7 text-orange-400 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-white mb-3">Found a vulnerability?</h2>
          <p className="text-white/40 mb-6 leading-relaxed text-sm">
            We run a responsible disclosure programme. Report security issues to{" "}
            <a href="mailto:security@taskforce.app" className="text-blue-400 hover:underline">
              security@taskforce.app
            </a>{" "}
            and we'll respond within 24 hours.
          </p>
          <a
            href="https://security.taskforce.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white/60 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
          >
            <Shield className="h-4 w-4" /> Security advisory policy
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-[#050505]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-5 tracking-tight">
            Ready to see the full
            <br />
            <span className="gradient-text">security picture?</span>
          </h2>
          <p className="text-white/40 text-lg mb-10 max-w-lg mx-auto">
            Our security team will walk you through our controls, certifications, and deployment options in a 30-minute call.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="/contact"
              className="group inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-black bg-white rounded-lg hover:bg-white/90 transition-colors"
            >
              Schedule a security review <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="/enterprise"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white/60 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              Enterprise features
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

export default SecurityPage;
