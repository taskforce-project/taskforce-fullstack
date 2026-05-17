import { useState } from "react";
import { Container } from "@/components/layout/";

// ─── Keyframe styles injected once ───────────────────────────────────────────
const KEYFRAMES = `
  @keyframes tf-fade-up {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes tf-cursor {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
  @keyframes tf-glow {
    0%, 100% { box-shadow: 0 0 24px 2px rgba(139,92,246,.18); }
    50%       { box-shadow: 0 0 48px 6px rgba(139,92,246,.35); }
  }
  @keyframes tf-dot-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: .5; transform: scale(.8); }
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────
type Agent = { id: string; acronym: string; title: string; tagline: string; color: string };
type Message = { role: "user" | "agent"; text: string; delay: number; type?: string; tag?: string; tagColor?: string };

// ─── Agent definitions ────────────────────────────────────────────────────────
const AGENTS: Agent[] = [
  { id: "ceo",  acronym: "CEO",  title: "Chief Executive Officer",      tagline: "Vision & direction",  color: "#a78bfa" },
  { id: "cfo",  acronym: "CFO",  title: "Chief Financial Officer",      tagline: "Finance & runway",     color: "#34d399" },
  { id: "coo",  acronym: "COO",  title: "Chief Operating Officer",      tagline: "Ops & execution",      color: "#818cf8" },
  { id: "cto",  acronym: "CTO",  title: "Chief Technology Officer",     tagline: "Tech & architecture",  color: "#38bdf8" },
  { id: "cpo",  acronym: "CPO",  title: "Chief Product Officer",        tagline: "Roadmap & UX",         color: "#fb923c" },
  { id: "chro", acronym: "CHRO", title: "Chief HR Officer",             tagline: "Talent & culture",     color: "#f472b6" },
];

// ─── COO demo conversation ────────────────────────────────────────────────────
const COO_MESSAGES: Message[] = [
  { role: "user",  text: "What should I focus on this week?",                                                                  delay: 0 },
  { role: "agent", text: "Scanning 4 active projects and 38 open issues…",                                                      delay: 300,  type: "thinking" },
  { role: "agent", text: "3 critical blockers in Engineering are stalling Sprint 12. Velocity dropped 18% vs last sprint.",      delay: 700,  type: "insight", tag: "⚠ Risk",   tagColor: "#fbbf24" },
  { role: "agent", text: "Recommendation: reassign Lucas & Sophie to unblock TF-312, TF-318. Estimated recovery: +2 pts.",      delay: 1100, type: "action",  tag: "→ Action", tagColor: "#818cf8" },
  { role: "agent", text: "Q2 delivery confidence: 74%. Want a detailed breakdown by team?",                                    delay: 1500, type: "normal" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function AgentCard({
  agent,
  selected,
  onClick,
}: Readonly<{
  agent: Agent;
  selected: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      onClick={onClick}
      style={
        selected
          ? {
              borderColor: `${agent.color}55`,
              animation: "tf-glow 3s ease-in-out infinite",
            }
          : {}
      }
      className={[
        "relative flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-all duration-200 cursor-pointer w-full",
        selected
          ? "bg-white/6 border-white/20"
          : "bg-white/3 border-white/7 hover:bg-white/5 hover:border-white/14",
      ].join(" ")}
    >
      {/* Status dot */}
      {selected && (
        <span
          className="absolute top-3 right-3 h-2 w-2 rounded-full"
          style={{
            backgroundColor: agent.color,
            animation: "tf-dot-pulse 2s ease-in-out infinite",
          }}
        />
      )}

      {/* Acronym badge */}
      <span
        className="text-xs font-bold tracking-widest"
        style={{ color: agent.color }}
      >
        {agent.acronym}
      </span>

      {/* Title */}
      <span className="text-white/90 font-medium text-sm leading-tight">
        {agent.title}
      </span>

      {/* Tagline */}
      <span className="text-white/35 text-xs">{agent.tagline}</span>
    </button>
  );
}

function DemoPanel({ agent }: Readonly<{ agent: Agent }>) {
  return (
    <div
      className="relative rounded-2xl border border-white/10 bg-white/3 overflow-hidden flex flex-col h-full"
      style={{ minHeight: 440 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/7">
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{
            backgroundColor: agent.color,
            animation: "tf-dot-pulse 2s ease-in-out infinite",
          }}
        />
        <span className="text-white/80 text-sm font-medium">
          {agent.acronym}{" "}Agent
        </span>
        <span className="ml-auto text-white/25 text-xs">Active • Real-time</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {COO_MESSAGES.map((msg) => (
          <div
            key={`${msg.role}-${msg.delay}`}
            className={[
              "flex gap-3 items-start",
              msg.role === "user" ? "justify-end" : "justify-start",
            ].join(" ")}
            style={{
              opacity: 0,
              animation: `tf-fade-up 0.4s ease forwards`,
              animationDelay: `${0.4 + msg.delay / 1000}s`,
            }}
          >
            {msg.role === "agent" && (
              <div
                className="shrink-0 mt-0.5 h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{
                  backgroundColor: `${agent.color}22`,
                  color: agent.color,
                  border: `1px solid ${agent.color}44`,
                }}
              >
                {agent.acronym[0]}
              </div>
            )}

            <div
              className={[
                "max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-white/8 text-white/70 rounded-tr-sm"
                  : "bg-white/4 text-white/80 rounded-tl-sm border border-white/7",
              ].join(" ")}
            >
              {msg.type === "thinking" ? (
                <span className="text-white/40 italic">{msg.text}</span>
              ) : (
                <>
                  {msg.tag && msg.tagColor && (
                    <span
                      className="inline-block text-[10px] font-semibold tracking-wide mb-1.5 mr-2 px-1.5 py-0.5 rounded"
                      style={{
                        color: msg.tagColor,
                        backgroundColor: `${msg.tagColor}18`,
                        border: `1px solid ${msg.tagColor}33`,
                      }}
                    >
                      {msg.tag}
                    </span>
                  )}
                  {msg.text}
                </>
              )}
            </div>

            {msg.role === "user" && (
              <div className="shrink-0 mt-0.5 h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white/60 font-medium">
                You
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        <div
          className="flex gap-3 items-center"
          style={{
            opacity: 0,
            animation: "tf-fade-up 0.4s ease forwards",
            animationDelay: "2.4s",
          }}
        >
          <div
            className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{
              backgroundColor: `${agent.color}22`,
              color: agent.color,
              border: `1px solid ${agent.color}44`,
            }}
          >
            {agent.acronym[0]}
          </div>
          <div className="flex items-center gap-1 bg-white/4 border border-white/7 rounded-xl rounded-tl-sm px-4 py-3">
            {[0, 0.2, 0.4].map((d) => (
              <span
                key={d}
                className="block h-1.5 w-1.5 rounded-full bg-white/30"
                style={{ animation: `tf-dot-pulse 1.2s ease-in-out ${d}s infinite` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div className="px-5 py-4 border-t border-white/7">
        <div className="flex items-center gap-3 rounded-xl bg-white/4 border border-white/8 px-4 py-2.5">
          <span className="flex-1 text-sm text-white/20">
            Ask the COO agent…
          </span>
          <span
            className="h-4 w-px bg-white/40 ml-1"
            style={{ animation: "tf-cursor 1s step-end infinite" }}
          />
          <button
            className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
            style={{
              backgroundColor: `${agent.color}33`,
              color: agent.color,
            }}
            aria-label="Send"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M11 1L1 6l4 1.5L6.5 11 11 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────
export function AIAgents() {
  const [selectedId, setSelectedId] = useState("coo");
  const selectedAgent = AGENTS.find((a) => a.id === selectedId) ?? AGENTS[2];

  return (
    <section className="dark relative w-full py-24 md:py-36 overflow-hidden bg-card">
      {/* Keyframes */}
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* Top fade */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-background to-transparent z-10" />

      {/* Subtle dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,.4) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Radial glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-150 w-225 rounded-full opacity-20"
        style={{
          background:
            "radial-gradient(ellipse, rgba(139,92,246,.35) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      {/* Bottom fade */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-background to-transparent z-10" />

      <Container>
        {/* Header */}
        <div className="text-center space-y-5 mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/50 tracking-widest uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" style={{ animation: "tf-dot-pulse 2s ease-in-out infinite" }}></span>{" "}
            <span>AI Executive Team</span>
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight">
            Decision intelligence,{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #a78bfa 0%, #818cf8 50%, #38bdf8 100%)",
              }}
            >
              built in
            </span>
          </h2>

          <p className="text-white/40 text-lg max-w-xl mx-auto leading-relaxed">
            Six specialized AI agents — one per C-suite role — working in concert
            to guide your operations, finances, product, and people.
          </p>
        </div>

        {/* Layout: agent grid + demo panel */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 max-w-5xl mx-auto">
          {/* Left: agent cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
            {AGENTS.map((agent, i) => (
              <div
                key={agent.id}
                style={{
                  opacity: 0,
                  animation: "tf-fade-up 0.5s ease forwards",
                  animationDelay: `${i * 0.08}s`,
                }}
              >
                <AgentCard
                  agent={agent}
                  selected={selectedId === agent.id}
                  onClick={() => setSelectedId(agent.id)}
                />
              </div>
            ))}

            {/* Teaser card */}
            <div
              className="col-span-2 sm:col-span-3 lg:col-span-2 xl:col-span-3 rounded-xl border border-dashed border-white/8 p-4 flex items-center gap-3"
              style={{
                opacity: 0,
                animation: "tf-fade-up 0.5s ease forwards",
                animationDelay: "0.55s",
              }}
            >
              <span
                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                style={{
                  backgroundColor: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.2)",
                  border: "1px dashed rgba(255,255,255,0.1)",
                }}
              >
                +
              </span>
              <div>
                <p className="text-white/30 text-xs font-medium">More agents coming</p>
                <p className="text-white/20 text-xs">Legal · Sales · Marketing</p>
              </div>
            </div>
          </div>

          {/* Right: demo panel */}
          <div
            key={selectedId}
            style={{
              opacity: 0,
              animation: "tf-fade-up 0.4s ease forwards",
              animationDelay: "0.1s",
            }}
          >
            <DemoPanel agent={selectedAgent} />
          </div>
        </div>

        {/* Bottom stats */}
        <div
          className="mt-16 flex flex-wrap items-center justify-center gap-8 text-center"
          style={{
            opacity: 0,
            animation: "tf-fade-up 0.5s ease forwards",
            animationDelay: "0.7s",
          }}
        >
          {[
            { value: "6", label: "Specialized agents" },
            { value: "Real-time", label: "Operational insights" },
            { value: "Zero", label: "Setup required" },
          ].map((stat) => (
            <div key={stat.label} className="space-y-1">
              <p className="text-2xl font-bold text-white/90">{stat.value}</p>
              <p className="text-white/30 text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
