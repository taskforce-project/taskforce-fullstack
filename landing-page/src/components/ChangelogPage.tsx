import { ArrowRight, Zap, Package } from "lucide-react";

type TagType = "feature" | "improvement" | "fix" | "release";

const tagConfig: Record<TagType, { label: string; color: string; bg: string; dot: string }> = {
  feature:     { label: "New",      color: "#4ade80", bg: "rgba(74,222,128,0.1)",   dot: "#4ade80" },
  improvement: { label: "Improved", color: "#60a5fa", bg: "rgba(96,165,250,0.1)",   dot: "#60a5fa" },
  fix:         { label: "Fix",      color: "#fb923c", bg: "rgba(251,146,60,0.1)",   dot: "#fb923c" },
  release:     { label: "Release",  color: "#c084fc", bg: "rgba(192,132,252,0.1)",  dot: "#c084fc" },
};

const releases = [
  {
    version: "v2.4.0", date: "May 20, 2026", tag: "release" as TagType,
    title: "AI Co-pilot & MCP Server",
    summary: "Taskforce AI is now generally available - workspace-aware agents, natural-language queries, and our open-source MCP server.",
    items: [
      { tag: "feature" as TagType,     text: "AI Co-pilot: ask your workspace questions in plain language" },
      { tag: "feature" as TagType,     text: "Open-source MCP server for agent integration (Claude, GPT-4o)" },
      { tag: "feature" as TagType,     text: "@mention agents on any work item - they pick up context and act" },
      { tag: "feature" as TagType,     text: "AI-powered duplicate detection across work items" },
      { tag: "improvement" as TagType, text: "AI summary auto-generated on cycle close" },
      { tag: "improvement" as TagType, text: "In-editor content manipulation with slash commands" },
    ],
  },
  {
    version: "v2.3.0", date: "April 8, 2026", tag: "release" as TagType,
    title: "Workflows, Approvals & Intake",
    summary: "Build multi-stage approval workflows and consolidate customer requests from email, forms, and Slack into one intake queue.",
    items: [
      { tag: "feature" as TagType,     text: "Multi-stage workflow builder with approval gates" },
      { tag: "feature" as TagType,     text: "Email & form intake - convert requests to work items automatically" },
      { tag: "feature" as TagType,     text: "Customer profiles linked to intake items" },
      { tag: "feature" as TagType,     text: "SLA tracking on intake items with escalation rules" },
      { tag: "improvement" as TagType, text: "Slack integration: create and update items via @taskforce" },
      { tag: "fix" as TagType,         text: "Fixed assignee duplication on workflow state transitions" },
    ],
  },
  {
    version: "v2.2.0", date: "March 1, 2026", tag: "release" as TagType,
    title: "Epics, Initiatives & Dashboards",
    summary: "Full org hierarchy from initiatives to tasks, plus real-time custom dashboards for every stakeholder level.",
    items: [
      { tag: "feature" as TagType,     text: "Initiatives & Epics - connect strategy to execution" },
      { tag: "feature" as TagType,     text: "Cross-project dependencies with blocking/blocked-by relationships" },
      { tag: "feature" as TagType,     text: "Custom dashboards with drag-and-drop widget layout" },
      { tag: "feature" as TagType,     text: "Workspace-level analytics: velocity, cycle time, burndown" },
      { tag: "improvement" as TagType, text: "Gantt view now supports initiative-level rollups" },
      { tag: "improvement" as TagType, text: "Dashboard sharing via public link (read-only)" },
      { tag: "fix" as TagType,         text: "Fixed date picker timezone inconsistencies in Gantt" },
    ],
  },
  {
    version: "v2.1.0", date: "January 20, 2026", tag: "release" as TagType,
    title: "Wiki 2.0 & Real-time Collaboration",
    summary: "A completely rebuilt wiki editor with real-time multiplayer, nested pages, version history, and Notion/Confluence import.",
    items: [
      { tag: "feature" as TagType,     text: "Real-time multiplayer editing with live cursor presence" },
      { tag: "feature" as TagType,     text: "Nested pages with unlimited depth and drag-and-drop reorder" },
      { tag: "feature" as TagType,     text: "Version history with full diff view and one-click restore" },
      { tag: "feature" as TagType,     text: "Page locking for review workflows" },
      { tag: "feature" as TagType,     text: "External page publishing with custom slug" },
      { tag: "improvement" as TagType, text: "Import from Notion and Confluence (with attachments)" },
      { tag: "fix" as TagType,         text: "Fixed image upload failing on large files (>10 MB)" },
    ],
  },
  {
    version: "v2.0.0", date: "December 1, 2025", tag: "release" as TagType,
    title: "Taskforce 2.0 - The Unified Workspace",
    summary: "Complete redesign merging tasks, wiki, and analytics into a single workspace. Self-hosted edition with air-gap support.",
    items: [
      { tag: "feature" as TagType,     text: "Unified workspace: tasks, wiki, and analytics under one roof" },
      { tag: "feature" as TagType,     text: "Self-hosted Commercial edition with Prime CLI installer" },
      { tag: "feature" as TagType,     text: "Air-gapped deployment mode (zero outbound)" },
      { tag: "feature" as TagType,     text: "God Mode admin panel for instance management" },
      { tag: "feature" as TagType,     text: "Teamspaces: org units with shared projects and wikis" },
      { tag: "improvement" as TagType, text: "3× faster initial load via edge caching" },
      { tag: "improvement" as TagType, text: "Dark-only UI replaced with full light/dark/system theme support" },
    ],
  },
  {
    version: "v1.9.2", date: "October 15, 2025", tag: "fix" as TagType,
    title: "Patch: Performance & Bug Fixes",
    summary: "Stability and performance improvements ahead of the v2.0 release.",
    items: [
      { tag: "fix" as TagType,         text: "Fixed webhook delivery failures under high load" },
      { tag: "fix" as TagType,         text: "Resolved race condition in real-time issue updates" },
      { tag: "improvement" as TagType, text: "Board view now virtualises rows - handles 10,000+ items without lag" },
      { tag: "improvement" as TagType, text: "Reduced memory usage in background sync worker by 40%" },
    ],
  },
];

