"use client";
import * as Tabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export interface Feature108Tab {
  value: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  preview: React.ReactNode;
  accent?: "blue" | "purple" | "warm";
}

interface Feature108Props {
  badge?: string;
  headline?: React.ReactNode;
  subline?: string;
  tabs: Feature108Tab[];
  defaultValue?: string;
}

const accentMap = {
  blue:   { color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  active: "border-blue-500/30 bg-blue-500/[0.06]" },
  purple: { color: "#c084fc", bg: "rgba(192,132,252,0.08)", active: "border-purple-500/30 bg-purple-500/[0.06]" },
  warm:   { color: "#fb923c", bg: "rgba(251,146,60,0.08)",  active: "border-orange-500/30 bg-orange-500/[0.06]" },
};

export function Feature108({ badge, headline, subline, tabs, defaultValue }: Feature108Props) {
  return (
    <div className="py-24 bg-[#050505]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        {(badge || headline || subline) && (
          <div className="text-center mb-14">
            {badge && <div className="badge-dark mb-5 inline-flex">{badge}</div>}
            {headline && (
              <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-4">{headline}</h2>
            )}
            {subline && (
              <p className="text-white/40 text-lg max-w-xl mx-auto">{subline}</p>
            )}
          </div>
        )}

        <Tabs.Root defaultValue={defaultValue ?? tabs[0]?.value} className="flex flex-col gap-8">
          {/* Tab list */}
          <Tabs.List className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {tabs.map((tab) => {
              const acc = accentMap[tab.accent ?? "blue"];
              return (
                <Tabs.Trigger
                  key={tab.value}
                  value={tab.value}
                  className={cn(
                    "group relative rounded-xl border border-white/[0.07] bg-[#0a0a0a] p-4 text-left transition-all duration-200 cursor-pointer",
                    "data-[state=active]:border-white/[0.14]",
                    `data-[state=active]:${acc.active}`,
                  )}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                    style={{ background: acc.bg, border: `1px solid ${acc.color}22` }}
                  >
                    <span style={{ color: acc.color }} className="[&>svg]:h-4 [&>svg]:w-4">
                      {tab.icon}
                    </span>
                  </div>
                  <p className="text-white/70 font-semibold text-sm mb-1">{tab.label}</p>
                  <p className="text-white/30 text-xs leading-relaxed hidden sm:block">{tab.description}</p>
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>

          {/* Tab content */}
          {tabs.map((tab) => (
            <Tabs.Content
              key={tab.value}
              value={tab.value}
              className="rounded-2xl border border-white/[0.07] bg-[#0a0a0a] overflow-hidden min-h-[400px] focus:outline-none"
            >
              {tab.preview}
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </div>
    </div>
  );
}

export default Feature108;
