import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Loader2,
  Lock,
  MessageSquare,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { BrandMark } from "../brand";
import { Cursor, EASE, MiniWindow, Person, Status, rise, useSequence } from "./parts";
import type { VProps } from "./plan";
import { cn } from "@/lib/utils";

/** Vignettes des sections « Delegate » et « Review » (560 × 400). Données d'exemple, libellés de l'app. */

/* ═════════════════════════════ Delegate ═════════════════════════════ */

/* ───────── Choisir un agent dans le menu d'assignation ───────── */

const ASSIGN_STEPS = [600, 700, 650, 700, 2400] as const;

export function AssignArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(ASSIGN_STEPS, playing, reduce);
  const menu = step >= 1 && step <= 3;
  const hot = step >= 2;
  const assigned = step >= 4;
  const cursor = step === 0 ? { x: 470, y: 340 } : step === 1 ? { x: 400, y: 136 } : { x: 380, y: 210 };
  return (
    <>
      <MiniWindow title="Website › WEB-42" className="inset-x-8 top-6 bottom-6" bodyClassName="p-5">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-medium tracking-[-0.015em]">Add dark mode to the settings page</p>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={assigned ? "p" : "t"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <Status tone={assigned ? "progress" : "todo"}>{assigned ? "In progress" : "Todo"}</Status>
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="relative mt-4 flex items-center justify-between border-y border-black/[0.06] py-2.5 text-[12px]">
          <span className="text-muted-foreground">Assignee</span>
          <span className="inline-flex min-w-[150px] items-center justify-between gap-1.5 border border-input bg-white px-2 py-1 rounded-lg">
            <AnimatePresence mode="popLayout" initial={false}>
              {assigned ? (
                <motion.span key="a" className="inline-flex items-center gap-1.5" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}>
                  <BrandMark brand="claude-code" className="size-4" /> Claude Code
                </motion.span>
              ) : (
                <motion.span key="u" className="text-muted-foreground" exit={{ opacity: 0 }}>
                  Unassigned
                </motion.span>
              )}
            </AnimatePresence>
            <ChevronDown className="size-3 text-subtle" />
          </span>
          <AnimatePresence>
            {menu && (
              <motion.div
                className="absolute top-[44px] right-0 z-10 w-[250px] border border-black/[0.06] bg-white p-1 shadow-xl rounded-lg"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
                transition={{ duration: 0.25, ease: EASE }}
                style={{ transformOrigin: "top right" }}
              >
                <p className="px-2 pt-1 pb-1.5 text-[9px] text-subtle font-medium">Assign to</p>
                {[
                  { t: "You", brand: null },
                  { t: "Claude Code", brand: "claude-code" as const },
                  { t: "GitHub Copilot", brand: "github-copilot" as const },
                ].map((o) => {
                  const on = o.brand === "claude-code" && hot;
                  return (
                    <span key={o.t} className="relative flex h-[32px] items-center gap-2 px-2 text-[12px]">
                      {on && <motion.span layoutId="assign-hl-v" className="absolute inset-0 bg-accent" />}
                      <span className="relative">{o.brand ? <BrandMark brand={o.brand} className="size-4" /> : <Person />}</span>
                      <span className={cn("relative", on && "text-accent-foreground")}>{o.t}</span>
                      {o.brand && <span className="relative ml-auto text-[9px] text-ink-green font-medium">Ready</span>}
                    </span>
                  );
                })}
                <p className="border-t border-black/[0.06] px-2 pt-1.5 pb-1 text-[10px] text-subtle">Only agents ready for this project</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
          Follow the system theme by default, with a toggle in Settings.
        </p>
        <AnimatePresence>
          {assigned && (
            <motion.p {...rise} className="mt-4 flex items-center gap-2 bg-tint-green px-3 py-2 text-[11.5px] text-ink-green rounded-md">
              <Check className="size-3.5" strokeWidth={2.6} /> Claude Code picked it up, with the issue and its Brain OS pages
            </motion.p>
          )}
        </AnimatePresence>
      </MiniWindow>
      <Cursor x={cursor.x} y={cursor.y} press={step === 1 || step === 3} show={!reduce && step < 4} />
    </>
  );
}

/* ───────── Sa propre branche, dans une copie du dépôt ───────── */

const BRANCH_STEPS = [500, 700, 700, 700, 2400] as const;

