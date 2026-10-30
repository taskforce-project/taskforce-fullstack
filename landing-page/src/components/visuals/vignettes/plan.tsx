import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { CalendarDays, Check, Inbox, Link2, ShieldQuestion, GitPullRequest, MessageSquare } from "lucide-react";

import { BrandMark } from "../brand";
import { Cursor, EASE, MiniWindow, Person, Status, rise, useSequence } from "./parts";
import { cn } from "@/lib/utils";

/** Vignettes de la section « Plan » (560 × 400). Données d'exemple, libellés de l'app. */

export type VProps = { playing: boolean; reduce: boolean };

/* ───────── Board : une carte glisse de Todo à In progress ───────── */

const BOARD_STEPS = [700, 650, 900, 2200] as const;

type Mini = { key: string; title: string; who?: "me" | "claude-code" | "github-copilot" };

function MiniCard({ card, lifted }: Readonly<{ card: Mini; lifted?: boolean }>) {
  return (
    <motion.div
      layout
      layoutId={card.key}
      transition={{ layout: { type: "spring", stiffness: 230, damping: 26 } }}
      animate={{ rotate: lifted ? -2 : 0, scale: lifted ? 1.04 : 1, boxShadow: lifted ? "var(--shadow-lg)" : "var(--shadow-sm)" }}
      className={cn("relative border bg-white p-2.5 rounded-lg", lifted ? "z-10 border-primary/50" : "border-black/[0.06]")}
    >
      <p className="font-mono text-[9.5px] text-subtle">{card.key}</p>
      <p className="mt-1 text-[11.5px] leading-snug font-medium">{card.title}</p>
      <div className="mt-2 flex justify-end">
        {card.who === "me" && <Person />}
        {card.who && card.who !== "me" && <BrandMark brand={card.who} className="size-5" />}
      </div>
    </motion.div>
  );
}

export function BoardArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(BOARD_STEPS, playing, reduce);
  const moved = step >= 2;
  const lifted = step === 1 || step === 2;
  const moving: Mini = { key: "WEB-44", title: "Empty state for search", who: "me" };
  const todo: Mini[] = [{ key: "API-17", title: "Rate limit the export" }, ...(moved ? [] : [moving]), { key: "WEB-46", title: "Copy for the empty inbox" }];
  const progress: Mini[] = [...(moved ? [moving] : []), { key: "WEB-42", title: "Dark mode in settings", who: "claude-code" }];
  const review: Mini[] = [{ key: "MOB-12", title: "Offline mode for notes", who: "github-copilot" }];
  const cols = [
    { n: "Todo", dot: "bg-subtle", cards: todo },
    { n: "In progress", dot: "bg-shape-yellow", cards: progress },
    { n: "In review", dot: "bg-shape-pink", cards: review },
  ];
  // positions du curseur : sur la carte dans Todo, puis dans la colonne In progress
  const cursor = step === 0 ? { x: 470, y: 330 } : moved ? { x: 290, y: 132 } : { x: 120, y: 190 };
  return (
    <>
      <MiniWindow title="Website · Board" className="inset-x-6 top-6 bottom-6" bodyClassName="p-4">
        <LayoutGroup>
          <div className="grid h-full grid-cols-3 gap-3">
            {cols.map((c) => (
              <div key={c.n} className="flex flex-col gap-2 bg-paper p-2">
                <p className="flex items-center gap-1.5 text-[11px] font-medium">
                  <span className={cn("size-1.5 rounded-full", c.dot)} />
                  {c.n}
                  <motion.span key={c.cards.length} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-[10px] text-subtle">
                    {c.cards.length}
                  </motion.span>
                </p>
                {c.cards.map((card) => (
                  <MiniCard key={card.key} card={card} lifted={card.key === "WEB-44" && lifted} />
                ))}
              </div>
            ))}
          </div>
        </LayoutGroup>
      </MiniWindow>
      <Cursor x={cursor.x} y={cursor.y} press={step === 1} show={!reduce} />
    </>
  );
}

