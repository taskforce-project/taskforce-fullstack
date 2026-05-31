// Pure CSS mockup section - no framer-motion dependency
import { cn } from "@/lib/utils";

interface SectionWithMockupProps {
  badge?: string;
  headline?: React.ReactNode;
  subline?: string;
  description?: string;
  primaryMockup?: React.ReactNode;
  secondaryMockup?: React.ReactNode;
  className?: string;
}

export function SectionWithMockup({
  badge,
  headline,
  subline,
  description,
  primaryMockup,
  secondaryMockup,
  className,
}: SectionWithMockupProps) {
  return (
    <section className={cn("py-24 bg-[#050505] overflow-hidden", className)}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        {(badge || headline || subline) && (
          <div className="text-center mb-16">
            {badge && <div className="badge-dark mb-5 inline-flex">{badge}</div>}
            {headline && (
              <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-4">{headline}</h2>
            )}
            {subline && (
              <p className="text-white/40 text-lg max-w-xl mx-auto">{subline}</p>
            )}
          </div>
        )}

        {/* Dual mockup layout */}
        <div className="relative grid md:grid-cols-2 gap-6 items-start">
          {/* Primary mockup */}
          <div>
            <div className="rounded-2xl border border-white/[0.07] bg-[#0a0a0a] overflow-hidden shadow-2xl">
              {primaryMockup ?? (
                <div className="h-72 flex items-center justify-center text-white/10 text-sm">
                  Primary mockup
                </div>
              )}
            </div>
          </div>

          {/* Secondary mockup - offset down */}
          <div className="md:mt-12">
            <div className="rounded-2xl border border-white/[0.07] bg-[#0a0a0a] overflow-hidden shadow-2xl">
              {secondaryMockup ?? (
                <div className="h-72 flex items-center justify-center text-white/10 text-sm">
                  Secondary mockup
                </div>
              )}
            </div>
          </div>
        </div>

        {description && (
          <p className="text-center text-white/30 text-sm mt-10 max-w-lg mx-auto">{description}</p>
        )}
      </div>
    </section>
  );
}

export default SectionWithMockup;
