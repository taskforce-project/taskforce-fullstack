const capabilityItems = [
  {
    title: "AI-powered planning",
    description:
      "Generate scoped plans from vague requests, split work into actionable steps, and keep priorities aligned with real delivery capacity.",
  },
  {
    title: "Workflow orchestration",
    description:
      "Build workflows that reflect how your teams actually collaborate across engineering, product, and operations without custom glue code.",
  },
  {
    title: "Native integrations",
    description:
      "Sync with Slack, GitHub, Figma, and your existing stack so updates, ownership, and status stay consistent everywhere.",
  },
  {
    title: "Governance at scale",
    description:
      "Keep control with permission models, audit trails, and consistent structures that work for both fast teams and enterprise environments.",
  },
] as const;

const dashboardRows = [
  { id: "RFC-101", issue: "Finalize issue timeline architecture", status: "In Progress", priority: "High", assignee: "Nina Oliver", labels: ["timeline", "frontend"] },
  { id: "RFC-102", issue: "Review gantt interaction states", status: "Todo", priority: "Medium", assignee: "No owner", labels: ["review"] },
  { id: "RFC-103", issue: "Sync issue filters with project views", status: "Review", priority: "High", assignee: "Kai Young", labels: ["views", "filters"] },
  { id: "RFC-104", issue: "Document drag and resize behavior", status: "Backlog", priority: "None", assignee: "No owner", labels: ["guidelines"] },
  { id: "RFC-105", issue: "Create empty and loading timeline states", status: "Todo", priority: "Medium", assignee: "No owner", labels: ["states"] },
  { id: "RFC-106", issue: "Add mock dependencies and handoff notes", status: "Done", priority: "Low", assignee: "Lena Moss", labels: ["handoff"] },
  { id: "RFC-107", issue: "Polish the quarter view density", status: "Review", priority: "Medium", assignee: "Ava Reed", labels: ["density"] },
  { id: "RFC-108", issue: "Prepare issue calendar follow-up screen", status: "Backlog", priority: "None", assignee: "No owner", labels: ["calendar"] },
  { id: "RFC-109", issue: "Backlog triage legacy export paths", status: "Backlog", priority: "None", assignee: "No owner", labels: [] },
  { id: "RFC-110", issue: "Spike workspace permission model", status: "Backlog", priority: "None", assignee: "No owner", labels: [] },
  { id: "RFC-111", issue: "Audit notification copy for renewal emails", status: "Backlog", priority: "None", assignee: "No owner", labels: [] },
  { id: "RFC-112", issue: "Define acceptance criteria for forecast drill-down", status: "Todo", priority: "None", assignee: "No owner", labels: [] },
] as const;

function statusPillClass(status: string) {
  if (status === "In Progress") return "bg-amber-100 text-amber-700";
  if (status === "Todo") return "bg-cyan-100 text-cyan-700";
  if (status === "Review") return "bg-fuchsia-100 text-fuchsia-700";
  if (status === "Done") return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}

function priorityTextClass(priority: string) {
  if (priority === "High") return "text-zinc-800";
  if (priority === "Medium") return "text-zinc-700";
  return "text-zinc-500";
}

export function CoreCapabilities() {
  return (
    <section className="bg-zinc-100 py-24 border-b border-border/40">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start lg:gap-14">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              Core capabilities that help teams move faster with less overhead
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-zinc-600">
              Plan, execute, and scale in one place. Taskforce connects your workflows, data, and decisions so every team can ship confidently.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
            <div className="grid grid-cols-[1.9fr_0.8fr_0.8fr_1fr_1fr] gap-0 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[10px] font-semibold text-zinc-500">
              <span>Issues</span>
              <span>Status</span>
              <span>Priority</span>
              <span>Assignee</span>
              <span>Labels</span>
            </div>

            <div className="max-h-107.5 overflow-hidden">
              {dashboardRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[1.9fr_0.8fr_0.8fr_1fr_1fr] items-center gap-0 border-b border-zinc-100 px-4 py-2 text-[10px] text-zinc-600"
                >
                  <div className="truncate pr-3">
                    <span className="mr-2 text-zinc-500">{row.id}</span>
                    <span className="text-zinc-700">{row.issue}</span>
                  </div>

                  <div>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ${statusPillClass(row.status)}`}>
                      {row.status}
                    </span>
                  </div>

                  <div className={`font-medium ${priorityTextClass(row.priority)}`}>{row.priority}</div>

                  <div className="truncate">
                    {row.assignee === "No owner" ? (
                      <span className="text-zinc-400">No owner</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[8px] font-semibold text-zinc-700">
                          {row.assignee[0]}
                        </span>
                        <span className="truncate">{row.assignee}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {row.labels.length > 0 ? (
                      row.labels.map((label) => (
                        <span key={label} className="inline-flex rounded-full border border-zinc-200 px-1.5 py-0.5 text-[9px] text-zinc-500">
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="text-zinc-400">None</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {capabilityItems.map((item) => (
            <article key={item.title}>
              <h3 className="text-3xl font-semibold tracking-tight text-zinc-950">{item.title}</h3>
              <p className="mt-4 text-lg leading-relaxed text-zinc-600">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
