import { motion, type Transition } from "motion/react";
import { Check, FileJson, FileText, GitBranch, GitPullRequest, Lock, Search, Sparkles } from "lucide-react";

import type { MenuArt as ArtKey } from "@/lib/site";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/visuals/brand";

/**
 * Petites scènes animées des menus de l'en-tête (carte de droite, 280 × 208). Chacune boucle seule, en CSS
 * transformé par motion (opacity et transform seulement). Données d'exemple, libellés de l'app.
 */

const loop = (duration: number, times?: number[], extra?: Partial<Transition>): Transition => ({
  duration,
  times,
  repeat: Infinity,
  ease: "easeInOut",
  ...extra,
});

/** Une petite carte blanche posée sur le panneau pastel. */
function Sheet({
  className,
  style,
  children,
}: Readonly<{ className?: string; style?: React.CSSProperties; children: React.ReactNode }>) {
  return (
    <div className={cn("absolute rounded-lg bg-white shadow-float", className)} style={style}>
      {children}
    </div>
  );
}

function Line({ w, className }: Readonly<{ w: number; className?: string }>) {
  return <span className={cn("block h-[5px] bg-border", className)} style={{ width: w }} />;
}

function PlanArt() {
  const cols = ["Todo", "In progress", "Done"];
  return (
    <>
      {cols.map((c, i) => (
        <Sheet key={c} className="top-[34px] h-[142px] w-[76px] p-1.5" style={{ left: 18 + i * 86 }}>
          <p className="text-[7.5px] text-subtle font-medium">{c}</p>
          <div className="mt-1.5 flex flex-col gap-1">
            {Array.from({ length: i === 1 ? 1 : 2 }).map((_, k) => (
              <div key={k} className="h-[26px] border border-black/[0.06] bg-paper p-1 rounded-md">
                <Line w={40} />
                <Line w={26} className="mt-1" />
              </div>
            ))}
          </div>
        </Sheet>
      ))}
      {/* la carte qui avance d'une colonne à l'autre */}
      <motion.div
        className="absolute top-[86px] left-[24px] h-[30px] w-[64px] border border-primary bg-white p-1 shadow-md rounded-md"
        animate={{ x: [0, 0, 86, 86, 172, 172, 0], y: [0, -4, -4, 0, -4, 0, 0], opacity: [1, 1, 1, 1, 1, 1, 0] }}
        transition={loop(6.4, [0, 0.12, 0.36, 0.48, 0.72, 0.9, 1])}
      >
        <Line w={38} className="bg-primary/40" />
        <Line w={24} className="mt-1" />
      </motion.div>
    </>
  );
}

function AssignArt() {
  const rows = [
    { t: "You", agent: null },
    { t: "Claude Code", agent: "claude-code" as const },
    { t: "GitHub Copilot", agent: "github-copilot" as const },
  ];
  return (
    <Sheet className="top-[30px] left-[40px] w-[200px] p-1">
      <p className="px-2 pt-1 pb-1.5 text-[8px] text-subtle font-medium">Assign to</p>
      <div className="relative">
        <motion.span
          aria-hidden="true"
          className="absolute inset-x-0 h-[28px] bg-accent"
          animate={{ y: [0, 28, 28, 0] }}
          transition={loop(4.4, [0, 0.3, 0.8, 1])}
        />
        {rows.map((r) => (
          <p key={r.t} className="relative flex h-[28px] items-center gap-2 px-2 text-[11px]">
            {r.agent ? (
              <BrandMark brand={r.agent} className="size-4" />
            ) : (
              <span className="flex size-4 items-center justify-center rounded-full bg-shape-pink text-[7px] font-semibold text-white">
                Y
              </span>
            )}
            {r.t}
            {r.agent && <span className="ml-auto text-[8px] text-ink-green font-medium">Ready</span>}
          </p>
        ))}
      </div>
      <motion.p
        className="mt-1 flex items-center gap-1 border-t border-black/[0.06] px-2 pt-1.5 pb-1 text-[10px] text-ink-green"
        animate={{ opacity: [0, 0, 1, 1, 0] }}
        transition={loop(4.4, [0, 0.38, 0.48, 0.8, 1])}
      >
        <Check className="size-3" strokeWidth={3} /> Assigned to Claude Code
      </motion.p>
    </Sheet>
  );
}