/* ───────── Cycles et roadmap : la barre du cycle se remplit, la roadmap se dessine ───────── */

const CYCLE_STEPS = [300, 2600, 2400] as const;

export function CyclesArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(CYCLE_STEPS, playing, reduce);
  const go = step >= 1;
  const rows = [
    { t: "Website 2.1", from: 0, to: 0.58, c: "bg-shape-blue" },
    { t: "Offline notes", from: 0.22, to: 0.82, c: "bg-shape-green" },
    { t: "Billing API v2", from: 0.48, to: 1, c: "bg-shape-yellow" },
  ];
  return (
    <MiniWindow title="Cycles and roadmap" className="inset-x-6 top-6 bottom-6" bodyClassName="p-5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-2 font-medium">
          <CalendarDays className="size-3.5 text-subtle" /> Cycle 12
        </span>
        <span className="font-mono text-[10px] text-subtle">Oct 14 to 27</span>
      </div>
      <div className="mt-3 h-2 bg-muted">
        <motion.span
          className="block h-full origin-left bg-primary"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: go ? 0.64 : 0 }}
          transition={{ duration: 1.6, ease: EASE }}
        />
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted-foreground">{go ? "9 of 14 issues done" : "0 of 14 issues done"}</p>

      <p className="mt-7 text-[9.5px] text-subtle font-medium">Roadmap</p>
      <div className="relative mt-3">
        <div className="absolute inset-0 grid grid-cols-6" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="border-l border-black/[0.06] first:border-l-0" />
          ))}
        </div>
        <motion.span
          className="absolute top-[-6px] bottom-[-6px] w-px bg-shape-red"
          initial={{ left: "18%" }}
          animate={{ left: go ? "40%" : "18%" }}
          transition={{ duration: 2.2, ease: EASE }}
        />
        <div className="relative flex flex-col gap-3 py-1">
          {rows.map((r, i) => (
            <div key={r.t} className="relative h-7">
              <motion.div
                className={cn("absolute inset-y-0 flex items-center px-2 text-[10.5px] font-medium text-white", r.c)}
                style={{ left: `${r.from * 100}%`, transformOrigin: "left" }}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: go ? `${(r.to - r.from) * 100}%` : 0, opacity: go ? 1 : 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.25 + i * 0.18 }}
              >
                <span className="truncate">{r.t}</span>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </MiniWindow>
  );
}

/* ───────── Sous-tâches : elles se cochent une à une ───────── */

const SUB_STEPS = [800, 900, 900, 900, 2000] as const;

