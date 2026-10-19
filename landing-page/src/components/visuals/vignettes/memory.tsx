import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, FileText, Hash, Search } from "lucide-react";

import { BrandMark } from "../brand";
import { EASE, Line, MiniWindow, rise, useSequence } from "./parts";
import type { VProps } from "./plan";
import { cn } from "@/lib/utils";

/** Vignettes de la section « Memory » (Brain OS, 560 × 400). Données d'exemple. */

/* ───────── Arbre de pages : le dossier s'ouvre, la page s'écrit ───────── */

const TREE_STEPS = [600, 700, 1400, 2400] as const;

export function TreeArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(TREE_STEPS, playing, reduce);
  const open = step >= 1;
  const write = step >= 2;
  const children = ["Design tokens", "Release checklist", "API conventions"];
  return (
    <MiniWindow title="Brain OS" className="inset-x-6 top-6 bottom-6" bodyClassName="flex">
      <div className="w-[170px] shrink-0 border-r border-black/[0.06] bg-paper p-2.5 text-[11.5px]">
        <p className="px-1 pb-1.5 text-[9px] text-subtle font-medium">Pages</p>
        <p className="flex items-center gap-1 px-1 py-1 font-medium">
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.25 }}>
            <ChevronRight className="size-3 text-subtle" />
          </motion.span>
          Engineering
        </p>
        <AnimatePresence>
          {open &&
            children.map((c, i) => (
              <motion.p
                key={c}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE, delay: i * 0.08 }}
                className={cn("flex items-center gap-1.5 py-1 pr-1 pl-5", i === 0 && write ? "bg-tint-green text-ink-green" : "text-muted-foreground")}
              >
                <FileText className="size-3 shrink-0" /> {c}
              </motion.p>
            ))}
        </AnimatePresence>
        {["Decisions", "Meeting notes"].map((c) => (
          <p key={c} className="flex items-center gap-1 px-1 py-1 text-muted-foreground">
            <ChevronRight className="size-3 text-subtle" /> {c}
          </p>
        ))}
      </div>
      <div className="min-w-0 flex-1 p-5">
        <p className="text-[9.5px] text-subtle font-medium">Engineering › Design tokens</p>
        <AnimatePresence>
          {write && (
            <motion.div key="page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.p
                className="mt-2 overflow-hidden text-[17px] font-medium tracking-[-0.02em] whitespace-nowrap"
                initial={{ width: 0 }}
                animate={{ width: "auto" }}
                transition={{ duration: 0.6, ease: "linear" }}
              >
                Design tokens
              </motion.p>
              <div className="mt-3 flex flex-col gap-2">
                {[250, 230, 180].map((w, i) => (
                  <motion.span key={w} className="block h-[6px] origin-left bg-border" style={{ width: w }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.45, delay: 0.5 + i * 0.15, ease: EASE }} />
                ))}
              </div>
              <motion.p {...rise} transition={{ ...rise.transition, delay: 1 }} className="mt-4 text-[11.5px] font-medium">
                Why
              </motion.p>
              <motion.div className="mt-2 flex flex-col gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
                <Line w={220} />
                <Line w={150} />
              </motion.div>
              <motion.div className="mt-4 flex gap-1.5" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.35, ease: EASE }}>
                {["design", "theming"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-0.5 bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground rounded-md">
                    <Hash className="size-2.5" />
                    {t}
                  </span>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MiniWindow>
  );
}

/* ───────── Liens : la page se relie aux issues qu'elle explique ───────── */

const LINK_STEPS = [500, 1800, 2600] as const;

export function LinksArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(LINK_STEPS, playing, reduce);
  const go = step >= 1;
  const issues = [
    { t: "Theming with CSS variables", x: 330, y: 66 },
    { t: "Contrast review", x: 372, y: 176 },
    { t: "Release checklist", x: 340, y: 286 },
  ];
  return (
    <>
      <svg className="absolute inset-0" viewBox="0 0 560 400" aria-hidden="true">
        {issues.map((it, i) => (
          <motion.path
            key={it.t}
            d={`M 232 200 C 290 200, 300 ${it.y + 22}, ${it.x} ${it.y + 22}`}
            fill="none"
            stroke="var(--shape-green)"
            strokeWidth="1.6"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: go ? 1 : 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.15 * i }}
          />
        ))}
        {go &&
          issues.map((it, i) => (
            <motion.circle
              key={`d-${it.t}`}
              r="3"
              fill="var(--shape-green)"
              animate={{ cx: [232, it.x], cy: [200, it.y + 22], opacity: [0, 1, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, delay: 0.9 + i * 0.35, ease: "easeInOut" }}
            />
          ))}
      </svg>
      <div className="absolute top-[118px] left-[32px] w-[200px] bg-white p-4 shadow-float rounded-lg">
        <p className="flex items-center gap-1.5 text-[13px] font-medium">
          <FileText className="size-3.5 text-ink-green" /> Design tokens
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Line w={150} />
          <Line w={130} />
          <Line w={90} />
        </div>
        <p className="mt-3 text-[9px] text-subtle font-medium">Linked pages · 3</p>
      </div>
      {issues.map((it, i) => (
        <motion.div
          key={it.t}
          className="absolute flex items-center gap-2 bg-white px-3 py-2.5 shadow-float rounded-lg"
          style={{ left: it.x, top: it.y }}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: go ? 1 : 0.35, x: go ? 0 : 10 }}
          transition={{ duration: 0.45, ease: EASE, delay: 0.5 + 0.15 * i }}
        >
          <FileText className="size-3.5 text-ink-green" />
          <span className="text-[11.5px] font-medium whitespace-nowrap">{it.t}</span>
        </motion.div>
      ))}
    </>
  );
}

