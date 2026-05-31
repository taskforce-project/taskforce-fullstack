"use client";
import { X } from "lucide-react";
import { useState } from "react";

type BannerVariant = "default" | "success" | "warning" | "info" | "premium" | "gradient";

interface BannerProps {
  children: React.ReactNode;
  variant?: BannerVariant;
  show?: boolean;
  onHide?: () => void;
  dismissible?: boolean;
  storageKey?: string;
}

const variantStyles: Record<BannerVariant, string> = {
  default:  "bg-white/[0.04] border-b border-white/[0.08] text-white/60",
  success:  "bg-green-500/[0.08] border-b border-green-500/20 text-green-400",
  warning:  "bg-amber-500/[0.08] border-b border-amber-500/20 text-amber-400",
  info:     "bg-blue-500/[0.08] border-b border-blue-500/20 text-blue-400",
  premium:  "bg-purple-500/[0.08] border-b border-purple-500/20 text-purple-400",
  gradient: "border-b border-white/[0.06] text-white/70",
};

export function Banner({
  children,
  variant = "default",
  show = true,
  onHide,
  dismissible = true,
  storageKey,
}: BannerProps) {
  const [visible, setVisible] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      return localStorage.getItem(storageKey) !== "hidden";
    }
    return show;
  });

  if (!visible) return null;

  const handleHide = () => {
    setVisible(false);
    if (storageKey && typeof window !== "undefined") {
      localStorage.setItem(storageKey, "hidden");
    }
    onHide?.();
  };

  return (
    <div
      className={`relative z-50 flex items-center justify-center gap-3 px-4 py-2.5 text-xs font-medium text-center ${variantStyles[variant]} ${
        variant === "gradient"
          ? "bg-gradient-to-r from-blue-500/[0.06] via-purple-500/[0.06] to-orange-500/[0.06]"
          : ""
      }`}
    >
      {children}
      {dismissible && (
        <button
          onClick={handleHide}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-white/[0.06] transition-colors text-white/30 hover:text-white/60"
          aria-label="Dismiss banner"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default Banner;
