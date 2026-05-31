import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

import { Component as EtheralShadow } from "@/components/ui/etheral-shadow";

type Category = "Workspace" | "AI Agents" | "Infrastructure";

type AppItem = {
  name: string;
  category: Category;
  description: string;
  logo: string;
};

const categories: Array<Category | "All"> = ["All", "Workspace", "AI Agents", "Infrastructure"];

const appItems: AppItem[] = [
  {
    name: "GitHub",
    category: "Workspace",
    description: "Sync pull requests, branches, and commit status directly in issues.",
    logo: "/logos/integrations/github.png",
  },
  {
    name: "Slack",
    category: "Workspace",
    description: "Create tasks from channel messages and keep thread context in sync.",
    logo: "/logos/integrations/slack.png",
  },
  {
    name: "Google",
    category: "Workspace",
    description: "Connect calendar, workspace identities, and shared productivity flows.",
    logo: "/logos/integrations/google.png",
  },
  {
    name: "Figma",
    category: "Workspace",
    description: "Link specs and design decisions directly to project execution.",
    logo: "/logos/integrations/figma.svg",
  },
  {
    name: "Claude",
    category: "AI Agents",
    description: "Route structured prompts and execution context into autonomous workflows.",
    logo: "/logos/integrations/claude.png",
  },
  {
    name: "Groq",
    category: "AI Agents",
    description: "Bring low-latency inference into agent actions and internal tooling.",
    logo: "/logos/integrations/groq.png",
  },
  {
    name: "VS Code",
    category: "AI Agents",
    description: "Push issues and engineering context closer to where code actually ships.",
    logo: "/logos/integrations/vscode.png",
  },
  {
    name: "Docker",
    category: "Infrastructure",
    description: "Deploy isolated services and support self-hosted workflows cleanly.",
    logo: "/logos/integrations/docker.png",
  },
  {
    name: "Keycloak",
    category: "Infrastructure",
    description: "Connect secure SSO and identity boundaries across workspaces.",
    logo: "/logos/integrations/keycloak.png",
  },
  {
    name: "Salesforce",
    category: "Infrastructure",
    description: "Bring customer-side signals and account workflows into project execution.",
    logo: "/logos/integrations/salesforce.png",
  },
  {
    name: "Spotify",
    category: "Workspace",
    description: "Reference team rituals and creative collaboration flows across squads.",
    logo: "/logos/integrations/spotify.png",
  },
];

function AppLogo({ item }: Readonly<{ item: AppItem }>) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm" aria-hidden>
      <img src={item.logo} alt="" className="h-6 w-6 object-contain" loading="lazy" />
    </div>
  );
}

export function Integrations() {
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");

  const visibleApps = useMemo(() => {
    if (activeCategory === "All") {
      return appItems;
    }
    return appItems.filter((item) => item.category === activeCategory);
  }, [activeCategory]);

  return (
    <section id="integrations" className="relative overflow-hidden bg-white py-24 text-zinc-950">
      <style>{`
        .integrations-scroll {
          height: 38.75rem;
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 #f8fafc;
          scrollbar-gutter: stable;
        }

        .integrations-scroll::-webkit-scrollbar {
          width: 10px;
        }

        .integrations-scroll::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 9999px;
        }

        .integrations-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #cbd5e1, #94a3b8);
          border-radius: 9999px;
          border: 2px solid #f8fafc;
        }

        .integrations-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(to bottom, #94a3b8, #64748b);
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(148,163,184,0.18),transparent_42%),radial-gradient(circle_at_84%_16%,rgba(226,232,240,0.8),transparent_40%)]" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            Extend Plane with apps, agents,
            <br />
            and your own integrations.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-zinc-600">
            Browse the ecosystem: GitHub, GitLab, Slack, Sentry, and more. Sync issues, track PRs, and import from Jira, Linear, Asana, ClickUp, or Monday.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {categories.map((category) => {
            const selected = category === activeCategory;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                  selected
                    ? "border-zinc-900 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>

        <div className="relative mt-6">
          <div className="integrations-scroll overflow-y-auto pr-3">
            <div className="grid grid-cols-1 gap-4 pb-18 md:grid-cols-2 xl:grid-cols-3">
              {visibleApps.map((app) => (
                <article key={app.name} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                  <div className="flex items-start gap-3">
                    <AppLogo item={app} />
                    <div>
                      <h3 className="text-base font-semibold tracking-tight">{app.name}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-600">{app.description}</p>
                    </div>
                  </div>
                  <a
                    href="/marketplace"
                    className="mt-4 inline-flex items-center rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-50"
                  >
                    Details
                  </a>
                </article>
              ))}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-white via-white/90 to-transparent" />
          <div className="pointer-events-none absolute inset-x-8 bottom-0 h-10 rounded-full bg-slate-200/55 blur-xl" />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Browse the marketplace</p>
            <p className="mt-3 text-base leading-relaxed text-zinc-600">
              Discover official and community apps. Connect dev tools, communication apps, and incident workflows in minutes.
            </p>
            <a href="/marketplace" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-950">
              Go to Marketplace <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Build your own</p>
            <p className="mt-3 text-base leading-relaxed text-zinc-600">
              Open API, webhooks, OAuth apps, and a native MCP server let you build custom integrations and AI agents inside Plane.
            </p>
            <a href="/docs" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-950">
              Read the docs <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </article>
        </div>

        <div className="relative mt-10 overflow-hidden rounded-xl border border-slate-300/80 bg-slate-100/95 p-6 text-slate-950 shadow-[0_18px_42px_rgba(71,85,105,0.22)]">
          <div className="pointer-events-none absolute inset-0 opacity-100" aria-hidden>
            <EtheralShadow
              color="rgba(59, 130, 246, 0.58)"
              animation={{ scale: 0, speed: 0 }}
              noise={{ opacity: 0.1, scale: 0.95 }}
            />
          </div>
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(59,130,246,0.28),transparent_38%),radial-gradient(circle_at_82%_16%,rgba(239,68,68,0.22),transparent_42%),radial-gradient(circle_at_52%_100%,rgba(124,58,237,0.2),transparent_46%)]"
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-slate-200/65 via-slate-100/25 to-white/55" aria-hidden />
          <div className="relative z-10 text-left">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900/72">Integration requests</p>
            <h3 className="mt-3 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
              Need a connector we don’t support yet?
            </h3>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-700">
              Send us the integration you want to see in Taskforce. Tell us your stack, your workflow, and what should sync. We’ll use requests to prioritize the next connectors.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-start gap-3">
              <a
                href="/contact"
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
              >
                Request an integration <ArrowRight className="h-3.5 w-3.5" />
              </a>
              <a
                href="/marketplace"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white/90 px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-white"
              >
                Browse existing integrations
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