export function BranchArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(BRANCH_STEPS, playing, reduce);
  const commits = [
    { x: 300, t: "theme.css" },
    { x: 395, t: "appearance.tsx" },
    { x: 490, t: "tests pass" },
  ];
  return (
    <>
      <div className="absolute top-[40px] left-[30px] flex items-center gap-2 bg-white px-3 py-2 text-[11px] shadow-float rounded-lg">
        <Lock className="size-3.5 text-subtle" />
        <span>
          Your checkout · <span className="font-mono">main</span> · untouched
        </span>
      </div>
      <svg className="absolute inset-0" viewBox="0 0 560 400" aria-hidden="true">
        {/* main */}
        <line x1="40" y1="150" x2="520" y2="150" stroke="var(--foreground)" strokeOpacity="0.25" strokeWidth="3" />
        {[80, 150, 220].map((x) => (
          <circle key={x} cx={x} cy="150" r="7" fill="#ffffff" stroke="var(--foreground)" strokeOpacity="0.35" strokeWidth="2.5" />
        ))}
        {/* la branche de l'agent */}
        <motion.path
          d="M 220 150 C 250 150, 250 250, 290 250 L 520 250"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: step >= 1 ? 1 : 0 }}
          transition={{ duration: 1, ease: EASE }}
        />
        {commits.map((c, i) => (
          <motion.circle
            key={c.x}
            cx={c.x}
            cy="250"
            r="7"
            fill="#ffffff"
            stroke="var(--primary)"
            strokeWidth="2.5"
            initial={{ scale: 0 }}
            animate={{ scale: step >= i + 2 ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 18 }}
            style={{ transformOrigin: `${c.x}px 250px` }}
          />
        ))}
      </svg>
      <motion.span
        className="absolute top-[204px] left-[300px] flex items-center gap-1.5 bg-primary px-2 py-1 font-mono text-[10px] text-white"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 6 }}
        transition={{ duration: 0.35, delay: 0.5 }}
      >
        <GitBranch className="size-3" /> tf/web-42-dark-mode
      </motion.span>
      {commits.map((c, i) => (
        <motion.span
          key={c.t}
          className="absolute top-[272px] -translate-x-1/2 text-[10.5px] whitespace-nowrap text-muted-foreground"
          style={{ left: c.x }}
          initial={{ opacity: 0 }}
          animate={{ opacity: step >= i + 2 ? 1 : 0 }}
        >
          {c.t}
        </motion.span>
      ))}
      <span className="absolute top-[122px] left-[40px] font-mono text-[10px] text-subtle">main</span>
      <AnimatePresence>
        {step >= 4 && (
          <motion.div {...rise} className="absolute top-[318px] left-[30px] flex items-center gap-2 bg-white px-3 py-2.5 text-[11.5px] shadow-float rounded-lg">
            <GitPullRequest className="size-3.5 text-ink-green" /> Pushed by TaskForce, pull request #42 opened
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ───────── Le run en direct ───────── */

const LIVE_STEPS = [700, 700, 700, 700, 700, 2200] as const;

export function LiveArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(LIVE_STEPS, playing, reduce);
  const rows = [
    { icon: GitBranch, v: "Run started", d: "on its own branch", mono: false },
    { icon: FileText, v: "Searched", d: "Brain OS, found “Design tokens”", mono: false },
    { icon: FileText, v: "Read", d: "app/settings/page.tsx", mono: true },
    { icon: Wrench, v: "Edit", d: "styles/theme.css", mono: true },
    { icon: Wrench, v: "Edit", d: "app/settings/appearance.tsx", mono: true },
  ];
  const shown = rows.slice(0, Math.min(step + 1, rows.length));
  const finished = step >= rows.length;
  return (
    <MiniWindow title="Website › WEB-42" className="inset-x-8 top-6 bottom-6" bodyClassName="p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[10px] text-subtle font-medium">
          Activity
          <span className="flex items-center gap-1 text-ink-green normal-case">
            <span className="anim-pulse size-1.5 rounded-full bg-shape-green" /> live
          </span>
        </p>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <BrandMark brand="claude-code" className="size-4" /> Claude Code
        </span>
      </div>
      <ul className="mt-3 flex flex-col border-l border-black/[0.06] pl-3">
        <AnimatePresence initial={false}>
          {shown.map((r, i) => {
            const live = i === shown.length - 1 && !finished;
            return (
              <motion.li key={r.d} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease: EASE }} className="flex h-[38px] items-center gap-2.5 text-[12px]">
                <span className="flex size-4 items-center justify-center">
                  {live ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <Check className="size-3.5 text-ink-green" strokeWidth={2.6} />}
                </span>
                <r.icon className="size-3.5 text-subtle" />
                <span className="font-medium">{r.v}</span>
                <span className={cn("truncate text-muted-foreground", r.mono && "font-mono text-[11px]")}>{r.d}</span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <p className="mt-3 text-[11px] text-subtle">Every file it reads or edits, and every command, shows up here.</p>
    </MiniWindow>
  );
}

/* ───────── Deux agents ───────── */

const AGENTS_STEPS = [800, 1400, 2600] as const;

export function AgentsArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(AGENTS_STEPS, playing, reduce);
  const cards = [
    { brand: "claude-code" as const, name: "Claude Code", where: "On your computer", detail: "Your install, your account", status: step >= 1 ? "Running" : "Ready", issue: "WEB-42" },
    { brand: "github-copilot" as const, name: "GitHub Copilot", where: "In GitHub's cloud", detail: "Under your GitHub account", status: step >= 2 ? "Running" : step >= 1 ? "Queued" : "Ready", issue: "MOB-12" },
  ];
  return (
    <div className="absolute inset-x-8 top-[60px] grid grid-cols-2 gap-4">
      {cards.map((c, i) => (
        <motion.div key={c.name} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: i * 0.12 }} className="bg-white p-5 shadow-float rounded-lg">
          <BrandMark brand={c.brand} className="size-9" />
          <p className="mt-4 text-[15px] font-medium tracking-[-0.015em]">{c.name}</p>
          <p className="mt-0.5 text-[9.5px] text-subtle font-medium">{c.where}</p>
          <p className="mt-3 text-[11.5px] text-muted-foreground">{c.detail}</p>
          <div className="mt-5 flex items-center justify-between border-t border-black/[0.06] pt-3">
            <span className="font-mono text-[10px] text-subtle">{c.issue}</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={c.status} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                <Status tone={c.status === "Running" ? "done" : c.status === "Queued" ? "progress" : "todo"}>{c.status}</Status>
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>
      ))}
      <p className="col-span-2 mt-2 text-center text-[11.5px] text-muted-foreground">Same issue, same timeline, whichever agent you pick.</p>
    </div>
  );
}

