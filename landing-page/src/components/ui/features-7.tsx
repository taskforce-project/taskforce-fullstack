import { CheckCircle2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Feature {
  icon?: React.ReactNode;
  title: string;
  description: string;
  accent?: "blue" | "purple" | "warm";
}

interface Features7Props {
  badge?: string;
  headline?: React.ReactNode;
  subline?: string;
  features: Feature[];
  mockupSrc?: string;
  mockupAlt?: string;
  mockupChildren?: React.ReactNode;
  cta?: { label: string; href: string };
  reverse?: boolean;
  className?: string;
}

const accentMap = {
  blue:   "#60a5fa",
  purple: "#c084fc",
  warm:   "#fb923c",
};

export function Features7({
  badge,
  headline,
  subline,
  features,
  mockupSrc,
  mockupAlt = "Feature preview",
  mockupChildren,
  cta,
  reverse = false,
  className,
}: Features7Props) {
  return (
    <section className={cn("py-24 bg-black", className)}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={cn("grid lg:grid-cols-2 gap-16 items-center", reverse && "lg:flex-row-reverse")}>
          {/* Text side */}
          <div className={cn(reverse && "lg:order-2")}>
            {badge && <div className="badge-dark mb-5 inline-flex">{badge}</div>}
            {headline && (
              <h2 className="text-4xl font-black text-white tracking-tight mb-5 leading-tight">{headline}</h2>
            )}
            {subline && (
              <p className="text-white/40 text-lg leading-relaxed mb-8">{subline}</p>
            )}

            <div className="space-y-4 mb-8">
              {features.map((f, i) => {
                const color = accentMap[f.accent ?? "blue"];
                return (
                  <div key={i} className="flex items-start gap-3">
                    {f.icon ? (
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: `${color}12`, border: `1px solid ${color}20`, color }}
                      >
                        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{f.icon}</span>
                      </div>
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mt-1 shrink-0" style={{ color }} />
                    )}
                    <div>
                      <p className="text-white/70 font-semibold text-sm mb-0.5">{f.title}</p>
                      <p className="text-white/40 text-xs leading-relaxed">{f.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {cta && (
              <a
                href={cta.href}
                className="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white/60 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
              >
                {cta.label}
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </a>
            )}
          </div>

          {/* Mockup side */}
          <div className={cn("relative", reverse && "lg:order-1")}>
            {/* Tilted card mockup */}
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 blur-2xl -z-10 scale-110" />
              <div
                className="rounded-2xl border border-white/[0.08] bg-[#0a0a0a] overflow-hidden shadow-2xl"
                style={{ transform: "perspective(1000px) rotateY(-4deg) rotateX(2deg)" }}
              >
                {mockupChildren ? (
                  <div className="p-6">{mockupChildren}</div>
                ) : mockupSrc ? (
                  <img src={mockupSrc} alt={mockupAlt} className="w-full h-auto" />
                ) : (
                  <div className="h-80 flex items-center justify-center text-white/10 text-sm">
                    Preview
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Features7;
