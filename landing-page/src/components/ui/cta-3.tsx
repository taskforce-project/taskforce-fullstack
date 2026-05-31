import { ArrowRight, Plus } from "lucide-react";

interface CtaProps {
  headline?: string;
  subline?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

function PlusCorner({ className }: { className: string }) {
  return <Plus className={`absolute z-10 h-5 w-5 text-white/20 ${className}`} strokeWidth={1} />;
}

export function CallToAction({
  headline = "Your team, at its best.",
  subline = "Start free - no credit card required.",
  primaryLabel = "Get started free",
  primaryHref = "http://localhost:3000/auth/register",
  secondaryLabel = "Talk to sales",
  secondaryHref = "/contact",
}: CtaProps) {
  return (
    <div className="py-24 bg-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Container with dashed border and corner plusses */}
        <div className="relative flex flex-col items-center gap-6 border border-dashed border-white/[0.12] rounded-2xl px-8 py-16 text-center bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.04),transparent_70%)]">
          <PlusCorner className="-top-2.5 -left-2.5" />
          <PlusCorner className="-top-2.5 -right-2.5" />
          <PlusCorner className="-bottom-2.5 -left-2.5" />
          <PlusCorner className="-bottom-2.5 -right-2.5" />

          <div className="badge-dark">Get started today</div>

          <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-[1.05]">
            {headline.includes(",") ? (
              <>
                {headline.split(",")[0]},
                <br />
                <span className="gradient-text">{headline.split(",")[1].trim()}</span>
              </>
            ) : (
              <span className="gradient-text">{headline}</span>
            )}
          </h2>

          <p className="text-white/40 text-lg max-w-md">{subline}</p>

          <div className="flex flex-wrap justify-center gap-3 mt-2">
            <a
              href={primaryHref}
              className="group inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-black bg-white rounded-lg hover:bg-white/90 transition-colors"
            >
              {primaryLabel}
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href={secondaryHref}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white/60 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              {secondaryLabel}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CallToAction;
