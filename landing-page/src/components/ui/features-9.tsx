"use client";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import createGlobe from "cobe";
import { useEffect, useRef, useState } from "react";

const demoChartData = [
  { month: "Jan", issues: 32, closed: 28 },
  { month: "Feb", issues: 48, closed: 41 },
  { month: "Mar", issues: 55, closed: 50 },
  { month: "Apr", issues: 42, closed: 38 },
  { month: "May", issues: 70, closed: 62 },
  { month: "Jun", issues: 85, closed: 78 },
  { month: "Jul", issues: 94, closed: 89 },
];

const MARKERS = [
  { location: [37.7595, -122.4367] as [number, number], size: 0.05 }, // San Francisco
  { location: [40.7128, -74.006] as [number, number], size: 0.07 },   // New York
  { location: [51.5074, -0.1278] as [number, number], size: 0.06 },   // London
  { location: [48.8566, 2.3522] as [number, number], size: 0.05 },    // Paris
  { location: [35.6762, 139.6503] as [number, number], size: 0.06 },  // Tokyo
  { location: [-33.8688, 151.2093] as [number, number], size: 0.04 }, // Sydney
  { location: [1.3521, 103.8198] as [number, number], size: 0.04 },   // Singapore
  { location: [-23.5505, -46.6333] as [number, number], size: 0.04 }, // São Paulo
  { location: [52.52, 13.405] as [number, number], size: 0.04 },      // Berlin
  { location: [19.076, 72.8777] as [number, number], size: 0.04 },    // Mumbai
];

function CobeGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0.5);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !canvasRef.current) return;
    const size = canvasRef.current.offsetWidth * (window.devicePixelRatio || 1);
    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: window.devicePixelRatio || 1,
      width: size,
      height: size,
      phi: 0.5,
      theta: 0.25,
      dark: 1,
      diffuse: 1.4,
      mapSamples: 20000,
      mapBrightness: 5,
      baseColor: [0.15, 0.15, 0.18],
      markerColor: [0.47, 0.85, 0.99],
      glowColor: [0.2, 0.4, 0.7],
      markers: MARKERS,
      onRender(state) {
        phiRef.current += 0.003;
        state.phi = phiRef.current;
      },
    });
    return () => globe.destroy();
  }, [mounted]);

  if (!mounted) return <div className="w-full aspect-square" />;

  return (
    <div className="relative w-full flex justify-center items-center" style={{ height: 220 }}>
      <canvas
        ref={canvasRef}
        style={{ width: 220, height: 220 }}
        className="opacity-90"
      />
      {/* city ping dots overlay */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[28%] left-[20%] w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_2px_rgba(56,189,248,0.7)] animate-pulse" />
        <div className="absolute top-[22%] left-[46%] w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_6px_2px_rgba(167,139,250,0.7)] animate-pulse" style={{ animationDelay: "0.4s" }} />
        <div className="absolute top-[32%] left-[72%] w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.7)] animate-pulse" style={{ animationDelay: "0.8s" }} />
      </div>
    </div>
  );
}

interface Features9Props {
  badge?: string;
  headline?: React.ReactNode;
  subline?: string;
  stats?: { value: string; label: string }[];
  className?: string;
}

export function Features9({ badge, headline, subline, stats, className }: Readonly<Features9Props>) {
  const defaultStats = [
    { value: "50k+", label: "Teams worldwide" },
    { value: "80+",  label: "Countries" },
    { value: "99.9%", label: "Uptime SLA" },
    { value: "4.8/5", label: "Average rating" },
  ];

  const displayStats = stats ?? defaultStats;

  return (
    <section className={cn("py-24 bg-[#050505]", className)}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        {(badge || headline || subline) && (
          <div className="text-center mb-14">
            {badge && <div className="badge-dark mb-5 inline-flex">{badge}</div>}
            {headline && (
              <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-4">{headline}</h2>
            )}
            {subline && (
              <p className="text-white/40 text-lg max-w-xl mx-auto">{subline}</p>
            )}
          </div>
        )}

        {/* Two-column grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Map card */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0a0a0a] p-6 overflow-hidden">
            <h3 className="text-white/70 font-bold text-sm mb-1">Global Presence</h3>
            <p className="text-white/30 text-xs mb-4">Teams in 80+ countries using Taskforce every day</p>
            <CobeGlobe />
            <div className="grid grid-cols-2 gap-3 mt-4">
              {displayStats.slice(0, 2).map((s) => (
                <div key={s.label} className="rounded-xl border border-white/6 bg-white/2 p-3">
                  <p className="text-xl font-black text-white">{s.value}</p>
                  <p className="text-white/30 text-[10px] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Chart card */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0a0a0a] p-6 overflow-hidden">
            <h3 className="text-white/70 font-bold text-sm mb-1">Team Velocity</h3>
            <p className="text-white/30 text-xs mb-4">Issues opened vs closed - your team in action</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={demoChartData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="fg9-issues" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fg9-closed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                />
                <Area type="monotone" dataKey="issues" stroke="#60a5fa" strokeWidth={1.5} fill="url(#fg9-issues)" />
                <Area type="monotone" dataKey="closed" stroke="#4ade80" strokeWidth={1.5} fill="url(#fg9-closed)" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-3 mt-4">
              {displayStats.slice(2, 4).map((s) => (
                <div key={s.label} className="rounded-xl border border-white/6 bg-white/2 p-3">
                  <p className="text-xl font-black text-white">{s.value}</p>
                  <p className="text-white/30 text-[10px] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Features9;