function AskArt() {
  return (
    <>
      <Sheet className="top-[30px] right-[20px] bg-muted px-2.5 py-1.5 text-[10.5px] shadow-none rounded-md">What is blocking 2.1?</Sheet>
      <div className="absolute top-[70px] left-[20px] flex gap-1.5">
        <span className="flex size-5 shrink-0 items-center justify-center bg-primary text-white">
          <Sparkles className="size-3" />
        </span>
        <div className="w-[200px] bg-white p-2 shadow-float rounded-lg">
          <motion.div className="flex gap-1" animate={{ opacity: [1, 1, 0, 0, 1] }} transition={loop(5, [0, 0.18, 0.22, 0.95, 1])}>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="size-1.5 rounded-full bg-subtle"
                animate={{ y: [0, -2, 0] }}
                transition={loop(0.6, undefined, { delay: i * 0.12 })}
              />
            ))}
          </motion.div>
          {[150, 176, 120].map((w, i) => (
            <motion.span
              key={w}
              className="block h-[5px] origin-left bg-border"
              style={{ width: w, marginTop: i === 0 ? -6 : 6 }}
              animate={{ scaleX: [0, 0, 1, 1, 0] }}
              transition={loop(5, [0, 0.22 + i * 0.08, 0.34 + i * 0.08, 0.92, 1])}
            />
          ))}
          <motion.p
            className="mt-2 flex items-center gap-1 text-[8.5px] text-subtle"
            animate={{ opacity: [0, 0, 1, 1, 0] }}
            transition={loop(5, [0, 0.55, 0.62, 0.92, 1])}
          >
            <FileText className="size-2.5" /> Based on your board and your notes
          </motion.p>
        </div>
      </div>
    </>
  );
}

function ChartArt() {
  const pts = "0,70 30,62 60,66 90,48 120,52 150,34 180,38 210,18";
  return (
    <Sheet className="top-[34px] left-[20px] h-[140px] w-[240px] p-3">
      <p className="text-[8px] text-subtle font-medium">Weekly throughput</p>
      <svg viewBox="0 0 210 80" className="mt-2 h-[92px] w-full overflow-visible" aria-hidden="true">
        {[20, 40, 60, 80].map((y) => (
          <line key={y} x1="0" x2="210" y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
        ))}
        <motion.polyline
          points={pts}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          animate={{ pathLength: [0, 1, 1, 0] }}
          transition={loop(4.6, [0, 0.45, 0.88, 1])}
        />
        <motion.circle
          cx="210"
          cy="18"
          r="3.5"
          fill="var(--primary)"
          animate={{ scale: [0, 0, 1, 1, 0], opacity: [0, 0, 1, 1, 0] }}
          transition={loop(4.6, [0, 0.42, 0.5, 0.88, 1])}
        />
      </svg>
    </Sheet>
  );
}

function ConnectArt() {
  const around = [
    { brand: "github" as const, x: 40, y: 40 },
    { brand: "mcp" as const, x: 206, y: 40 },
    { brand: "plane" as const, x: 124, y: 150 },
  ];
  return (
    <>
      <svg className="absolute inset-0" viewBox="0 0 280 208" aria-hidden="true">
        {around.map((a, i) => (
          <g key={a.brand}>
            <line x1="140" y1="96" x2={a.x + 16} y2={a.y + 16} stroke="var(--rule)" strokeWidth="1.2" strokeDasharray="3 3" />
            <motion.circle
              r="2.5"
              fill="var(--primary)"
              animate={{ cx: [a.x + 16, 140], cy: [a.y + 16, 96], opacity: [0, 1, 0] }}
              transition={loop(2.4, undefined, { delay: i * 0.6, ease: "linear" })}
            />
          </g>
        ))}
      </svg>
      <span className="absolute top-[78px] left-[122px] flex size-9 items-center justify-center bg-primary font-mono text-[10px] font-semibold text-white shadow-md">
        TF
      </span>
      {around.map((a) => (
        <span key={a.brand} className="absolute flex size-8 items-center justify-center bg-white p-1.5 shadow-float rounded-md" style={{ left: a.x, top: a.y }}>
          <BrandMark brand={a.brand} className="size-full" />
        </span>
      ))}
    </>
  );
}