/* ═════════════════════════════ Review ═════════════════════════════ */

/* ───────── Valider ou refuser ───────── */

const APPROVE_STEPS = [500, 800, 700, 250, 2600] as const;

export function ApproveArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(APPROVE_STEPS, playing, reduce);
  const card = step >= 1 && step <= 3;
  const allowed = step >= 4;
  const cursor = step <= 1 ? { x: 470, y: 350 } : { x: 98, y: 226 };
  return (
    <>
      <MiniWindow title="Website › WEB-42" className="inset-x-8 top-6 bottom-6" bodyClassName="p-5">
        <ul className="flex flex-col text-[12px]">
          {[
            { v: "Edit", d: "styles/theme.css" },
            { v: "Edit", d: "app/settings/appearance.tsx" },
          ].map((r) => (
            <li key={r.d} className="flex h-[32px] items-center gap-2.5">
              <Check className="size-3.5 text-ink-green" strokeWidth={2.6} />
              <span className="font-medium">{r.v}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{r.d}</span>
            </li>
          ))}
          <AnimatePresence mode="popLayout">
            {card && (
              <motion.li
                key="card"
                layout
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="mt-2 border border-black/[0.06] border-l-2 border-l-shape-yellow bg-white p-3.5 shadow-md rounded-lg"
              >
                <p className="flex items-center gap-2 text-[12.5px] font-medium">
                  <BrandMark brand="claude-code" className="size-4" /> Claude Code asks to run Bash
                </p>
                <p className="mt-2 bg-muted px-2 py-1 font-mono text-[11px] rounded-md">npm test -- settings</p>
                <div className="mt-3 flex items-center gap-2">
                  <motion.span animate={{ scale: step === 3 ? 0.92 : 1 }} transition={{ duration: 0.12 }} className="inline-flex h-7 items-center bg-primary px-3 text-[11.5px] font-medium text-white shadow-key rounded-lg">
                    Allow
                  </motion.span>
                  <span className="inline-flex h-7 items-center px-3 text-[11.5px] shadow-[inset_0_0_0_1px_var(--input)] rounded-lg">Deny</span>
                  <span className="ml-auto text-[10.5px] text-muted-foreground">9 min left, then it is denied</span>
                </div>
                <div className="mt-3 h-[3px] bg-muted">
                  <motion.span className="block h-full origin-left bg-shape-yellow" initial={{ scaleX: 1 }} animate={{ scaleX: 0.8 }} transition={{ duration: 1.8, ease: "linear" }} />
                </div>
              </motion.li>
            )}
          </AnimatePresence>
          {allowed && (
            <>
              <motion.li {...rise} className="flex h-[32px] items-center gap-2.5">
                <ShieldCheck className="size-3.5 text-ink-green" />
                <span className="font-medium">Bash</span>
                <span className="font-mono text-[11px] text-muted-foreground">npm test -- settings</span>
                <span className="text-muted-foreground">· Allowed by you</span>
              </motion.li>
              <motion.li {...rise} transition={{ ...rise.transition, delay: 0.5 }} className="flex h-[32px] items-center gap-2.5">
                <Check className="size-3.5 text-ink-green" strokeWidth={2.6} />
                <span className="font-medium">Tests</span>
                <span className="text-ink-green">12 passed</span>
              </motion.li>
            </>
          )}
        </ul>
        <AnimatePresence>
          {allowed && (
            <motion.div
              className="absolute right-4 bottom-4 flex items-center gap-2 bg-foreground px-3 py-2 text-[11.5px] text-white shadow-lg"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
            >
              <Check className="size-3.5 text-shape-lime" strokeWidth={2.6} /> Allowed: the agent goes on
            </motion.div>
          )}
        </AnimatePresence>
      </MiniWindow>
      <Cursor x={cursor.x} y={cursor.y} press={step === 3} show={!reduce && step >= 1 && step <= 3} />
    </>
  );
}

