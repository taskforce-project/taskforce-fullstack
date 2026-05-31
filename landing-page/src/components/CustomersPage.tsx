import { ArrowRight, Quote, Star } from "lucide-react";

const stories = [
  {
    company: "Hypersonica",   industry: "Software Development",   migratedFrom: "Jira + Confluence",        initials: "HY", accent: "#60a5fa",
    headline: "Cut planning overhead by 60% in the first sprint",
    body: "We were spending more time managing Jira than shipping features. Taskforce's unified workspace - tasks, wiki, and AI in one place - eliminated our entire toolchain fragmentation.",
    author: "Jordan T.", role: "Engineering Manager",
  },
  {
    company: "Foxsense",      industry: "Software Development",   migratedFrom: "Excel + Monday + Notion", initials: "FX", accent: "#c084fc",
    headline: "Three tools replaced, one workspace to rule them all",
    body: "We were juggling Excel for tracking, Monday for sprints, and Notion for docs. Taskforce replaced all three without us losing a single workflow. The migration took less than a day.",
    author: "Priya M.", role: "Head of Product",
  },
  {
    company: "MinimalArt",    industry: "Creative Agency",        migratedFrom: "ClickUp",                 initials: "MA", accent: "#fb923c",
    headline: "Finally, a PM tool that creative teams actually like using",
    body: "ClickUp was a nightmare to configure. Taskforce works out of the box and gets out of the way. Our designers love the clean interface, and our devs love the API.",
    author: "Claire D.", role: "Co-founder",
  },
  {
    company: "GobbleCube",    industry: "SaaS",                   migratedFrom: "Asana + Notion + Excel",  initials: "GC", accent: "#4ade80",
    headline: "Consolidated 3 tools, saved $40k/year",
    body: "We calculated our total cost across Asana, Notion, and the Excel chaos tax. Switching to Taskforce Business saved us over $40,000 annually and halved our tool-switching time.",
    author: "Rajan P.", role: "CTO",
  },
  {
    company: "Groupthink Labs", industry: "Research Services",    migratedFrom: "Jira",                    initials: "GL", accent: "#60a5fa",
    headline: "Research teams aren't engineering teams - Taskforce gets that",
    body: "Jira was designed for software sprints, not research cycles. Taskforce's flexible work item types let us model our own processes without fighting the tool.",
    author: "Sarah K.", role: "Director of Research",
  },
  {
    company: "Rever",         industry: "Fintech",                migratedFrom: "Linear + Notion",         initials: "RV", accent: "#c084fc",
    headline: "From startup to 200-person team without re-tooling",
    body: "We started on Taskforce's free plan at 5 people and scaled to 200 without changing tools. The workspace just grew with us - initiatives, epics, cycles, everything clicked into place.",
    author: "Marcus L.", role: "VP Engineering",
  },
];

const wallOfLove = [
  { text: "Taskforce is what Jira would be if it was designed by people who actually write code.", author: "@tom_eng", role: "Senior Engineer", accent: "#60a5fa" },
  { text: "The AI actually works because it knows my projects. Not just generic GPT fluff.", author: "@priya_pm", role: "Product Manager", accent: "#c084fc" },
  { text: "Self-hosting was up in 20 minutes. God Mode admin panel is a dream.", author: "@devops_kai", role: "DevOps Lead", accent: "#fb923c" },
  { text: "We migrated 3 years of Jira data in one afternoon. The importer is magic.", author: "@alex_cto", role: "CTO, Series B startup", accent: "#4ade80" },
  { text: "Finally a PM tool where the wiki and tasks share the same brain.", author: "@sophie_design", role: "Design Lead", accent: "#60a5fa" },
  { text: "Our compliance team was skeptical. SOC 2 + ISO certs + self-host option = approved.", author: "@sam_infosec", role: "InfoSec Manager", accent: "#c084fc" },
];

export function CustomersPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Hero */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-purple-400/[0.04] rounded-full blur-[130px]" />
          <div className="bg-grid absolute inset-0" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="badge-dark mb-6 inline-flex">Customer Stories</div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-white leading-[1.05] mb-6">
            Trusted by teams
            <br />
            <span className="gradient-text">that actually ship</span>
          </h1>
          <p className="text-xl text-white/40 max-w-2xl mx-auto leading-relaxed mb-10">
            From 5-person startups to Fortune 10 enterprises - here's what teams say about Taskforce after making the switch.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-center">
            {[
              { value: "50,000+", label: "Teams worldwide" },
              { value: "80+",     label: "Countries" },
              { value: "4.8 / 5", label: "Average rating" },
            ].map(({ value, label }) => (
              <div key={label} className="px-6 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-2xl font-black text-white">{value}</p>
                <p className="text-white/30 text-xs mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Customer story cards */}
      <section className="py-24 bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stories.map(({ company, industry, migratedFrom, initials, accent, headline, body, author, role }) => (
              <div
                key={company}
                className="group p-6 rounded-2xl bg-[#0a0a0a] border border-white/[0.07] hover:border-white/[0.12] transition-all flex flex-col"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: `${accent}18`, border: `1px solid ${accent}28`, color: accent }}
                  >
                    {initials}
                  </div>
                  <div>
                    <p className="text-white/80 font-semibold text-sm">{company}</p>
                    <p className="text-white/30 text-xs">{industry}</p>
                  </div>
                  <div className="ml-auto">
                    <span className="text-[9px] px-2 py-0.5 rounded-full border border-white/[0.08] text-white/25">
                      from {migratedFrom}
                    </span>
                  </div>
                </div>

                <div className="flex gap-0.5 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                  ))}
                </div>

                <h3 className="text-white/80 font-bold text-sm mb-3 leading-snug">{headline}</h3>
                <p className="text-white/40 text-xs leading-relaxed flex-1 mb-5">{body}</p>

                <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/[0.05]">
                  <div>
                    <p className="text-white/60 text-xs font-semibold">{author}</p>
                    <p className="text-white/25 text-[10px]">{role}</p>
                  </div>
                  <a href="#" className="text-xs text-white/25 hover:text-white/60 transition-colors flex items-center gap-1">
                    Read story <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Wall of love */}
      <section className="py-24 bg-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="badge-dark mb-5 inline-flex">Wall of Love</div>
            <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">What teams say every day</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {wallOfLove.map(({ text, author, role, accent }) => (
              <div key={author} className="p-6 rounded-2xl bg-[#0a0a0a] border border-white/[0.07]">
                <Quote className="h-4 w-4 mb-4 opacity-40" style={{ color: accent }} />
                <p className="text-white/55 text-sm leading-relaxed mb-5">{text}</p>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ background: `${accent}15`, border: `1px solid ${accent}25`, color: accent }}
                  >
                    {author.slice(1, 3).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white/55 text-xs font-semibold">{author}</p>
                    <p className="text-white/25 text-[10px]">{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-[#050505]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-5 tracking-tight">Ready to join them?</h2>
          <p className="text-white/40 text-lg mb-10 max-w-lg mx-auto">Start free and see why 50,000+ teams chose Taskforce over the alternatives.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="http://localhost:3000/auth/register"
              className="group inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-black bg-white rounded-lg hover:bg-white/90 transition-colors"
            >
              Start for free <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white/60 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              Talk to sales
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

export default CustomersPage;