/* ───────── Recherche par le sens ───────── */

const SEARCH_STEPS = [400, 1500, 2800] as const;
const QUERY = "why do colors use css variables?";

export function SearchArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(SEARCH_STEPS, playing, reduce);
  const results = [
    { t: "Design tokens", p: "Engineering", s: 0.92 },
    { t: "Theming with CSS variables", p: "Decisions", s: 0.81 },
    { t: "Contrast review, 12 March", p: "Meeting notes", s: 0.64 },
  ];
  return (
    <MiniWindow title="Brain OS · Search" className="inset-x-10 top-6 bottom-6" bodyClassName="p-5">
      <div className="flex items-center gap-2 border border-input bg-white px-3 py-2.5 text-[12.5px] rounded-lg">
        <Search className="size-4 text-subtle" />
        <motion.span
          className="overflow-hidden whitespace-nowrap"
          initial={false}
          animate={{ width: step >= 1 ? 238 : 0 }}
          transition={{ duration: 1.1, ease: "linear" }}
        >
          {QUERY}
        </motion.span>
        <span className="anim-caret h-4 w-px bg-foreground" />
      </div>
      <p className="mt-4 text-[9.5px] text-subtle font-medium">Closest by meaning</p>
      <ul className="mt-2 flex flex-col gap-2">
        <AnimatePresence>
          {step >= 2 &&
            results.map((r, i) => (
              <motion.li
                key={r.t}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: i * 0.12 }}
                className="flex items-center gap-3 border border-black/[0.06] bg-white px-3 py-2.5 rounded-lg"
              >
                <FileText className="size-4 shrink-0 text-ink-green" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">{r.t}</span>
                  <span className="block text-[10.5px] text-muted-foreground">{r.p}</span>
                </span>
                <span className="h-1.5 w-16 bg-muted">
                  <motion.span className="block h-full origin-left bg-shape-green" initial={{ scaleX: 0 }} animate={{ scaleX: r.s }} transition={{ duration: 0.6, delay: 0.2 + i * 0.12, ease: EASE }} />
                </span>
              </motion.li>
            ))}
        </AnimatePresence>
      </ul>
    </MiniWindow>
  );
}

/* ───────── Lu par les agents ───────── */

const READ_STEPS = [500, 900, 900, 2600] as const;

export function AgentReadsArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(READ_STEPS, playing, reduce);
  return (
    <>
      <div className="absolute top-[96px] left-[30px] w-[190px] bg-white p-4 shadow-float rounded-lg">
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium">
          <FileText className="size-3.5 text-ink-green" /> Design tokens
        </p>
        <p className="mt-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
          Colors come from CSS variables. Dark mode swaps the variables, not the components.
        </p>
      </div>
      <svg className="absolute inset-0" viewBox="0 0 560 400" aria-hidden="true">
        <line x1="222" y1="160" x2="318" y2="160" stroke="var(--rule)" strokeWidth="1.4" strokeDasharray="4 4" />
        {step >= 1 && (
          <motion.rect
            width="22"
            height="14"
            y="153"
            fill="var(--shape-green)"
            initial={{ x: 222, opacity: 0 }}
            animate={{ x: [222, 300], opacity: [0, 1, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </svg>
      <div className="absolute top-[70px] left-[320px] w-[214px] bg-white shadow-float rounded-lg">
        <p className="flex items-center gap-2 border-b border-black/[0.06] bg-paper px-3 py-2 text-[11.5px] font-medium rounded-md">
          <BrandMark brand="claude-code" className="size-4" /> Claude Code
          <span className="ml-auto flex items-center gap-1 text-[9px] text-ink-green font-medium">
            <span className="size-1.5 rounded-full bg-shape-green" /> Running
          </span>
        </p>
        <ul className="flex flex-col gap-2 p-3 text-[11px]">
          <AnimatePresence>
            {step >= 1 && (
              <motion.li key="a" {...rise} className="flex gap-1.5">
                <FileText className="mt-0.5 size-3 shrink-0 text-subtle" />
                <span>
                  <span className="font-medium">Searched</span> <span className="text-muted-foreground">Brain OS for “theme”</span>
                </span>
              </motion.li>
            )}
            {step >= 2 && (
              <motion.li key="b" {...rise} className="bg-tint-green px-2 py-1.5 text-[10.5px] text-ink-green rounded-md">
                Uses the CSS variables, as decided
              </motion.li>
            )}
            {step >= 3 && (
              <motion.li key="c" {...rise} className="flex gap-1.5">
                <FileText className="mt-0.5 size-3 shrink-0 text-subtle" />
                <span>
                  <span className="font-medium">Edit</span> <span className="font-mono text-[10px] text-muted-foreground">styles/theme.css</span>
                </span>
              </motion.li>
            )}
          </AnimatePresence>
        </ul>
      </div>
      <div className="absolute top-[268px] left-[30px] flex items-center gap-2 bg-white px-3 py-2.5 text-[11px] shadow-float rounded-lg">
        <span className="flex size-5 items-center justify-center bg-primary font-mono text-[8px] text-white">AI</span>
        The assistant searches it too
      </div>
    </>
  );
}
