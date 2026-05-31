/**
 * Revolution Hero - Static shader-like background
 * (Frozen WebGL plasma effect implemented with CSS gradients)
 */
import { ArrowRight, Star } from "lucide-react";

interface RevolutionHeroProps {
  badge?: string;
  headline?: React.ReactNode;
  subline?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  stat?: string;
  statLabel?: string;
}

export function RevolutionHero({
  badge = "Now in public beta",
  headline = (
    <>
      The project management tool
      <br />
      <span className="gradient-text">your team will love</span>
    </>
  ),
  subline = "Tasks, docs, cycles, and AI - all in one workspace. Self-hostable, open source, and built for teams that ship.",
  primaryLabel = "Start for free",
  primaryHref = "http://localhost:3000/auth/register",
  secondaryLabel = "View on GitHub",
  secondaryHref = "https://github.com/taskforce-project",
  stat = "50,000+",
  statLabel = "teams worldwide",
}: RevolutionHeroProps) {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black">
      {/* Shader-like static background */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Base radial gradient - plasma centre */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(96,165,250,0.08),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_20%_60%,rgba(192,132,252,0.06),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_35%_at_80%_70%,rgba(251,146,60,0.04),transparent)]" />

        {/* Voronoi-like dots */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />

        {/* Grid overlay */}
        <div className="bg-grid absolute inset-0 opacity-60" />

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-32 pb-24 text-center">
        {/* Badge */}
        <div className="badge-dark mb-8 inline-flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          {badge}
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-white leading-[1.05] mb-6">
          {headline}
        </h1>

        {/* Subline */}
        <p className="text-xl text-white/40 max-w-2xl mx-auto leading-relaxed mb-10">
          {subline}
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap justify-center gap-3 mb-14">
          <a
            href={primaryHref}
            className="group inline-flex items-center gap-2 px-7 py-3.5 text-sm font-semibold text-black bg-white rounded-lg hover:bg-white/90 transition-colors"
          >
            {primaryLabel}
            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
          </a>
          <a
            href={secondaryHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-7 py-3.5 text-sm font-medium text-white/60 border border-white/10 rounded-lg hover:bg-white/[0.04] hover:text-white transition-colors"
          >
            <Star className="h-3.5 w-3.5" />
            {secondaryLabel}
          </a>
        </div>

        {/* Social proof stat */}
        <div className="flex items-center justify-center gap-2 text-white/25 text-sm">
          <div className="flex -space-x-1.5">
            {["#60a5fa", "#c084fc", "#fb923c", "#4ade80", "#f472b6"].map((color, i) => (
              <div
                key={i}
                className="w-6 h-6 rounded-full border border-black"
                style={{ background: `${color}40` }}
              />
            ))}
          </div>
          <span>
            <strong className="text-white/50 font-semibold">{stat}</strong> {statLabel}
          </span>
        </div>
      </div>
    </section>
  );
}

export default RevolutionHero;
