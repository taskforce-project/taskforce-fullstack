import { ArrowRight, KeyRound, Layers3, ShieldCheck, Zap } from "lucide-react";
import { StripedPattern } from "@/components/magicui/striped-pattern";

const trustTiles = [
  { id: "identity", label: "Identity", value: "SSO / SAML", icon: KeyRound },
  { id: "resilience", label: "Resilience", value: "Backups", icon: Zap },
  { id: "deployments", label: "Deployments", value: "Cloud + Self-hosted", icon: Layers3 },
  { id: "control", label: "Control", value: "Every layer", icon: ShieldCheck },
] as const;

const controlCards = [
  {
    id: "identity",
    icon: KeyRound,
    title: "Identity and access at every layer",
    description: "SSO, SAML, and LDAP across every workspace. Authenticate your way.",
    cta: "Go to /enterprise",
    href: "/enterprise",
  },
  {
    id: "uptime",
    icon: Zap,
    title: "Fully committed uptime SLA",
    description: "Automatic backups, real-time scaling, and multi-layer failovers. Built to stay up when it matters most.",
    cta: "Go to status",
    href: "/status",
  },
  {
    id: "control",
    icon: ShieldCheck,
    title: "Control across cloud and self-hosted",
    description: "The same permission model, audit surface, and operational controls whether you deploy with us or on your own infrastructure.",
    cta: "Talk to sales",
    href: "/contact",
  },
] as const;

export function Enterprise() {
  return (
    <section className="border-b border-zinc-200 bg-white py-24 text-zinc-950">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_1.2fr] lg:items-start">
          <div className="max-w-2xl">
            <h2 className="text-5xl font-black tracking-tight text-zinc-950 sm:text-6xl lg:text-7xl">
              Enterprise-grade security,
              <br />
              compliance, and control
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-700">
              Plane meets the security and compliance standards your InfoSec team requires, across cloud and self-hosted deployments.
            </p>
          </div>

          <div className="grid grid-cols-2 border border-zinc-200 sm:grid-cols-4">
            {trustTiles.map((tile, index) => {
              const Icon = tile.icon;

              return (
                <article
                  key={tile.id}
                  className={`flex min-h-35 flex-col items-center justify-center px-4 py-6 text-center ${index < 2 ? "border-b border-zinc-200 sm:border-b-0" : ""} ${index % 2 === 0 ? "border-r border-zinc-200" : ""} sm:border-b-0 sm:border-r ${index === trustTiles.length - 1 ? "sm:border-r-0" : ""}`}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-zinc-900 text-zinc-900">
                    <Icon className="h-7 w-7" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-zinc-950">{tile.value}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">{tile.label}</p>
                </article>
              );
            })}
          </div>
        </div>

        <div className="relative mt-14 overflow-hidden border border-zinc-200 bg-white">
          <div className="relative h-12 border-b border-zinc-200 bg-white overflow-hidden">
            <StripedPattern className="text-zinc-200/90" width={16} height={16} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3">
            {controlCards.map((card, index) => {
              const Icon = card.icon;

              return (
                <article
                  key={card.id}
                  className={`min-h-76 bg-white p-6 sm:p-8 ${index < controlCards.length - 1 ? "border-b border-zinc-200 md:border-r md:border-b-0" : ""}`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-950">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-16 max-w-xs text-3xl font-semibold tracking-tight text-zinc-950">
                    {card.title}
                  </h3>
                  <p className="mt-6 max-w-sm text-base leading-relaxed text-zinc-600">
                    {card.description}
                  </p>
                  <a href={card.href} className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-950">
                    {card.cta} <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
