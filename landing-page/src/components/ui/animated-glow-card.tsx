import React from "react";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  variant?: "blue" | "purple" | "warm" | "white";
}

const glowColors = {
  blue:   "rgba(96,165,250,0.3)",
  purple: "rgba(192,132,252,0.3)",
  warm:   "rgba(251,146,60,0.3)",
  white:  "rgba(255,255,255,0.15)",
};

export function GlowCard({ children, className = "", variant = "white", glowColor }: GlowCardProps) {
  const color = glowColor ?? glowColors[variant];

  return (
    <div
      className={`glow-card-wrapper relative rounded-2xl ${className}`}
      style={{ "--glow-color": color } as React.CSSProperties}
    >
      {/* Animated border */}
      <div className="glow-card-border absolute inset-0 rounded-2xl" />
      {/* Content */}
      <div className="glow-card-inner relative z-10 rounded-2xl bg-[#0a0a0a] border border-white/[0.06]">
        {children}
      </div>
    </div>
  );
}

// Simpler card with static glow on hover
export function GlowCardSimple({
  children,
  className = "",
  variant = "white",
}: GlowCardProps) {
  const color = glowColors[variant];

  return (
    <div
      className={`group relative rounded-2xl transition-all duration-300 ${className}`}
    >
      {/* Glow layer */}
      <div
        className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm"
        style={{ background: `radial-gradient(circle at 50% 0%, ${color}, transparent 70%)` }}
      />
      {/* Card */}
      <div className="relative rounded-2xl bg-[#0a0a0a] border border-white/[0.07] group-hover:border-white/[0.14] transition-all duration-300">
        {children}
      </div>
    </div>
  );
}

export default GlowCard;
