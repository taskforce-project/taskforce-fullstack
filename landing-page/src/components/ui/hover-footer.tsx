"use client";

import React, { useId, useRef, useState } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

export const TextHoverEffect = ({
  text,
  duration,
  className,
}: Readonly<{
  text: string;
  duration?: number;
  className?: string;
}>) => {
  const SVG_WIDTH = 1400;
  const SVG_HEIGHT = 220;
  const id = useId().replaceAll(":", "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState(false);
  const [maskPosition, setMaskPosition] = useState({ x: SVG_WIDTH / 2, y: SVG_HEIGHT / 2 });

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) {
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * SVG_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * SVG_HEIGHT;
    setMaskPosition({ x, y });
  };

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
      xmlns="http://www.w3.org/2000/svg"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={handleMouseMove}
      className={cn("cursor-pointer select-none uppercase", className)}
    >
      <defs>
        <linearGradient id={`textGradient-${id}`} gradientUnits="userSpaceOnUse" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>

        <mask id={`sweepMask-${id}`}>
          <rect x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} fill="black" />
          <motion.circle
            cx={maskPosition.x}
            cy={maskPosition.y}
            initial={{ r: 0 }}
            animate={{ r: hovered ? 112 : 0 }}
            transition={{ duration: duration ?? 0.2, ease: "easeOut" }}
            fill="white"
          />
        </mask>
      </defs>

      <motion.text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        initial={{ strokeWidth: 0.45 }}
        animate={{ strokeWidth: hovered ? 0.95 : 0.45 }}
        transition={{ duration: duration ?? 0.25, ease: "easeOut" }}
        fontSize="210"
        className="fill-transparent stroke-white/28 font-[helvetica] font-bold"
        style={{ opacity: 1 }}
      >
        {text}
      </motion.text>

      <motion.text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        stroke={`url(#textGradient-${id})`}
        initial={{ strokeWidth: 0.45 }}
        animate={{ strokeWidth: hovered ? 1.05 : 0.45 }}
        transition={{ duration: duration ?? 0.25, ease: "easeOut" }}
        mask={`url(#sweepMask-${id})`}
        fontSize="210"
        className="fill-transparent font-[helvetica] font-bold"
      >
        {text}
      </motion.text>
    </svg>
  );
};

export const FooterBackgroundGradient = () => {
  return (
    <div
      className="absolute inset-0 z-0"
      style={{
        background: "radial-gradient(125% 125% at 50% 10%, #0F0F1166 42%, #f59e0b22 64%, #ef444422 80%, #8b5cf622 100%)",
      }}
    />
  );
};
