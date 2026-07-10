import { Check, Loader2, Sparkles, Brain, Workflow, Bot } from "lucide-react";

/**
 * HomeFeatures — sections « feature » riches de la home (light), façon Linear :
 * chaque section = titre + description + points + un VRAI mock produit (pipeline / board / agent).
 * Statique (SSR/SEO). Mocks illustratifs (pas de fausses captures). Spec : Spec_Master §5.
 */

const AI = "#5856d6";

/* ─────────────────────────── Layout ─────────────────────────── */

function FeatureSection({
  eyebrow,
  title,
  description,
  bullets,
  badge,
  reverse,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  badge?: string;
  reverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 lg:grid-cols-2 lg:gap-20 lg:px-8">
        <div className={reverse ? "lg:order-2" : ""}>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold uppercase tracking-wider text-indigo-600">
              {eyebrow}
            </span>
            {badge && (
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                {badge}
              </span>
            )}
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-[38px] sm:leading-[1.1]">
            {title}
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted-foreground sm:text-base">{description}</p>
          <ul className="mt-6 space-y-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[14px] text-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-green-600" />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div className={reverse ? "lg:order-1" : ""}>{children}</div>
      </div>
    </section>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-card shadow-[0_24px_60px_-24px_rgba(0,0,0,0.22)]">
      <div className="flex h-9 items-center gap-1.5 border-b border-black/[0.06] px-3">
        <span className="size-2.5 rounded-full bg-red-400/70" />
        <span className="size-2.5 rounded-full bg-amber-400/70" />
        <span className="size-2.5 rounded-full bg-green-400/70" />
        <span className="ml-3 truncate text-[11px] text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}

/* ─────────────────────────── Visuels ─────────────────────────── */

const STEPS: { l: string; s: "done" | "active" | "todo" }[] = [
  { l: "Vision", s: "done" },
  { l: "Product spec", s: "done" },
  { l: "Architecture", s: "done" },
  { l: "API design", s: "active" },
  { l: "Implementation", s: "todo" },
  { l: "QA", s: "todo" },
  { l: "Deploy", s: "todo" },
];

function PipelineViz() {
  return (
    <Frame title="taskforce.app · Run #145 — Checkout redesign">
      <div className="p-5">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">Delivery pipeline</h4>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
            <span className="size-1.5 rounded-full bg-indigo-500" />
            In progress
          </span>
        </div>
        <ol className="mt-4 space-y-1">
          {STEPS.map((st) => (
            <li key={st.l} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-[13px]">
              {st.s === "done" && (
                <span className="flex size-5 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <Check className="size-3" />
                </span>
              )}
              {st.s === "active" && (
                <span className="flex size-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                  <Loader2 className="size-3 motion-safe:animate-spin" />
                </span>
              )}
              {st.s === "todo" && <span className="size-5 rounded-full border border-black/[0.12]" />}
              <span className={st.s === "todo" ? "text-muted-foreground" : "text-foreground"}>{st.l}</span>
              {st.s === "active" && (
                <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                  Claude Code
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Frame>
  );
}

const COLS: { n: string; dot: string; cards: { t: string; p: "high" | "med" | "low"; who: string; ai?: boolean }[] }[] = [
  { n: "To do", dot: "bg-muted-foreground/40", cards: [{ t: "Checkout flow", p: "high", who: "MD", ai: true }, { t: "DB schema", p: "med", who: "PM" }] },
  { n: "In progress", dot: "bg-indigo-500", cards: [{ t: "REST API", p: "high", who: "SB" }] },
  { n: "Done", dot: "bg-green-500", cards: [{ t: "Design system", p: "low", who: "MD" }] },
];

function BoardViz() {
  return (
    <Frame title="taskforce.app · Website redesign · Board">
      <div className="grid grid-cols-3 gap-2 p-4">
        {COLS.map((c) => (
          <div key={c.n}>
            <p className="mb-2 flex items-center gap-1.5 px-0.5 text-[11px] font-medium text-muted-foreground">
              <span className={"size-1.5 rounded-full " + c.dot} />
              {c.n} · {c.cards.length}
            </p>
            <div className="space-y-2">
              {c.cards.map((card) => (
                <div key={card.t} className="rounded-md border border-black/[0.07] bg-card p-2.5 shadow-sm">
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="text-[12px] font-medium leading-snug text-foreground">{card.t}</p>
                    <span
                      className={
                        "shrink-0 rounded px-1 py-px text-[9px] font-medium " +
                        (card.p === "high" ? "bg-red-50 text-red-600" : card.p === "med" ? "bg-amber-50 text-amber-600" : "bg-sky-50 text-sky-600")
                      }
                    >
                      {card.p}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <span
                      className="flex size-4 items-center justify-center rounded-full bg-foreground text-[8px] font-medium text-white"
                      style={card.ai ? { boxShadow: `0 0 0 1.5px ${AI}` } : undefined}
                    >
                      {card.who}
                    </span>
                    {card.ai && <Sparkles className="size-3" style={{ color: AI }} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function AgentViz() {
  return (
    <Frame title="TaskForce AI · Brain OS agent">
      <div className="space-y-2.5 p-4 text-[12.5px]">
        <div className="flex justify-end">
          <p className="max-w-[82%] rounded-lg rounded-br-sm bg-secondary px-2.5 py-1.5 text-foreground">
            Plan the checkout redesign and assign the work.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-foreground">
          <Check className="size-3.5 text-green-600" />
          Read Brain OS context · 12 sources
        </div>
        <div className="flex items-center gap-1.5 text-foreground">
          <Check className="size-3.5 text-green-600" />
          Analyzed 8 open issues
        </div>
        <div className="rounded-lg border border-black/[0.07] bg-secondary/30 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5">
            <Check className="size-3.5 text-green-600" />
            <span className="font-mono text-[11px] text-foreground">smart_assign()</span>
            <span className="text-muted-foreground">matched</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px]">
            <span className="flex size-4 items-center justify-center rounded-full bg-foreground text-[8px] font-medium text-white">
              MD
            </span>
            <span className="text-foreground">Marie Dubois</span>
            <span className="rounded px-1 py-px text-[10px] font-medium" style={{ backgroundColor: `${AI}14`, color: AI }}>
              85% fit
            </span>
          </div>
        </div>
        <p className="leading-5 text-foreground">
          Done. I split the work into 6 issues, sequenced spec → API → build → QA, and assigned each by
          skill and capacity.
        </p>
        <div className="flex flex-wrap gap-1 pt-0.5">
          {["Architecture.md", "API.md", "Decisions"].map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded border border-black/[0.07] bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <Brain className="size-2.5" style={{ color: AI }} />
              {s}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ─────────────────────────── Sections exportées ─────────────────────────── */

export function StatementSection() {
  const VALUES: { icon: typeof Workflow; label: string }[] = [
    { icon: Workflow, label: "Orchestrated end to end" },
    { icon: Check, label: "Human-approved at every step" },
    { icon: Bot, label: "Works with any coding agent" },
  ];
  return (
    <section className="py-24 lg:py-32">
      <div className="mx-auto max-w-4xl px-6 text-center lg:px-8">
        <h2 className="text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-[44px] sm:leading-[1.08]">
          A new kind of delivery tool.
          <br className="hidden sm:block" /> Built for teams and AI agents.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-7 text-muted-foreground sm:text-lg">
          TaskForce replaces ticket-shuffling with an orchestration layer: it plans the work, drives
          your agents, and keeps humans in control at every checkpoint.
        </p>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {VALUES.map((v) => (
            <div key={v.label} className="inline-flex items-center gap-2 text-[14px] font-medium text-foreground">
              <span className="flex size-8 items-center justify-center rounded-lg border border-black/[0.08] bg-card text-foreground">
                <v.icon className="size-4" strokeWidth={1.75} />
              </span>
              {v.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OrchestrationFeature() {
  return (
    <FeatureSection
      eyebrow="Orchestration"
      badge="Beta"
      title="Describe outcomes, not tickets"
      description="TaskForce turns a goal into a validated delivery pipeline — Vision → spec → architecture → build → QA → deploy. Each checkpoint runs only after the previous one is approved."
      bullets={[
        "Automatic pipeline from a single outcome",
        "Live Runs with logs, files and tests",
        "Approve, reject or retry any checkpoint",
      ]}
    >
      <PipelineViz />
    </FeatureSection>
  );
}

export function SmartAssignFeature() {
  return (
    <FeatureSection
      eyebrow="Smart Assign"
      reverse
      title="The right work, to the right person"
      description="Smart Assign reasons from skills, current load and history to route every task — to a teammate or an AI agent. No more manual triage or stale assignments."
      bullets={[
        "Five signals + LLM reasoning",
        "Balances load across the team",
        "Explains every suggestion",
      ]}
    >
      <BoardViz />
    </FeatureSection>
  );
}

export function AgentsFeature() {
  return (
    <FeatureSection
      eyebrow="AI agents"
      badge="Beta"
      title="Orchestrate any coding agent"
      description="Claude Code, Cursor, Copilot — TaskForce drives them through the pipeline, grounded in your Brain OS. Model-agnostic by design, so you never get locked in."
      bullets={[
        "Grounded in your workspace's Brain OS",
        "Cites its sources on every answer",
        "Model-agnostic — your moat, not the vendor's",
      ]}
    >
      <AgentViz />
    </FeatureSection>
  );
}

function BrainViz() {
  const nodes: { id: string; x: number; y: number; big?: boolean }[] = [
    { id: "Brain OS", x: 150, y: 95, big: true },
    { id: "Architecture", x: 55, y: 45 },
    { id: "API", x: 250, y: 50 },
    { id: "Decisions", x: 62, y: 158 },
    { id: "Auth", x: 245, y: 152 },
    { id: "Modules", x: 150, y: 182 },
  ];
  const pos: Record<string, { x: number; y: number }> = Object.fromEntries(
    nodes.map((n) => [n.id, { x: n.x, y: n.y }]),
  );
  const edges: [string, string][] = [
    ["Brain OS", "Architecture"],
    ["Brain OS", "API"],
    ["Brain OS", "Decisions"],
    ["Brain OS", "Auth"],
    ["Brain OS", "Modules"],
    ["Architecture", "Modules"],
    ["API", "Auth"],
  ];
  return (
    <Frame title="taskforce.app · Brain OS — knowledge graph">
      <div className="p-4">
        <svg viewBox="0 0 300 215" className="w-full">
          {edges.map(([a, b], i) => (
            <line
              key={i}
              x1={pos[a].x}
              y1={pos[a].y}
              x2={pos[b].x}
              y2={pos[b].y}
              stroke="rgba(88,86,214,0.28)"
              strokeWidth="1.2"
            />
          ))}
          {nodes.map((n) => (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r={n.big ? 9 : 5.5} fill={n.big ? AI : "#ffffff"} stroke={AI} strokeWidth="1.5" />
              <text x={n.x} y={n.y + (n.big ? 25 : 18)} textAnchor="middle" fontSize="9.5" fill="#6e6e73">
                {n.id}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </Frame>
  );
}

export function BrainOSFeature() {
  return (
    <FeatureSection
      eyebrow="Brain OS"
      badge="Beta"
      reverse
      title="Docs that write themselves"
      description="Every decision, spec and change flows into a living knowledge graph — one brain per workspace. Your agents ground their work in it, so your documentation stays current without anyone writing it."
      bullets={[
        "A knowledge graph, auto-filled as you ship",
        "Retrieval-first — agents cite real sources",
        "One workspace = one brain",
      ]}
    >
      <BrainViz />
    </FeatureSection>
  );
}

function AnalyticsViz() {
  const stats = [
    { l: "Lead time", v: "2.4d", d: "−18%" },
    { l: "Runs this week", v: "34", d: "+12%" },
    { l: "Approval rate", v: "96%", d: "+2%" },
  ];
  const bars = [35, 55, 40, 70, 52, 80, 64, 90, 72, 96, 84, 100];
  return (
    <Frame title="taskforce.app · Reporting">
      <div className="p-5">
        <div className="grid grid-cols-3 gap-2.5">
          {stats.map((s) => (
            <div key={s.l} className="rounded-lg border border-black/[0.07] p-3">
              <p className="text-[11px] text-muted-foreground">{s.l}</p>
              <p className="mt-1 text-lg font-semibold tracking-[-0.01em] text-foreground">{s.v}</p>
              <p className="mt-0.5 text-[11px] font-medium text-green-600">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex h-24 items-end gap-1">
          {bars.map((h, i) => (
            <div
              key={i}
              style={{ height: `${h}%` }}
              className={"flex-1 rounded-t " + (i === bars.length - 1 ? "bg-indigo-500" : "bg-indigo-500/15")}
            />
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function AnalyticsFeature() {
  return (
    <FeatureSection
      eyebrow="Analytics"
      title="Understand delivery at scale"
      description="See what's actually shipping. Lead time, throughput, approval rate and agent performance — the delivery metrics that tell you where to focus, not vanity numbers."
      bullets={[
        "Real-time delivery metrics",
        "Per-agent and per-team breakdowns",
        "Spot bottlenecks before they hurt",
      ]}
    >
      <AnalyticsViz />
    </FeatureSection>
  );
}