function PaletteArt() {
  const rows = ["Create issue", "Go to My Queue", "Ask AI", "Switch to dark mode"];
  return (
    <Sheet className="top-[28px] left-[30px] w-[220px]">
      <p className="flex items-center gap-1.5 border-b border-black/[0.06] px-2.5 py-2 text-[10px] text-subtle">
        <Search className="size-3" /> Type a command
      </p>
      <div className="relative p-1">
        <motion.span
          aria-hidden="true"
          className="absolute inset-x-1 top-1 h-[26px] bg-accent"
          animate={{ y: [0, 26, 52, 78, 0] }}
          transition={loop(5.6, [0, 0.25, 0.5, 0.75, 1], { ease: [0.22, 1, 0.36, 1] })}
        />
        {rows.map((r) => (
          <p key={r} className="relative flex h-[26px] items-center px-2 text-[10.5px]">
            {r}
          </p>
        ))}
      </div>
    </Sheet>
  );
}

function RunArt() {
  const steps = ["Assign", "Context", "Branch", "Approve", "Review"];
  return (
    <div className="absolute inset-x-[22px] top-[72px]">
      <div className="relative h-px bg-rule">
        <motion.span
          className="absolute inset-y-[-1px] left-0 h-[3px] origin-left bg-primary"
          style={{ width: "100%" }}
          animate={{ scaleX: [0, 1, 1, 0] }}
          transition={loop(5.5, [0, 0.7, 0.92, 1], { ease: "linear" })}
        />
      </div>
      <div className="relative -mt-[7px] flex justify-between">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-col items-center gap-2">
            <motion.span
              className="size-[13px] rounded-full border-2 border-rule bg-white"
              animate={{ backgroundColor: ["#ffffff", "#ffffff", "#2f6bf6", "#2f6bf6", "#ffffff"], borderColor: ["#d9d6d0", "#d9d6d0", "#2f6bf6", "#2f6bf6", "#d9d6d0"] }}
              transition={loop(5.5, [0, 0.14 * i + 0.02, 0.14 * i + 0.06, 0.92, 1], { ease: "linear" })}
            />
            <span className="text-[8px] text-muted-foreground font-medium">{s}</span>
          </div>
        ))}
      </div>
      <Sheet className="top-[60px] left-[30px] flex items-center gap-1.5 px-2 py-1.5 text-[9.5px]">
        <GitPullRequest className="size-3 text-ink-green" /> Pull request #42 · ready for your review
      </Sheet>
    </div>
  );
}

function LimitsArt() {
  const rows = [
    { t: "Read, edit and commit", s: "Allowed", c: "text-ink-green" },
    { t: "Run a command", s: "Asks you", c: "text-ink-yellow" },
    { t: "Push or delete", s: "Never", c: "text-ink-red" },
  ];
  return (
    <Sheet className="top-[38px] left-[24px] w-[232px]">
      {rows.map((r, i) => (
        <motion.p
          key={r.t}
          className="flex items-center gap-2 border-b border-black/[0.06] px-2.5 py-2.5 text-[10.5px] last:border-b-0"
          animate={{ opacity: [0.35, 1, 1, 0.35] }}
          transition={loop(4.5, [0, 0.12 + i * 0.18, 0.85, 1])}
        >
          {i === 2 ? <Lock className="size-3 text-subtle" /> : <Check className="size-3 text-subtle" />}
          {r.t}
          <span className={cn("ml-auto text-[8px] font-medium", r.c)}>{r.s}</span>
        </motion.p>
      ))}
    </Sheet>
  );
}

