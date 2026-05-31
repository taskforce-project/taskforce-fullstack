import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BentoItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  status?: string;
  tags?: string[];
  meta?: string;
  cta?: string;
  colSpan?: number;
  hasPersistentHover?: boolean;
  accent?: "blue" | "purple" | "warm" | "white" | "gold" | "teal";
  children?: React.ReactNode;
}

const accentMap = {
  blue:   { color: "#60a5fa", bg: "rgba(96,165,250,0.08)",   hover: "hover:border-blue-500/30" },
  purple: { color: "#c084fc", bg: "rgba(192,132,252,0.08)",  hover: "hover:border-purple-500/30" },
  warm:   { color: "#fb923c", bg: "rgba(251,146,60,0.08)",   hover: "hover:border-orange-500/30" },
  white:  { color: "#ffffff", bg: "rgba(255,255,255,0.04)",  hover: "hover:border-white/20" },
  gold:   { color: "#D4AF37", bg: "rgba(212,175,55,0.09)",   hover: "hover:border-yellow-600/30" },
  teal:   { color: "#006399", bg: "rgba(0,99,153,0.09)",     hover: "hover:border-cyan-700/30" },
};

interface BentoGridProps {
  items: BentoItem[];
  className?: string;
}

export function BentoGrid({ items, className }: Readonly<BentoGridProps>) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-4", className)}>
      {items.map((item) => {
        const acc = accentMap[item.accent ?? "white"];
        return (
          <div
            key={item.title}
            className={cn(
              "group relative rounded-2xl border border-border/50 bg-card dark:bg-[#0a0a0a] p-6 transition-all duration-300 overflow-hidden",
              acc.hover,
              item.hasPersistentHover ? "border-border dark:border-white/[0.14]" : "",
              item.colSpan === 2 ? "md:col-span-2" : "",
              item.colSpan === 3 ? "md:col-span-3" : "",
            )}
          >
            {/* Hover glow */}
            <div
              className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background: `radial-gradient(circle at 0% 0%, ${acc.bg}, transparent 60%)`,
              }}
            />

            <div className="relative z-10">
              {/* Icon */}
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 shrink-0"
                style={{ background: acc.bg, border: `1px solid ${acc.color}22` }}
              >
                <span style={{ color: acc.color }}>{item.icon}</span>
              </div>

              {/* Tags / status */}
              {(item.status || item.tags) && (
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  {item.status && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ color: acc.color, background: acc.bg }}
                    >
                      {item.status}
                    </span>
                  )}
                  {item.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-border/50 dark:border-white/[0.07] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <h3 className="text-foreground font-bold text-sm mb-2 leading-snug">{item.title}</h3>
              <p className="text-muted-foreground text-xs leading-relaxed mb-4">{item.description}</p>

              {item.children && <div className="mb-4">{item.children}</div>}

              {/* Footer */}
              <div className="flex items-center justify-between mt-auto">
                {item.meta && <span className="text-muted-foreground/40 text-[10px]">{item.meta}</span>}
                {item.cta && (
                  <span className="ml-auto text-xs text-muted-foreground/50 group-hover:text-foreground flex items-center gap-1 transition-colors">
                    {item.cta} <ArrowRight className="h-3 w-3" />
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BentoGrid;
