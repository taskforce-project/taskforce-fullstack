import { Users, Zap, Shield, BarChart3, Bell, ArrowRight, GitBranch, CheckCircle2, FileText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NoiseTexture } from "@/components/ui/noise-texture";
import { Safari } from "@/components/ui/safari";
import { Iphone } from "@/components/ui/iphone";

/* ─── Mock content rendered inside Safari screen ─── */

export function MockBoard() {
  const cols = [
    {
      label: "Backlog",
      dot: "#94a3b8",
      tasks: [
        { title: "User onboarding flow", tag: "Design", color: "#c084fc" },
        { title: "API rate limiting", tag: "Backend", color: "#60a5fa" },
      ],
    },
    {
      label: "In progress",
      dot: "#f59e0b",
      tasks: [
        { title: "Dashboard redesign", tag: "Frontend", color: "#34d399", progress: 65 },
        { title: "Auth with Keycloak", tag: "Backend", color: "#60a5fa", progress: 40 },
        { title: "Sprint review setup", tag: "PM", color: "#fb923c", progress: 80 },
      ],
    },
    {
      label: "Done",
      dot: "#22c55e",
      tasks: [
        { title: "Design system tokens", tag: "Design", color: "#c084fc" },
        { title: "CI pipeline", tag: "DevOps", color: "#fb923c" },
      ],
    },
  ];

  return (
    <div className="h-full bg-white flex flex-col text-[9px] overflow-hidden">
      {/* Fake toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 shrink-0">
        <span className="font-semibold text-slate-700 text-[10px]">Sprint 14</span>
        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">Board</span>
        <span className="px-2 py-0.5 rounded text-slate-400">List</span>
        <span className="px-2 py-0.5 rounded text-slate-400">Timeline</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex -space-x-1">
            {["A", "C", "D"].map((l) => (
              <div key={l} className="w-4 h-4 rounded-full bg-linear-to-br from-violet-400 to-blue-400 border border-white flex items-center justify-center text-white font-bold" style={{ fontSize: 6 }}>{l}</div>
            ))}
          </div>
        </div>
      </div>
      {/* Kanban columns */}
      <div className="flex gap-2 p-3 flex-1 overflow-hidden">
        {cols.map((col) => (
          <div key={col.label} className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: col.dot }} />
              <span className="font-semibold text-slate-500 uppercase tracking-wide" style={{ fontSize: 7 }}>{col.label}</span>
              <span className="ml-auto text-slate-300 font-medium">{col.tasks.length}</span>
            </div>
            <div className="space-y-1.5">
              {col.tasks.map((t) => (
                <div key={t.title} className="bg-white rounded border border-slate-100 p-2 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                  <p className="text-slate-700 font-medium leading-tight mb-1.5" style={{ fontSize: 8 }}>{t.title}</p>
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.5 rounded text-[6px] font-medium" style={{ background: t.color + "22", color: t.color }}>{t.tag}</span>
                    {"progress" in t && (
                      <div className="flex items-center gap-1">
                        <div className="w-10 h-0.5 bg-slate-100 rounded-full">
                          <div className="h-0.5 rounded-full bg-blue-400" style={{ width: `${t.progress}%` }} />
                        </div>
                        <span className="text-slate-300" style={{ fontSize: 6 }}>{t.progress}%</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Simulated team chat ─── */

function MockChat() {
  const messages = [
    { user: "Alice", avatar: "A", color: "#c084fc", text: "Dashboard redesign is ready for review 🎉", time: "2:34 PM", self: false },
    { user: "Carlos", avatar: "C", color: "#60a5fa", text: "Tests are all green 👌", time: "2:35 PM", self: false },
    { user: "You", avatar: "M", color: "#34d399", text: "Merging now 🚀", time: "2:35 PM", self: true },
    { user: "Dana", avatar: "D", color: "#fb923c", text: "LGTM — left 2 comments on the chart component", time: "2:36 PM", self: false },
  ];
  return (
    <div className="mt-5 rounded-xl bg-white/60 dark:bg-white/5 border border-emerald-100 dark:border-emerald-500/10 overflow-hidden flex flex-col" style={{ height: 188 }}>
      {/* Chat header */}
      <div className="px-3 py-2 border-b border-emerald-100 dark:border-emerald-500/10 flex items-center gap-2 shrink-0 bg-white/40 dark:bg-white/3">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 0 3px rgba(52,211,153,0.25)" }} />
        <span className="text-[10px] font-semibold text-foreground/60 uppercase tracking-widest">Team chat</span>
        <span className="ml-auto text-[9px] text-muted-foreground/40">4 online</span>
      </div>
      {/* Messages */}
      <div className="flex-1 overflow-hidden px-3 py-2.5 space-y-2.5">
        {messages.map((m) => (
          <div key={`${m.user}-${m.time}`} className={`flex items-end gap-1.5 ${m.self ? "flex-row-reverse" : ""}`}>
            {!m.self && (
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: m.color }}>{m.avatar}</div>
            )}
            <div className={`max-w-[78%] px-2.5 py-1.5 text-[10px] leading-relaxed ${
              m.self
                ? "bg-emerald-500 text-white rounded-2xl rounded-br-sm"
                : "bg-white dark:bg-white/8 text-foreground/80 rounded-2xl rounded-bl-sm border border-emerald-50 dark:border-white/6"
            }`}>{m.text}</div>
          </div>
        ))}
        {/* Typing indicator */}
        <div className="flex items-end gap-1.5">
          <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-[8px] font-bold text-slate-500 dark:text-white/50 shrink-0">S</div>
          <div className="px-3 py-2 bg-white dark:bg-white/8 rounded-2xl rounded-bl-sm border border-emerald-50 dark:border-white/6 flex gap-1 items-center">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1 h-1 rounded-full bg-muted-foreground/30" style={{ animation: `typingBounce 1.2s ${i * 0.18}s infinite ease-in-out` }} />
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes typingBounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-3px); } }`}</style>
    </div>
  );
}

/* ─── Mock content rendered inside iPhone screen ─── */

export function MockMobile() {
  const items = [
    { title: "Dashboard redesign", tag: "Frontend", avatar: "A", color: "#c084fc", done: false },
    { title: "Auth with Keycloak", tag: "Backend", avatar: "C", color: "#60a5fa", done: false },
    { title: "Design system tokens", tag: "Design", avatar: "D", color: "#34d399", done: true },
    { title: "CI pipeline", tag: "DevOps", avatar: "B", color: "#fb923c", done: true },
    { title: "API rate limiting", tag: "Backend", avatar: "A", color: "#60a5fa", done: false },
  ];
  return (
    <div className="h-full bg-[#f8fafc] flex flex-col overflow-hidden">
      {/* Status bar */}
      <div className="px-3 pt-2 pb-1 flex items-center justify-between text-[7px] text-slate-400 shrink-0">
        <span>9:41</span>
        <div className="flex gap-0.5">
          <div className="w-2 h-1 bg-slate-400 rounded-sm" />
          <div className="w-2 h-1 bg-slate-400 rounded-sm" />
          <div className="w-3 h-1 bg-slate-400 rounded-sm" />
        </div>
      </div>
      {/* Header */}
      <div className="px-3 pb-2 shrink-0">
        <p className="text-[8px] text-slate-400 font-medium">My tasks</p>
        <p className="text-[11px] font-bold text-slate-800 leading-tight">Sprint 14</p>
      </div>
      {/* Stats row */}
      <div className="px-3 mb-2 flex gap-2 shrink-0">
        {[{ label: "Open", value: "8", color: "#3b82f6" }, { label: "Done", value: "5", color: "#22c55e" }, { label: "Due", value: "2", color: "#f59e0b" }].map((s) => (
          <div key={s.label} className="flex-1 bg-white rounded-lg p-2 border border-slate-100 shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-center">
            <p className="text-[11px] font-bold leading-none" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[6px] text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      {/* Task list */}
      <div className="flex-1 overflow-hidden px-3 space-y-1.5">
        {items.map((item) => (
          <div key={item.title} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-slate-100 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${item.done ? "border-emerald-400 bg-emerald-400" : "border-slate-200"}`}>
              {item.done && <div className="w-1.5 h-1 border-r border-b border-white rotate-45 -translate-y-px" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[8px] font-medium leading-tight truncate ${item.done ? "line-through text-slate-300" : "text-slate-700"}`}>{item.title}</p>
              <span className="text-[6px] font-medium px-1 py-0.5 rounded" style={{ background: item.color + "20", color: item.color }}>{item.tag}</span>
            </div>
            <div className="w-4 h-4 rounded-full bg-linear-to-br from-violet-400 to-blue-400 flex items-center justify-center text-white font-bold shrink-0" style={{ fontSize: 6 }}>{item.avatar}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Shared noise + card wrapper ─── */

function Card({ className, children }: Readonly<{ className: string; children: React.ReactNode }>) {
  return (
    <div className={`relative rounded-2xl overflow-hidden border ${className}`}>
      {/* Noise texture overlay */}
      <NoiseTexture className="absolute inset-0 w-full h-full pointer-events-none z-1" noiseOpacity={0.25} />
      <div className="relative z-2 h-full">{children}</div>
    </div>
  );
}

/* ─── Safari screen area constants (from safari.tsx) ─── */
// SAFARI: 1203×753, screen starts at x=1, y=52, w=1200, h=700
const SAFARI_SCREEN = {
  left: `${(1 / 1203) * 100}%`,
  top: `${(52 / 753) * 100}%`,
  width: `${(1200 / 1203) * 100}%`,
  height: `${(700 / 753) * 100}%`,
};

// IPHONE: 433×882, screen starts at x=21.25, y=19.25, w=389.5, h=843.5
const IPHONE_SCREEN = {
  left: `${(21.25 / 433) * 100}%`,
  top: `${(19.25 / 882) * 100}%`,
  width: `${(389.5 / 433) * 100}%`,
  height: `${(843.5 / 882) * 100}%`,
  borderRadius: `${(55.75 / 389.5) * 100}% / ${(55.75 / 843.5) * 100}%`,
};

/* ─── FeatureCards section ─── */

export function FeatureCards() {
  return (
    <section className="py-16 sm:py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Feature-first
          </p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
            Every tool your team needs,<br className="hidden sm:block" /> beautifully unified
          </h2>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-12 gap-4">

          {/* ── Card 1 : Safari dashboard mockup (blue) ── */}
          <Card className="col-span-12 lg:col-span-7 bg-sky-50 border-sky-100 dark:bg-sky-500/[0.07] dark:border-sky-500/15">
            <div className="p-6 pb-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 text-[10px] font-semibold uppercase tracking-widest mb-3">
                <BarChart3 className="h-3 w-3" />
                Project boards
              </div>
              <h3 className="text-xl font-bold text-foreground leading-snug mb-1">
                See everything at a glance
              </h3>
              <p className="text-sm text-muted-foreground">
                Kanban, list, timeline - switch instantly without losing context.
              </p>
            </div>
            {/* Safari mockup */}
            <div className="mx-4 mb-0">
              <div className="relative w-full" style={{ aspectRatio: "1203/753" }}>
                {/* Screen content */}
                <div
                  className="absolute overflow-hidden"
                  style={{
                    ...SAFARI_SCREEN,
                    borderRadius: "0 0 9px 9px",
                  }}
                >
                  <MockBoard />
                </div>
                {/* Safari frame overlay */}
                <Safari
                  className="absolute inset-0 w-full h-full z-10"
                  url="app.taskforce.io/board"
                  style={{ aspectRatio: undefined }}
                />
              </div>
            </div>
          </Card>

          {/* ── Card 2 : AI feature (violet) ── */}
          <Card className="col-span-12 lg:col-span-5 bg-violet-50 border-violet-100 dark:bg-violet-500/[0.07] dark:border-violet-500/15">
            <div className="p-6 h-full flex flex-col justify-between">
              <div>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-violet-100 dark:bg-violet-500/15">
                  <Zap className="h-5 w-5 text-violet-500 dark:text-violet-400" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">AI Co-pilot built in</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Summarize sprints, detect duplicate issues, split user stories into subtasks - all context-aware and instant.
                </p>
              </div>
              {/* AI workflow pipeline */}
              <div className="mt-5 relative">
                <div className="absolute left-[13px] top-5 bottom-5 w-px bg-violet-200 dark:bg-violet-500/20" />
                {[
                  { Icon: FileText, label: "Issue created", desc: "User story added to backlog", color: "#c084fc" },
                  { Icon: Sparkles, label: "AI analysis", desc: "Context mapped, duplicates flagged", color: "#818cf8" },
                  { Icon: GitBranch, label: "Subtasks split", desc: "6 tasks estimated & assigned", color: "#60a5fa" },
                  { Icon: CheckCircle2, label: "Sprint queued", desc: "Auto-added to Sprint 15", color: "#34d399" },
                ].map(({ Icon, label, desc, color }) => (
                  <div key={label} className="flex gap-3 pb-3.5 last:pb-0">
                    <div className="relative z-10 w-7 h-7 rounded-full shrink-0 flex items-center justify-center" style={{ background: color + "22", border: `1.5px solid ${color}55` }}>
                      <Icon className="h-3.5 w-3.5" style={{ color }} />
                    </div>
                    <div className="pt-0.5">
                      <p className="text-xs font-semibold text-foreground/80 leading-none mb-0.5">{label}</p>
                      <p className="text-[10px] text-muted-foreground leading-snug">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <a href="#ai" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline">
                Explore AI features <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </Card>

          {/* ── Card 3 : Collaboration (emerald) ── */}
          <Card className="col-span-12 lg:col-span-5 bg-emerald-50 border-emerald-100 dark:bg-emerald-500/[0.07] dark:border-emerald-500/15">
            <div className="p-6 h-full flex flex-col justify-between">
              <div>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-emerald-100 dark:bg-emerald-500/15">
                  <Users className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">Real-time collaboration</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Teammates see changes as they happen. Comments, mentions, and live cursors - no refresh needed.
                </p>
              </div>
              <MockChat />
              <a href="#features" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
                See collaboration features <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </Card>

          {/* ── Card 4 : iPhone mobile mockup (rose) ── */}
          <Card className="col-span-12 lg:col-span-7 bg-rose-50 border-rose-100 dark:bg-rose-500/[0.07] dark:border-rose-500/15">
            <div className="p-6 flex flex-row items-center gap-6 overflow-hidden" style={{ minHeight: 280 }}>
              {/* Text left */}
              <div className="flex-1 min-w-0">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-semibold uppercase tracking-widest mb-4">
                  <Bell className="h-3 w-3" />
                  Mobile app
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Your workspace, in your pocket
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Full-featured iOS and Android app. Stay on top of tasks, get notified, and ship from anywhere.
                </p>
                <a href="#mobile" className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline">
                  Download the app <ArrowRight className="h-3 w-3" />
                </a>
              </div>
              {/* iPhone right */}
              <div className="shrink-0 w-36">
                <div className="relative w-full" style={{ aspectRatio: "433/882" }}>
                  <div className="absolute overflow-hidden" style={{ ...IPHONE_SCREEN }}>
                    <MockMobile />
                  </div>
                  <Iphone className="absolute inset-0 w-full h-full z-10" style={{ aspectRatio: undefined }} />
                </div>
              </div>
            </div>
          </Card>

          {/* ── Card 5 : Security (amber) — full width or partial ── */}
          <Card className="col-span-12 lg:col-span-6 bg-amber-50 border-amber-100 dark:bg-amber-500/[0.07] dark:border-amber-500/15">
            <div className="p-6 flex items-start gap-5">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 dark:bg-amber-500/15">
                <Shield className="h-5 w-5 text-amber-500 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">Enterprise-grade security</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  SOC 2 Type II, GDPR compliant. SSO, SAML, audit logs, and self-hosted deployment available.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {["SOC 2", "GDPR", "SSO/SAML", "Self-host"].map((b) => (
                    <Badge key={b} variant="outline">{b}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* ── Card 6 : Integrations (indigo) ── */}
          <Card className="col-span-12 lg:col-span-6 bg-indigo-50 border-indigo-100 dark:bg-indigo-500/[0.07] dark:border-indigo-500/15">
            <div className="p-6 flex items-start gap-5">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-indigo-100 dark:bg-indigo-500/15">
                <GitBranch className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">100+ integrations</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  GitHub, Slack, Figma, Linear, Jira, Notion and more. Two-way sync, webhooks, and a public API.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {["GitHub", "Slack", "Figma", "Notion", "+96"].map((b) => (
                    <Badge key={b} variant="outline">{b}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </section>
  );
}