function ApprovalArt() {
  return (
    <Sheet className="top-[30px] left-[26px] w-[228px] border-l-2 border-shape-yellow p-2.5">
      <p className="flex items-center gap-1.5 text-[10.5px] font-medium">
        <BrandMark brand="claude-code" className="size-3.5" /> Claude Code asks to run Bash
      </p>
      <p className="mt-1.5 bg-muted px-1.5 py-1 font-mono text-[9px] rounded-md">npm test -- settings</p>
      <div className="mt-2 h-[3px] bg-muted">
        <motion.span
          className="block h-full origin-left bg-shape-yellow"
          animate={{ scaleX: [1, 0.55, 0.55, 1] }}
          transition={loop(4.4, [0, 0.5, 0.95, 1], { ease: "linear" })}
        />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <motion.span
          className="inline-flex h-[22px] items-center bg-primary px-2 text-[10px] font-medium text-white"
          animate={{ scale: [1, 1, 0.92, 1, 1] }}
          transition={loop(4.4, [0, 0.5, 0.54, 0.58, 1])}
        >
          Allow
        </motion.span>
        <span className="inline-flex h-[22px] items-center px-2 text-[10px] shadow-[inset_0_0_0_1px_var(--input)]">Deny</span>
        <motion.span
          className="ml-auto flex items-center gap-1 text-[9px] text-ink-green"
          animate={{ opacity: [0, 0, 1, 1, 0] }}
          transition={loop(4.4, [0, 0.56, 0.62, 0.95, 1])}
        >
          <Check className="size-3" strokeWidth={3} /> Allowed
        </motion.span>
      </div>
    </Sheet>
  );
}

function PrArt() {
  return (
    <>
      <motion.div
        className="absolute top-[34px] left-[26px] w-[228px] bg-white shadow-float rounded-lg"
        animate={{ y: [14, 0, 0, 14], opacity: [0, 1, 1, 0] }}
        transition={loop(4.8, [0, 0.16, 0.86, 1])}
      >
        <p className="flex items-center gap-1.5 border-b border-black/[0.06] bg-paper px-2.5 py-2 text-[10.5px] font-medium rounded-md">
          <GitPullRequest className="size-3 text-ink-green" /> #42 Add dark mode
        </p>
        <p className="flex items-center gap-2 px-2.5 py-2 text-[9.5px] text-muted-foreground">
          3 files <span className="text-ink-green">+84</span> <span className="text-ink-red">−12</span>
          <span className="ml-auto inline-flex h-[20px] items-center bg-primary px-1.5 text-[9.5px] font-medium text-white">Review</span>
        </p>
      </motion.div>
      <span className="absolute top-[128px] left-[26px] flex items-center gap-1.5 bg-white px-2 py-1.5 text-[9.5px] shadow-float rounded-md">
        <BrandMark brand="github-copilot" className="size-3.5" /> Opened by GitHub Copilot
      </span>
    </>
  );
}

function DownloadArt() {
  const oses = ["macOS", "Windows", "Linux"];
  return (
    <>
      {oses.map((o, i) => (
        <motion.span
          key={o}
          className="absolute top-[44px] flex h-[64px] w-[70px] flex-col items-center justify-center gap-1 bg-white text-[10px] shadow-float rounded-lg"
          style={{ left: 26 + i * 80 }}
          animate={{ y: [0, -5, 0] }}
          transition={loop(3, undefined, { delay: i * 0.25 })}
        >
          <span className="size-2 rounded-full bg-primary" />
          {o}
        </motion.span>
      ))}
      <Sheet className="top-[132px] left-[26px] w-[228px] px-2.5 py-2">
        <p className="text-[9.5px] text-muted-foreground">TaskForce for your system</p>
        <div className="mt-1.5 h-[4px] bg-muted">
          <motion.span className="block h-full origin-left bg-primary" animate={{ scaleX: [0, 1, 1] }} transition={loop(3.6, [0, 0.8, 1])} />
        </div>
      </Sheet>
    </>
  );
}

