import { Heart, Globe, Code2, Shield, ArrowRight, Github, Twitter, Users, Zap, Lock, Star } from "lucide-react";

const values = [
  { icon: Code2,  accent: "#60a5fa", hover: "hover:bg-gradient-to-br hover:from-blue-500/[0.07] hover:to-cyan-500/[0.04]",   title: "Open Source First",    desc: "We believe great software is built in the open. Our core is MIT-licensed and always will be." },
  { icon: Users,  accent: "#c084fc", hover: "hover:bg-gradient-to-br hover:from-purple-500/[0.07] hover:to-pink-500/[0.04]",  title: "Team Obsessed",        desc: "We build for the humans doing the work - not for managers writing status reports." },
  { icon: Zap,    accent: "#fb923c", hover: "hover:bg-gradient-to-br hover:from-orange-500/[0.07] hover:to-yellow-500/[0.04]", title: "Ruthlessly Simple",    desc: "Every feature we ship has to earn its place. Complexity is the enemy of adoption." },
  { icon: Lock,   accent: "#4ade80", hover: "hover:bg-gradient-to-br hover:from-green-500/[0.07] hover:to-emerald-500/[0.04]", title: "Privacy by Default",   desc: "Your data is yours. We offer self-hosting, air-gapped deployments, and zero telemetry options." },
];

const stats = [
  { value: "50,000+", label: "Teams worldwide" },
  { value: "80+",     label: "Countries" },
  { value: "4.2M+",  label: "Tasks / month" },
  { value: "99.9%",   label: "Uptime SLA" },
];

const milestones = [
  { year: "2022", event: "Taskforce open-sourced on GitHub - 1,000 stars in the first week.", accent: "#60a5fa" },
  { year: "2023", event: "Launched cloud product, reached 10,000 active teams.", accent: "#c084fc" },
  { year: "2024", event: "Self-hosted edition with enterprise controls. Series A funding closed.", accent: "#fb923c" },
  { year: "2025", event: "AI Co-pilot launched. 50,000+ teams across 80 countries.", accent: "#4ade80" },
];

const team = [
  { initials: "AR", name: "Alex R.",    role: "Co-founder & CEO",     accent: "#60a5fa" },
  { initials: "SC", name: "Sophie C.",  role: "Co-founder & CTO",     accent: "#c084fc" },
  { initials: "DK", name: "David K.",   role: "Head of Design",       accent: "#fb923c" },
  { initials: "MG", name: "Maria G.",   role: "Head of Engineering",  accent: "#4ade80" },
  { initials: "TB", name: "Tom B.",     role: "Head of Growth",       accent: "#60a5fa" },
  { initials: "EW", name: "Emma W.",    role: "Head of Product",      accent: "#c084fc" },
];