/* ───────── La pull request ───────── */

const PR_STEPS = [400, 700, 600, 600, 2600] as const;

/** La pull request d'un run : ouverte par TaskForce après Claude Code, ou par Copilot lui-même sur GitHub. */
function PrScene({ playing, reduce, copilot }: Readonly<VProps & { copilot: boolean }>) {
  const step = useSequence(PR_STEPS, playing, reduce);
  const checks = ["Tests", "Lint", "Build"];
  return (
    <motion.div
      className="absolute inset-x-12 top-[46px] bg-white shadow-float rounded-lg"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: step >= 1 ? 1 : 0, y: step >= 1 ? 0 : 18 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
    >
      <div className="flex items-center gap-2 border-b border-black/[0.06] bg-paper px-4 py-3">
        <GitPullRequest className="size-4 text-ink-green" />
        <span className="text-[13px] font-medium">#42 Add dark mode to the settings page</span>
        <span className="ml-auto flex items-center gap-1.5 text-[9.5px] text-subtle font-medium">
          <BrandMark brand="github" className="size-3.5" /> On GitHub
        </span>
      </div>
      <div className="flex items-center gap-4 px-4 py-3 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <GitBranch className="size-3.5" /> <span className="font-mono text-[11px]">{copilot ? "copilot/web-42-dark-mode" : "tf/web-42-dark-mode"}</span>
        </span>
        <span>3 files</span>
        <span className="text-ink-green">+84</span>
        <span className="text-ink-red">−12</span>
      </div>
      <ul className="border-t border-black/[0.06] px-4 py-2">
        {checks.map((c, i) => {
          const ok = step >= i + 2;
          return (
            <li key={c} className="flex h-[30px] items-center gap-2.5 text-[12px]">
              <AnimatePresence mode="popLayout" initial={false}>
                {ok ? (
                  <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
                    <Check className="size-3.5 text-ink-green" strokeWidth={2.6} />
                  </motion.span>
                ) : (
                  <motion.span key="run" exit={{ opacity: 0 }}>
                    <Loader2 className="size-3.5 animate-spin text-subtle" />
                  </motion.span>
                )}
              </AnimatePresence>
              {c}
              <span className={cn("ml-auto text-[11px]", ok ? "text-ink-green" : "text-subtle")}>{ok ? "passed" : "running"}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 border-t border-black/[0.06] px-4 py-3">
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          {copilot ? (
            <>
              <BrandMark brand="github-copilot" className="size-4" /> Opened by GitHub Copilot
            </>
          ) : (
            <>
              <BrandMark brand="claude-code" className="size-4" /> Run by Claude Code, opened by TaskForce
            </>
          )}
        </span>
        <motion.span
          className="ml-auto inline-flex h-8 items-center bg-primary px-3 text-[12px] font-medium text-white shadow-key rounded-lg"
          animate={step >= 4 ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={{ duration: 1.4, repeat: step >= 4 ? Infinity : 0 }}
        >
          Review
        </motion.span>
      </div>
    </motion.div>
  );
}

export function PrArt(props: Readonly<VProps>) {
  return <PrScene {...props} copilot={false} />;
}

export function PrCopilotArt(props: Readonly<VProps>) {
  return <PrScene {...props} copilot />;
}

/* ───────── Un commentaire quand il n'y a pas de code ───────── */

const COMMENT_STEPS = [600, 1400, 2800] as const;

export function CommentArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(COMMENT_STEPS, playing, reduce);
  return (
    <MiniWindow title="Marketing › MKT-8" className="inset-x-8 top-6 bottom-6" bodyClassName="p-5">
      <p className="text-[15px] font-medium tracking-[-0.015em]">Compare three onboarding emails</p>
      <p className="mt-1 text-[11.5px] text-muted-foreground">No repository on this project: the answer comes as a comment.</p>
      <div className="mt-4 flex gap-3">
        <BrandMark brand="claude-code" className="size-6" />
        <div className="min-w-0 flex-1 border border-black/[0.06] bg-white p-3.5 rounded-lg">
          <p className="flex items-center gap-2 text-[11.5px]">
            <span className="font-medium">Claude Code</span>
            <span className="text-subtle">commented</span>
          </p>
          <AnimatePresence mode="popLayout">
            {step < 1 ? (
              <motion.div key="typing" className="mt-2 flex gap-1" exit={{ opacity: 0 }}>
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="size-1.5 rounded-full bg-subtle" animate={{ y: [0, -3, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }} />
                ))}
              </motion.div>
            ) : (
              <motion.div key="text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
                <p className="text-[12px] font-medium">Summary</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {[200, 240, 170].map((w, i) => (
                    <li key={w} className="flex items-center gap-2">
                      <span className="size-1.5 shrink-0 rounded-full bg-shape-blue" />
                      <motion.span className="block h-[6px] origin-left bg-border" style={{ width: w }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.45, delay: 0.15 + i * 0.25, ease: EASE }} />
                    </li>
                  ))}
                </ul>
                <motion.p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-blue" initial={{ opacity: 0 }} animate={{ opacity: step >= 2 ? 1 : 0 }}>
                  <MessageSquare className="size-3.5" /> Recommendation: the second email
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </MiniWindow>
  );
}

/* ───────── C'est vous qui fusionnez ───────── */

const MERGE_STEPS = [700, 900, 300, 2800] as const;

export function MergeArt({ playing, reduce }: Readonly<VProps>) {
  const step = useSequence(MERGE_STEPS, playing, reduce);
  const merged = step >= 3;
  const cursor = step === 0 ? { x: 470, y: 360 } : { x: 210, y: 264 };
  return (
    <>
      <div className="absolute inset-x-12 top-[52px] bg-white shadow-float rounded-lg">
        <div className="flex items-center gap-2 border-b border-black/[0.06] bg-paper px-4 py-3">
          {merged ? <GitMerge className="size-4 text-ink-pink" /> : <GitPullRequest className="size-4 text-ink-green" />}
          <span className="text-[13px] font-medium">#42 Add dark mode to the settings page</span>
          <span className="ml-auto flex items-center gap-1.5 text-[9.5px] text-subtle font-medium">
            <BrandMark brand="github" className="size-3.5" /> On GitHub
          </span>
        </div>
        <div className="px-4 py-4">
          <p className="flex items-center gap-2 text-[12px]">
            <Check className="size-3.5 text-ink-green" strokeWidth={2.6} /> All checks passed
          </p>
          <p className="mt-2 flex items-center gap-2 text-[12px]">
            <Check className="size-3.5 text-ink-green" strokeWidth={2.6} /> Reviewed by you
          </p>
          <div className="mt-5 flex items-center gap-3">
            <motion.span
              animate={{ scale: step === 2 ? 0.94 : 1, backgroundColor: merged ? "#a3336c" : "#2f6bf6" }}
              transition={{ duration: 0.2 }}
              className="inline-flex h-9 items-center gap-1.5 px-4 text-[12.5px] font-medium text-white shadow-key"
            >
              <GitMerge className="size-4" /> {merged ? "Merged" : "Merge pull request"}
            </motion.span>
            <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Person /> Your call, always
            </span>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {merged && (
          <motion.div {...rise} className="absolute top-[300px] left-[48px] flex items-center gap-2 bg-white px-3 py-2.5 text-[11.5px] shadow-float rounded-lg">
            <GitCommitHorizontal className="size-3.5 text-subtle" /> Merged by you · TaskForce never merges for you
          </motion.div>
        )}
      </AnimatePresence>
      <Cursor x={cursor.x} y={cursor.y} press={step === 2} show={!reduce && !merged} />
    </>
  );
}