export function SubtasksArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(SUB_STEPS, playing, reduce);
  const subs = ["Read the system theme", "Add the toggle in Settings", "Test both themes"];
  const done = Math.min(step, 3);
  return (
    <MiniWindow title="Website › WEB-42" className="inset-x-10 top-6 bottom-6" bodyClassName="p-5">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-medium tracking-[-0.015em]">Add dark mode to the settings page</p>
        <Status tone={done === 3 ? "done" : "progress"}>{done === 3 ? "Done" : "In progress"}</Status>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <motion.span {...rise} className="inline-flex items-center gap-1 bg-tint-red px-1.5 py-0.5 text-[10.5px] text-ink-red rounded-md">
          <Link2 className="size-3" /> Blocks WEB-51
        </motion.span>
        <span className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground rounded-md">
          <CalendarDays className="size-3" /> Due 24 October
        </span>
      </div>
      <p className="mt-5 flex items-center gap-2 text-[12px] font-medium">
        Subtasks
        <motion.span key={done} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-[10.5px] font-normal text-subtle">
          {done} of 3
        </motion.span>
      </p>
      <div className="mt-2 h-1 bg-muted">
        <motion.span className="block h-full origin-left bg-shape-green" animate={{ scaleX: done / 3 }} transition={{ duration: 0.5, ease: EASE }} />
      </div>
      <ul className="mt-3 flex flex-col border border-black/[0.06]">
        {subs.map((s, i) => {
          const on = i < done;
          return (
            <li key={s} className="flex items-center gap-2.5 border-b border-black/[0.06] px-3 py-2.5 text-[12px] last:border-b-0">
              <motion.span
                className="flex size-4 items-center justify-center border"
                animate={{ backgroundColor: on ? "#2f6bf6" : "#ffffff", borderColor: on ? "#2f6bf6" : "#dcdad5" }}
                transition={{ duration: 0.2 }}
              >
                <AnimatePresence>{on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}><Check className="size-3 text-white" strokeWidth={3} /></motion.span>}</AnimatePresence>
              </motion.span>
              <span className={cn("relative transition-colors", on && "text-muted-foreground")}>
                {s}
                <motion.span
                  className="absolute top-1/2 left-0 h-px w-full origin-left bg-subtle"
                  initial={false}
                  animate={{ scaleX: on ? 1 : 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex gap-2 text-[10.5px] text-muted-foreground">
        <span className="bg-muted px-2 py-1 rounded-md">Checklist 2 of 2</span>
        <span className="bg-muted px-2 py-1 rounded-md">Time tracked 3 h 20</span>
      </div>
    </MiniWindow>
  );
}

/* ───────── My Queue : ce qui attend la personne arrive, le premier est traité ───────── */

const QUEUE_STEPS = [450, 450, 450, 450, 1600, 1500] as const;

export function QueueArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(QUEUE_STEPS, playing, reduce);
  const all = [
    { k: "approve", icon: ShieldQuestion, t: "Approve: a web search", m: "WEB-42 · Claude Code", tag: "Needs you", tone: "text-ink-yellow bg-tint-yellow" },
    { k: "pr", icon: GitPullRequest, t: "Review pull request #42", m: "WEB-42 · ready for your review", tag: "Review", tone: "text-ink-pink bg-tint-pink" },
    { k: "comment", icon: MessageSquare, t: "Reply to a comment", m: "API-17 · Rate limit the export", tag: "Mention", tone: "text-ink-blue bg-tint-blue" },
    { k: "due", icon: CalendarDays, t: "Due today", m: "WEB-44 · Empty state for search", tag: "Today", tone: "text-ink-red bg-tint-red" },
  ];
  const visible = all.slice(0, Math.min(step + 1, 4));
  const firstDone = step >= 5;
  const list = firstDone ? visible.slice(1) : visible;
  return (
    <MiniWindow title="My Queue" className="inset-x-10 top-6 bottom-6" bodyClassName="p-4">
      <div className="flex items-center justify-between px-1">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <Inbox className="size-4 text-subtle" /> What needs you next
        </p>
        <motion.span key={list.length} initial={{ scale: 0.7 }} animate={{ scale: 1 }} className="bg-primary px-1.5 py-0.5 font-mono text-[10px] text-white">
          {list.length}
        </motion.span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {list.map((it) => (
            <motion.li
              key={it.k}
              layout
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30, transition: { duration: 0.3 } }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className={cn("flex items-center gap-3 border border-black/[0.06] bg-white px-3 py-2.5 rounded-lg", step === 4 && it.k === "approve" && "border-primary/50 shadow-md")}
            >
              <it.icon className="size-4 shrink-0 text-subtle" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">{it.t}</span>
                <span className="block truncate text-[10.5px] text-muted-foreground">{it.m}</span>
              </span>
              <span className={cn("px-1.5 py-0.5 text-[9px] font-medium", it.tone)}>{it.tag}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <AnimatePresence>
        {firstDone && (
          <motion.p {...rise} className="mt-3 flex items-center gap-1.5 px-1 text-[11px] text-ink-green">
            <Check className="size-3.5" strokeWidth={2.6} /> Allowed: the agent goes on
          </motion.p>
        )}
      </AnimatePresence>
    </MiniWindow>
  );
}