export function AboutPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Hero */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-white/[0.012] rounded-full blur-[120px]" />
          <div className="bg-grid absolute inset-0" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="badge-dark mb-6 inline-flex">About Taskforce</div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-white leading-[1.05] mb-6">
            We're building the future
            <br />
            <span className="gradient-text">of team work</span>
          </h1>
          <p className="text-xl text-white/40 max-w-2xl mx-auto leading-relaxed mb-10">
            Taskforce started with a simple conviction: project management tools were slowing teams down instead of helping them ship. We set out to fix that.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="http://localhost:3000/auth/register"
              className="group inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-black bg-white rounded-lg hover:bg-white/90 transition-colors"
            >
              Start for free <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="https://github.com/taskforce-project"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white/60 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              <Github className="h-4 w-4" /> View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-14 border-t border-b border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 md:grid-cols-4 gap-8 divide-y-2 md:divide-y-0 md:divide-x divide-white/[0.05]">
          {stats.map(({ value, label }) => (
            <div key={label} className="text-center py-4 md:py-0">
              <p className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-1">{value}</p>
              <p className="text-white/30 text-sm">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mission */}
      <section className="py-24 bg-[#050505]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <div className="badge-dark mb-5 inline-flex">Our Mission</div>
              <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-6 leading-tight">
                The software you
                <br />
                <span className="gradient-text">always wanted</span>
              </h2>
              <p className="text-white/40 text-lg leading-relaxed mb-5">
                Most project management tools were built for process compliance, not for the people doing the actual work. They're expensive, bloated, and designed to generate reports - not to help teams ship.
              </p>
              <p className="text-white/40 text-lg leading-relaxed">
                Taskforce is different. We combine tasks, docs, AI, and analytics into a single workspace that disappears into your workflow - rather than becoming another thing to manage.
              </p>
            </div>
            <div className="space-y-3">
              {[
                { icon: Heart,  accent: "#60a5fa", text: "Built by engineers, for engineers" },
                { icon: Globe,  accent: "#c084fc", text: "Open-source core, always free tier" },
                { icon: Shield, accent: "#fb923c", text: "Self-hostable - your data, your rules" },
                { icon: Star,   accent: "#4ade80", text: "48,000+ GitHub stars and counting" },
              ].map(({ icon: Icon, accent, text }) => (
                <div key={text} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${accent}15`, border: `1px solid ${accent}25` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: accent }} />
                  </div>
                  <span className="text-white/60 text-sm font-medium">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-24 bg-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="badge-dark mb-5 inline-flex">Our Values</div>
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">What drives everything we build</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {values.map(({ icon: Icon, accent, hover, title, desc }) => (
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

      {/* Timeline */}
      <section className="py-24 bg-[#050505]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="badge-dark mb-5 inline-flex">The Road So Far</div>
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">Our story in milestones</h2>
          </div>
          <div className="relative">
            <div className="absolute left-8 top-0 bottom-0 w-px bg-white/[0.06]" />
            <div className="space-y-10">
              {milestones.map(({ year, event, accent }) => (
                <div key={year} className="relative pl-20">
                  <div
                    className="absolute left-[26px] top-1.5 w-4 h-4 rounded-full border-2 bg-black"
                    style={{ borderColor: accent }}
                  />
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: accent }}>{year}</p>
                  <p className="text-white/60 text-sm leading-relaxed">{event}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-24 bg-black">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="badge-dark mb-5 inline-flex">The Team</div>
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-4">Built by people who care</h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto">We're a distributed team of builders spread across San Francisco, Paris, and Bengaluru.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {team.map(({ initials, name, role, accent }) => (
              <div key={name} className="p-4 rounded-2xl bg-[#0a0a0a] border border-white/[0.07] flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: `${accent}18`, border: `1px solid ${accent}28`, color: accent }}
                >
                  {initials}
                </div>
                <div>
                  <p className="text-white/80 font-semibold text-sm">{name}</p>
                  <p className="text-white/30 text-[10px] mt-0.5">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Backed by */}
      <section className="py-20 border-t border-white/[0.05] bg-[#050505]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] mb-6">Backed by</p>
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            {["OSS Capital", "Sequoia Scout", "Y Combinator"].map((name) => (
              <div key={name} className="px-4 py-2 rounded-xl border border-white/[0.07] bg-white/[0.03]">
                <span className="text-white/50 font-medium text-sm">{name}</span>
              </div>
            ))}
          </div>
          <p className="text-white/30 text-sm leading-relaxed max-w-lg mx-auto">
            We're proudly headquartered in San Francisco with engineering offices in Paris and Bengaluru.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-black">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-6 tracking-tight">
            Join us in building
            <br />
            <span className="gradient-text">the future of work</span>
          </h2>
          <p className="text-white/40 text-lg mb-10 max-w-xl mx-auto">Whether you're a user, contributor, or just curious - we'd love to have you along.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="http://localhost:3000/auth/register"
              className="group inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-black bg-white rounded-lg hover:bg-white/90 transition-colors"
            >
              Try Taskforce free <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="https://jobs.taskforce.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white/60 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              <Users className="h-4 w-4" /> We're hiring
            </a>
            <a
              href="https://twitter.com/taskforce"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white/40 hover:text-white/70 transition-colors"
            >
              <Twitter className="h-4 w-4" /> Follow us
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AboutPage;