function ReleasesArt() {
  const rows = [
    { v: "Latest", d: "Agents ask before acting" },
    { v: "Previous", d: "Whole workspaces, web to desktop" },
    { v: "Earlier", d: "Analytics: workload" },
  ];
  return (
    <Sheet className="top-[34px] left-[26px] w-[228px]">
      {rows.map((r, i) => (
        <motion.p
          key={r.v}
          className="flex items-center gap-2 border-b border-black/[0.06] px-2.5 py-2.5 text-[10px] last:border-b-0"
          animate={{ x: [8, 0, 0, 8], opacity: [0, 1, 1, 0] }}
          transition={loop(4.6, [0, 0.12 + i * 0.1, 0.86, 1])}
        >
          <span className={cn("text-[8px] font-medium", i === 0 ? "text-ink-blue" : "text-subtle")}>{r.v}</span>
          <span className="text-muted-foreground">{r.d}</span>
        </motion.p>
      ))}
    </Sheet>
  );
}

function MigrateArt() {
  return (
    <>
      <Sheet className="top-[64px] left-[150px] h-[92px] w-[110px] p-2">
        <p className="text-[7.5px] text-subtle font-medium">TaskForce</p>
        <Line w={70} className="mt-2" />
        <Line w={52} className="mt-1.5" />
        <Line w={62} className="mt-1.5" />
        <motion.p
          className="mt-2 flex items-center gap-1 text-[9px] text-ink-green"
          animate={{ opacity: [0, 0, 1, 1, 0] }}
          transition={loop(4.6, [0, 0.55, 0.62, 0.9, 1])}
        >
          <Check className="size-3" strokeWidth={3} /> Imported
        </motion.p>
      </Sheet>
      <motion.span
        className="absolute top-[86px] left-[20px] flex items-center gap-1 bg-white px-2 py-1.5 font-mono text-[9px] shadow-float rounded-md"
        animate={{ x: [0, 0, 112, 112, 0], opacity: [1, 1, 1, 0, 0], scale: [1, 1, 0.85, 0.85, 1] }}
        transition={loop(4.6, [0, 0.15, 0.5, 0.56, 1])}
      >
        <FileJson className="size-3 text-primary" /> WEB-export.json
      </motion.span>
    </>
  );
}

function SourceArt() {
  return (
    <Sheet className="top-[30px] left-[26px] w-[228px] p-2.5">
      <p className="flex items-center gap-1.5 text-[10.5px] font-medium">
        <BrandMark brand="github" className="size-3.5" /> taskforce-fullstack
        <span className="ml-auto bg-tint-sky px-1.5 py-0.5 text-[8px] text-ink-sky font-medium rounded-md">AGPL-3.0</span>
      </p>
      <div className="mt-2.5 flex flex-col gap-1.5 bg-paper p-2 font-mono text-[8.5px] text-muted-foreground">
        {["frontend/", "backend/", "taskforce-runner/", "landing-page/"].map((d, i) => (
          <motion.p
            key={d}
            className="flex items-center gap-1"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={loop(3.2, undefined, { delay: i * 0.4 })}
          >
            <GitBranch className="size-2.5" /> {d}
          </motion.p>
        ))}
      </div>
    </Sheet>
  );
}

const ARTS: Record<ArtKey, () => React.ReactElement> = {
  plan: PlanArt,
  assign: AssignArt,
  ask: AskArt,
  chart: ChartArt,
  connect: ConnectArt,
  palette: PaletteArt,
  run: RunArt,
  limits: LimitsArt,
  approval: ApprovalArt,
  pr: PrArt,
  download: DownloadArt,
  releases: ReleasesArt,
  migrate: MigrateArt,
  source: SourceArt,
};

export function MenuArt({ art }: Readonly<{ art: ArtKey }>) {
  const Art = ARTS[art];
  return (
    <div className="relative h-[208px] w-[280px]" aria-hidden="true">
      <Art />
    </div>
  );
}
