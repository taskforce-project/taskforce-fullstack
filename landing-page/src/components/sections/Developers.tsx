import { ArrowRight, Bot, ExternalLink, Webhook } from "lucide-react";

const terminalLayers = [
  "% tf compose deploy --workspace acme",
  "Analyzing project configuration...",
  "Change set ready to apply schema",
  "↳ 4 states [Backlog, In Progress, Review, Done]",
  "↳ 5 labels [bug, feature, urgent, infra, api]",
  "↳ 3 custom fields [priority, team, estimate]",
  "Applying changes to Taskforce workspace...",
  "√ Pushed 4 states",
  "√ Pushed 5 labels",
  "√ Pushed 3 custom fields",
  "Schema synced successfully",
  "%",
] as const;

const devCards = [
  {
    id: "api",
    icon: Webhook,
    title: "APIs, Webhooks, and SDKs",
    description:
      "REST API with OAuth 2.0, HMAC-signed webhooks, and typed SDKs in Node.js and Python. Build custom integrations, dashboards, and automations.",
    href: "/docs",
  },
  {
    id: "mcp",
    icon: Bot,
    title: "MCP Server",
    description:
      "Native MCP server, an agent framework with @mention support, and full Agent Run lifecycle tracking. Let AI manage work inside Taskforce, not just read it.",
    href: "/docs",
  },
] as const;

function getTerminalLineClass(index: number) {
  if (index === terminalLayers.length - 1) {
    return "text-white/72";
  }

  if (index >= 3) {
    return "text-emerald-400/90";
  }

  if (index === 2) {
    return "text-white/58";
  }

  return "text-white/66";
}

function TerminalCard({ muted = false }: Readonly<{ muted?: boolean }>) {
  return (
    <div className={`w-full rounded-[30px] border px-6 py-5 ${muted ? "border-white/10 bg-[#121315] shadow-[0_20px_44px_rgba(0,0,0,0.34)]" : "border-white/8 bg-[#111214] shadow-[0_28px_52px_rgba(0,0,0,0.46)]"}`}>
      <div className="flex items-center gap-2 text-[10px] text-white/45">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-4 rounded-full bg-white/6 px-3 py-1 text-[9px] font-semibold tracking-[0.16em] text-white/40">
          ~/projects/acme
        </span>
      </div>

      <div className="mt-5 space-y-1 font-mono text-[11px] leading-[1.35] text-white/86">
        {terminalLayers.map((line, index) => (
          <p key={line} className={muted ? "text-white/12" : getTerminalLineClass(index)}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

export function Developers() {
  return (
    <section className="overflow-hidden border-b border-white/10 bg-[#121212] py-24 text-white">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            Every setting versioned, reviewed, and
            <br />
            deployed from your terminal.
          </h2>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="http://localhost:3000/auth/register"
              className="inline-flex items-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
            >
              Get started free
            </a>
            <a
              href="/contact"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/8 px-5 py-2.5 text-sm font-semibold text-white/92 transition-colors hover:bg-white/14"
            >
              Talk to a human <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-white/8 bg-[#1b1c1e] shadow-[0_26px_80px_rgba(0,0,0,0.4)]">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="relative min-h-102.5 overflow-hidden bg-linear-to-br from-[#1b1c1e] via-[#1a1b1d] to-[#18191b]">
              <div className="absolute inset-0 bg-linear-to-r from-black/16 via-transparent to-transparent" />
              {[0, 1, 2].map((layer) => (
                <div
                  key={layer}
                  className="absolute left-16 top-12 w-96 max-w-[76%] transform-[rotate(-15deg)]"
                  style={{
                    zIndex: layer + 1,
                    transform: `translateX(${34 + layer * 18}px) translateY(${24 + layer * 16}px) rotate(-15deg)`,
                    opacity: Math.max(0.18, 0.34 - layer * 0.05),
                  }}
                >
                  <TerminalCard muted />
                </div>
              ))}

              <div className="absolute left-16 top-12 z-10 w-96 max-w-[76%] transform-[rotate(-15deg)]">
                <TerminalCard />
              </div>
            </div>

            <div className="px-8 py-10 lg:px-12">
              <h3 className="max-w-md text-4xl font-semibold tracking-tight text-white">
                Taskforce Compose for Projects-as-Code
              </h3>
              <p className="mt-5 max-w-md text-base leading-relaxed text-white/68">
                Define projects in YAML, version in Git, deploy from your terminal. Start treating project configuration as the infrastructure it is.
              </p>
              <a href="/docs" className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                Learn more <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {devCards.map((card) => {
            const Icon = card.icon;

            return (
              <a
                key={card.id}
                href={card.href}
                className="group relative overflow-hidden rounded-2xl border border-white/8 bg-[#1b1c1e] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition-colors hover:bg-[#1f2023]"
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_92%_18%,rgba(148,163,184,0.12),transparent_18%)]" aria-hidden />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/85">
                      <Icon className="h-5 w-5" />
                    </div>
                    <ExternalLink className="h-4 w-4 text-white/40 transition-colors group-hover:text-white/70" />
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold tracking-tight text-white">{card.title}</h3>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-white/65">{card.description}</p>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
