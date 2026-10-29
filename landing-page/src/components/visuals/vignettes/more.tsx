import { AnimatePresence, motion } from "motion/react";
import { Check, CornerDownLeft, FileText, Search, Sparkles, Webhook } from "lucide-react";

import { BrandMark } from "../brand";
import { EASE, MiniWindow, rise, useSequence } from "./parts";
import type { VProps } from "./plan";
import { cn } from "@/lib/utils";

/** Vignettes de la page Features : assistant, analytics, connexions, confort (560 × 400). Données d'exemple. */

/* ───────── L'assistant répond à partir du travail ───────── */

const ASK_STEPS = [500, 1300, 1200, 2600] as const;

export function AskArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(ASK_STEPS, playing, reduce);
  return (
    <MiniWindow title="Assistant" className="inset-x-8 top-6 bottom-6" bodyClassName="flex flex-col gap-3 p-5">
      <motion.div {...rise} className="ml-16 self-end bg-muted px-3.5 py-2.5 text-[12.5px] rounded-md">
        What is still blocking the 2.1 release?
      </motion.div>
      <div className="flex gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center bg-primary text-white">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1 border border-black/[0.06] bg-white px-3.5 py-3 rounded-lg">
          <AnimatePresence mode="popLayout">
            {step < 1 ? (
              <motion.div key="dots" className="flex gap-1 py-1" exit={{ opacity: 0 }}>
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="size-1.5 rounded-full bg-subtle" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }} />
                ))}
              </motion.div>
            ) : (
              <motion.div key="answer" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="text-[12.5px] leading-relaxed">
                  Two issues. <span className="font-mono text-[11px]">API-17</span> waits for a review, and{" "}
                  <span className="font-mono text-[11px]">WEB-42</span> is with Claude Code, in review by AI.
                </p>
                <AnimatePresence>
                  {step >= 2 && (
                    <motion.div {...rise} className="mt-3 flex flex-wrap gap-1.5">
                      {["API-17", "WEB-42", "Release checklist"].map((s, i) => (
                        <span key={s} className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 text-[10.5px]", i === 2 ? "bg-tint-green text-ink-green" : "bg-muted text-muted-foreground")}>
                          {i === 2 && <FileText className="size-3" />}
                          {s}
                        </span>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {step >= 3 && (
                    <motion.p {...rise} className="mt-3 text-[11px] text-subtle">
                      Based on your board and your notes
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 border border-input px-3 py-2 text-[11.5px] text-subtle rounded-lg">
        Ask about your projects
        <span className="ml-auto flex items-center gap-1 text-[9.5px] font-medium">
          <span className="size-1.5 rounded-full bg-shape-green" /> Local model
        </span>
      </div>
    </MiniWindow>
  );
}

/* ───────── Analytics : la courbe se dessine ───────── */

const CHART_STEPS = [300, 1800, 2800] as const;

export function ChartArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(CHART_STEPS, playing, reduce);
  const go = step >= 1;
  const resolved = [6, 9, 7, 11, 10, 14, 13, 17];
  const opened = [8, 8, 10, 9, 12, 11, 13, 12];
  const pts = (arr: number[]) => arr.map((v, i) => `${(i / (arr.length - 1)) * 440},${150 - (v / 18) * 140}`).join(" ");
  return (
    <MiniWindow title="Website · Analytics" className="inset-x-6 top-6 bottom-6" bodyClassName="p-5">
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Throughput</span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-primary" /> Resolved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-shape-pink" /> Opened
        </span>
        <span className="ml-auto text-[9.5px] font-medium">Last 8 weeks</span>
      </div>
      <svg viewBox="0 0 440 160" className="mt-4 h-[180px] w-full overflow-visible" aria-hidden="true">
        {[30, 70, 110, 150].map((y) => (
          <line key={y} x1="0" x2="440" y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
        ))}
        <motion.polygon
          points={`0,150 ${pts(resolved)} 440,150`}
          fill="var(--tint-blue)"
          initial={{ opacity: 0 }}
          animate={{ opacity: go ? 1 : 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        />
        <motion.polyline points={pts(opened)} fill="none" stroke="var(--shape-pink)" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: go ? 1 : 0 }} transition={{ duration: 1.2, ease: EASE }} />
        <motion.polyline points={pts(resolved)} fill="none" stroke="var(--primary)" strokeWidth="2.5" initial={{ pathLength: 0 }} animate={{ pathLength: go ? 1 : 0 }} transition={{ duration: 1.3, ease: EASE, delay: 0.15 }} />
        <motion.circle cx="440" cy={150 - (17 / 18) * 140} r="4.5" fill="var(--primary)" initial={{ scale: 0 }} animate={{ scale: go ? 1 : 0 }} transition={{ delay: 1.4, type: "spring", stiffness: 400, damping: 18 }} />
      </svg>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { k: "Done this week", v: "17" },
          { k: "Cycle 12", v: "64%" },
          { k: "On agents", v: "5" },
        ].map((m, i) => (
          <motion.div key={m.k} className="bg-paper px-3 py-2 rounded-md" initial={{ opacity: 0, y: 6 }} animate={{ opacity: go ? 1 : 0, y: go ? 0 : 6 }} transition={{ delay: 0.5 + i * 0.12, ease: EASE }}>
            <p className="text-[9px] text-subtle font-medium">{m.k}</p>
            <p className="mt-0.5 text-[17px] font-medium tracking-[-0.02em]">{m.v}</p>
          </motion.div>
        ))}
      </div>
    </MiniWindow>
  );
}

/* ───────── Connexions : les outils se branchent un à un ───────── */

const CONNECT_STEPS = [500, 600, 600, 600, 2400] as const;

export function ConnectArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(CONNECT_STEPS, playing, reduce);
  const rows = [
    { brand: "github" as const, t: "GitHub", d: "Repositories, issues, pull requests" },
    { brand: "mcp" as const, t: "MCP servers", d: "Tools for the assistant" },
    { brand: "plane" as const, t: "Plane", d: "Read your Plane projects" },
    { brand: null, t: "Webhooks", d: "Signed events to your own tools" },
  ];
  return (
    <MiniWindow title="Settings · Integrations" className="inset-x-10 top-6 bottom-6" bodyClassName="p-4">
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const on = step >= i + 1;
          return (
            <li key={r.t} className="flex items-center gap-3 border border-black/[0.06] bg-white px-3 py-3 rounded-lg">
              <span className="flex size-8 shrink-0 items-center justify-center bg-paper">
                {r.brand ? <BrandMark brand={r.brand} className="size-5" /> : <Webhook className="size-4 text-muted-foreground" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium">{r.t}</span>
                <span className="block truncate text-[10.5px] text-muted-foreground">{r.d}</span>
              </span>
              <AnimatePresence mode="popLayout" initial={false}>
                {on ? (
                  <motion.span key="on" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-1 bg-tint-green px-2 py-1 text-[9px] text-ink-green font-medium rounded-md">
                    <Check className="size-3" strokeWidth={3} /> Connected
                  </motion.span>
                ) : (
                  <motion.span key="off" exit={{ opacity: 0 }} className="px-2 py-1 text-[9px] text-subtle shadow-[inset_0_0_0_1px_var(--input)] font-medium">
                    Connect
                  </motion.span>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[10.5px] text-subtle">Each connection is one you set up, and you can remove it at any time.</p>
    </MiniWindow>
  );
}

/* ───────── Tous les jours : palette de commandes et confort de lecture ───────── */

const EVERY_STEPS = [700, 700, 700, 900, 2200] as const;

export function EverydayArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(EVERY_STEPS, playing, reduce);
  // les commandes de la vraie palette (frontend/components/command-palette.tsx)
  const rows = ["Create issue", "Go to My Queue", "Ask AI", "Switch to dark mode"];
  const hl = Math.min(step, 3);
  const dark = step >= 4;
  return (
    <>
      <motion.div
        className="absolute top-[28px] left-[34px] w-[300px] shadow-float rounded-lg"
        animate={{ backgroundColor: dark ? "#0b0e19" : "#ffffff", color: dark ? "#f3f2f0" : "#191715" }}
        transition={{ duration: 0.5 }}
      >
        <p className={cn("flex items-center gap-2 border-b px-3 py-2.5 text-[11.5px]", dark ? "border-night-border text-night-muted" : "border-black/[0.06] text-subtle")}>
          <Search className="size-3.5" /> Type a command or search
        </p>
        <div className="relative p-1">
          <motion.span
            aria-hidden="true"
            className={cn("absolute inset-x-1 top-1 h-[32px]", dark ? "bg-[#121d3d]" : "bg-accent")}
            animate={{ y: hl * 32 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          />
          {rows.map((r, i) => (
            <p key={r} className="relative flex h-[32px] items-center gap-2 px-2.5 text-[12px]">
              {r}
              {i === hl && <CornerDownLeft className="ml-auto size-3.5 opacity-60" />}
            </p>
          ))}
        </div>
      </motion.div>
      <div className="absolute top-[60px] right-[30px] flex w-[190px] flex-col gap-2">
        {[
          { t: "Dark theme", on: dark },
          { t: "Dyslexia-friendly font", on: false },
          { t: "Color-blind palettes", on: true },
        ].map((s) => (
          <div key={s.t} className="flex items-center justify-between bg-white px-3 py-2.5 text-[11px] shadow-float rounded-lg">
            {s.t}
            <span className={cn("relative h-4 w-7 rounded-full transition-colors duration-300", s.on ? "bg-primary" : "bg-input")}>
              <motion.span className="absolute top-0.5 size-3 rounded-full bg-white" animate={{ left: s.on ? 14 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
            </span>
          </div>
        ))}
      </div>
      <div className="absolute bottom-[34px] left-[34px] flex items-center gap-2 bg-white px-3 py-2.5 text-[11px] shadow-float rounded-lg">
        <span className="kbd">Ctrl</span>
        <span className="kbd">K</span>
        <span className="text-muted-foreground">opens the palette from anywhere, ↑ ↓ and ↵ do the rest</span>
      </div>
    </>
  );
}
