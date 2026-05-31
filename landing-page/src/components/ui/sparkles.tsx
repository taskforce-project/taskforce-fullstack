"use client";
import { useId } from "react";
import { Particles, ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions, Engine } from "@tsparticles/engine";
import { cn } from "@/lib/utils";

interface SparklesProps {
  className?: string;
  color?: string;
  density?: number;
  speed?: number;
  minSize?: number;
  maxSize?: number;
  opacity?: number;
}

function SparklesInner({
  className,
  color = "#ffffff",
  density = 80,
  speed = 0.5,
  minSize = 0.6,
  maxSize = 1.4,
  opacity = 0.5,
}: SparklesProps) {
  const id = useId();

  const options: ISourceOptions = {
    background: { color: { value: "transparent" } },
    fullScreen: { enable: false },
    fpsLimit: 60,
    particles: {
      color: { value: color },
      links: { enable: false },
      move: {
        enable: true,
        direction: "none",
        outModes: { default: "out" },
        random: true,
        speed,
        straight: false,
      },
      number: { density: { enable: true, width: 800 }, value: density },
      opacity: {
        value: { min: 0.1, max: opacity },
        animation: { enable: true, speed: 0.5, sync: false },
      },
      shape: { type: "circle" },
      size: {
        value: { min: minSize, max: maxSize },
      },
    },
    detectRetina: true,
  };

  return (
    <Particles
      id={id}
      className={cn("absolute inset-0", className)}
      options={options}
    />
  );
}

async function loadEngine(engine: Engine) {
  await loadSlim(engine);
}

export function Sparkles(props: SparklesProps) {
  return (
    <ParticlesProvider init={loadEngine}>
      <SparklesInner {...props} />
    </ParticlesProvider>
  );
}

export default Sparkles;
