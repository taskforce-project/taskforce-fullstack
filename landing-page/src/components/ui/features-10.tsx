import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent?: "blue" | "purple" | "warm";
  cta?: { label: string; href: string };
  children?: React.ReactNode;
}

interface Features10Props {
  badge?: string;
  headline?: React.ReactNode;
  subline?: string;
  features: FeatureCard[];
  columns?: 2 | 3 | 4;
  className?: string;
}

const accentMap = {
  blue:   { color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  hover: "group-hover:border-blue-500/25" },
  purple: { color: "#c084fc", bg: "rgba(192,132,252,0.08)", hover: "group-hover:border-purple-500/25" },
  warm:   { color: "#fb923c", bg: "rgba(251,146,60,0.08)",  hover: "group-hover:border-orange-500/25" },
};

export function Features10({
  badge,
  headline,
  subline,
  features,
  columns = 3,
  className,
}: Features10Props) {
  const gridCols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-2 lg:grid-cols-3",
    4: "md:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <section className={cn("py-24 bg-black", className)}>
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

        <div className={cn("grid gap-4", gridCols[columns])}>
          {features.map((feature, i) => {
            const acc = accentMap[feature.accent ?? "blue"];
            return (
              <div
                key={i}
                className={cn(
                  "group rounded-2xl border border-white/[0.07] bg-[#0a0a0a] p-6 transition-all duration-300 hover:border-white/[0.14] flex flex-col",
                  acc.hover,
                )}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 shrink-0"
                  style={{ background: acc.bg, border: `1px solid ${acc.color}22`, color: acc.color }}
                >
                  <span className="[&>svg]:h-4 [&>svg]:w-4">{feature.icon}</span>
                </div>

                <h3 className="text-white/80 font-bold text-sm mb-2">{feature.title}</h3>
                <p className="text-white/40 text-xs leading-relaxed flex-1">{feature.description}</p>

                {feature.children && <div className="mt-4">{feature.children}</div>}

                {feature.cta && (
                  <a
                    href={feature.cta.href}
                    className="mt-5 inline-flex items-center gap-1 text-xs font-medium transition-colors"
                    style={{ color: acc.color }}
                  >
                    {feature.cta.label}
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Features10;