export function ChangelogPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-white/[0.012] rounded-full blur-[120px]" />
          <div className="bg-grid absolute inset-0" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="badge-dark mb-6 inline-flex">Changelog</div>
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-white leading-[1.05] mb-5">
            What's new in
            <br />
            <span className="gradient-text">Taskforce</span>
          </h1>
          <p className="text-xl text-white/40 leading-relaxed mb-8">
            Every feature we ship, every bug we fix, every improvement we make. Updated on every release.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <a
              href="https://github.com/taskforce-project"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white/50 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              <Package className="h-3.5 w-3.5" /> GitHub Releases
            </a>
            <a
              href="http://localhost:3000/auth/register"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white/50 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              <Zap className="h-3.5 w-3.5" /> Try latest version
            </a>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-16 pb-32 bg-[#050505]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="relative">
            <div className="absolute left-[19px] top-2 bottom-0 w-px bg-white/[0.05]" />
            <div className="space-y-14">
              {releases.map((release) => {
                const tagCfg = tagConfig[release.tag];
                return (
                  <div key={release.version} className="relative pl-12">
                    <div
                      className="absolute left-[11px] top-1.5 w-4 h-4 rounded-full border-2 bg-[#050505]"
                      style={{ borderColor: tagCfg.dot }}
                    />
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <span className="text-white/25 text-xs">{release.date}</span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ color: tagCfg.color, background: tagCfg.bg }}
                      >
                        {release.version}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">{release.title}</h2>
                    <p className="text-white/40 text-sm leading-relaxed mb-5">{release.summary}</p>
                    <div className="space-y-2">
                      {release.items.map((item, i) => {
                        const cfg = tagConfig[item.tag];
                        return (
                          <div key={i} className="flex items-start gap-3">
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 shrink-0"
                              style={{ color: cfg.color, background: cfg.bg }}
                            >
                              {cfg.label}
                            </span>
                            <span className="text-white/50 text-sm leading-relaxed">{item.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-16 text-center pt-12 border-t border-white/[0.05]">
            <p className="text-white/25 text-sm mb-4">See the full history on GitHub</p>
            <a
              href="https://github.com/taskforce-project/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white/50 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              View all releases <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-20 bg-black border-t border-white/[0.05]">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-black text-white mb-3">Subscribe to release notes</h2>
          <p className="text-white/35 mb-7 text-sm">Get notified when we ship something new. No spam, just the release notes.</p>
          <div className="flex gap-2 max-w-md mx-auto">
            <input
              type="email"
              placeholder="you@company.com"
              className="flex-1 px-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white/80 placeholder-white/20 text-sm focus:outline-none focus:border-white/20 transition-colors"
            />
            <button className="px-5 py-2.5 text-sm font-semibold text-black bg-white rounded-xl hover:bg-white/90 transition-colors shrink-0 flex items-center gap-1.5">
              Subscribe <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ChangelogPage;
