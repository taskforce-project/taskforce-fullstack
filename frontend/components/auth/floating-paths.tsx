"use client";

import { motion } from "framer-motion";

interface FloatingPathsProps {
  readonly position?: number;
}

export function FloatingPaths({ position = 1 }: FloatingPathsProps) {
  const paths = Array.from({ length: 36 }, (_, i) => {
    // Interpolate color: purple (#7000ff) → pink (#f13dd4) → red (#f83a3a)
    const t = i / 35;
    let r: number, g: number, b: number;
    if (t < 0.5) {
      const u = t / 0.5;
      r = Math.round(112 + (241 - 112) * u);
      g = Math.round(0 + (61 - 0) * u);
      b = Math.round(255 + (212 - 255) * u);
    } else {
      const u = (t - 0.5) / 0.5;
      r = Math.round(241 + (248 - 241) * u);
      g = Math.round(61 + (58 - 61) * u);
      b = Math.round(212 + (58 - 212) * u);
    }
    const opacity = 0.06 + i * 0.022;

    return {
      id: i,
      d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
      color: `rgba(${r}, ${g}, ${b}, ${opacity})`,
      width: 0.5 + i * 0.03,
      duration: 18 + (i % 12),
    };
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        className="h-full w-full"
        viewBox="0 0 696 316"
        fill="none"
        aria-hidden="true"
      >
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke={path.color}
            strokeWidth={path.width}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.8, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: path.duration,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  );
}
