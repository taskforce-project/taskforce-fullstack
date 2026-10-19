import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  BarChart3,
  Brain,
  Check,
  ChevronDown,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Loader2,
  MousePointer2,
  Plus,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { BrandMark } from "./brand";
import { cn } from "@/lib/utils";

/**
 * Le héros : l'app desktop qui travaille toute seule, en boucle (environ 19 s). Le board, un curseur qui ouvre
 * WEB-42 (la caméra plonge dans l'issue), l'assigne à Claude Code, le run s'affiche en direct, l'agent demande à
 * lancer les tests, on clique Allow, la pull request arrive, puis la caméra recule sur le board où la carte passe
 * en revue. Libellés repris de l'app (statut « In review by AI », carte de validation, délai de 10 minutes).
 * Données d'exemple. Hors écran ou onglet caché : pause. Mouvement réduit : l'état final, immobile.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

// Les temps forts (ms depuis le début de la boucle).
const B = {
  BOARD: 0,
  TO_CARD: 1,
  PRESS_CARD: 2,
  ISSUE: 3,
  TO_ASSIGNEE: 4,
  MENU: 5,
  HOVER_CLAUDE: 6,
  ASSIGNED: 7,
  TL1: 8,
  TL2: 9,
  TL3: 10,
  TL4: 11,
  TL5: 12,
  APPROVAL: 13,
  TO_ALLOW: 14,
  PRESS_ALLOW: 15,
  ALLOWED: 16,
  TESTS: 17,
  COMMIT: 18,
  PR: 19,
  REVIEW: 20,
  BACK: 21,
  MOVE: 22,
  END: 23,
} as const;
const AT = [0, 700, 1550, 1800, 2900, 3550, 4050, 4700, 5300, 5900, 6500, 7100, 7700, 8500, 9500, 10250, 10450, 11100, 11700, 12400, 13000, 15200, 15900, 19000];
const FINAL = B.REVIEW; // état montré quand l'utilisateur réduit les animations

// Taille intérieure fixe de la scène (mise à l'échelle par CSS) et place de la fenêtre dedans.
const STAGE = { w: 1320, h: 800 };
const WIN = { x: 100, y: 54, w: 1120, h: 700 };
const COMPACT = { w: 560, h: 720 };

const TIMELINE: { beat: number; icon: "start" | "read" | "edit"; verb: string; detail: string }[] = [
  { beat: B.TL1, icon: "start", verb: "Run started", detail: "on its own branch" },
  { beat: B.TL2, icon: "read", verb: "Searched", detail: "Brain OS, found “Design tokens”" },
  { beat: B.TL3, icon: "read", verb: "Read", detail: "app/settings/page.tsx" },
  { beat: B.TL4, icon: "edit", verb: "Edit", detail: "styles/theme.css" },
  { beat: B.TL5, icon: "edit", verb: "Edit", detail: "app/settings/appearance.tsx" },
];

/* ───────────────────────────── horloge ───────────────────────────── */

function useBeat(playing: boolean, reduce: boolean) {
  const [beat, setBeat] = useState<number>(reduce ? FINAL : B.BOARD);
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (reduce) {
      setBeat(FINAL);
      return;
    }
    if (!playing) return;
    const next = beat >= B.END ? B.BOARD : beat + 1;
    const delay = next === B.BOARD ? 500 : AT[next] - AT[beat];
    const id = window.setTimeout(() => {
      if (next === B.BOARD) setCycle((c) => c + 1);
      setBeat(next);
    }, delay);
    return () => window.clearTimeout(id);
  }, [beat, playing, reduce]);
  return { beat, cycle };
}

/** Joue seulement quand la scène est à l'écran et l'onglet visible. */
function usePlaying(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ref]);
  return inView && visible;
}

/** Facteur d'échelle : la scène garde sa taille intérieure et se réduit pour tenir dans son conteneur. */
function useFit(ref: RefObject<HTMLElement | null>, width: number) {
  const [k, setK] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setK(Math.min(1, e.contentRect.width / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, width]);
  return k;
}

/* ───────────────────────────── petits éléments de l'app ───────────────────────────── */

type Status = "todo" | "progress" | "review";
const STATUS: Record<Status, { label: string; dot: string; cls: string }> = {
  todo: { label: "Todo", dot: "bg-subtle", cls: "bg-muted text-muted-foreground" },
  progress: { label: "In progress", dot: "bg-shape-yellow", cls: "bg-tint-yellow text-ink-yellow" },
  review: { label: "In review by AI", dot: "bg-shape-pink", cls: "bg-tint-pink text-ink-pink" },
};

function StatusPill({ status, big = false }: Readonly<{ status: Status; big?: boolean }>) {
  const s = STATUS[status];
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={status}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: EASE }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
          big ? "px-2.5 py-1 text-[11.5px]" : "px-2 py-0.5 text-[11px]",
          s.cls,
        )}
      >
        <span className={cn("size-1.5 rounded-full", s.dot)} />
        {s.label}
      </motion.span>
    </AnimatePresence>
  );
}

function Avatar({ initials, tone = "bg-shape-pink" }: Readonly<{ initials: string; tone?: string }>) {
  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[8.5px] font-semibold text-white", tone)}>
      {initials}
    </span>
  );
}

/* ───────────────────────────── barre latérale ───────────────────────────── */

function Sidebar({ running }: Readonly<{ running: boolean }>) {
  const nav = [
    { icon: LayoutDashboard, t: "Dashboard" },
    { icon: ListTodo, t: "My Queue", n: "2" },
    { icon: Inbox, t: "Inbox" },
    { icon: Brain, t: "Brain OS" },
    { icon: BarChart3, t: "Analytics" },
  ];
  return (
    <aside className="flex w-[208px] shrink-0 flex-col border-r border-black/[0.06] bg-paper p-3 text-[12.5px]">
      <div className="flex items-center gap-2 px-1.5 py-1">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[9px] font-semibold text-white">AC</span>
        <span className="font-medium">Acme</span>
        <ChevronDown className="ml-auto size-3.5 text-subtle" />
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-black/[0.06] bg-white px-2 py-1.5 text-subtle">
        <Search className="size-3.5" /> Search
        <span className="kbd ml-auto">Ctrl K</span>
      </div>
      <nav className="mt-4 flex flex-col gap-0.5">
        {nav.map((n) => (
          <span key={n.t} className="flex items-center gap-2 px-1.5 py-1.5 text-muted-foreground">
            <n.icon className="size-3.5" /> {n.t}
            {n.n && <span className="ml-auto font-mono text-[10px] text-subtle">{n.n}</span>}
          </span>
        ))}
      </nav>
      <p className="mt-5 px-1.5 text-[9.5px] text-subtle font-medium">Projects</p>
      <div className="mt-1.5 flex flex-col gap-0.5">
        {[
          { t: "Website", c: "bg-shape-blue", on: true },
          { t: "Mobile app", c: "bg-shape-green" },
          { t: "Billing API", c: "bg-shape-yellow" },
        ].map((p) => (
          <span key={p.t} className={cn("flex items-center gap-2 rounded-lg px-1.5 py-1.5", p.on ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>
            <span className={cn("size-2 rounded-full", p.c)} /> {p.t}
          </span>
        ))}
      </div>
      <div className="mt-auto border-t border-black/[0.06] pt-3">
        <p className="px-1.5 text-[9.5px] text-subtle font-medium">Agents</p>
        {[
          { brand: "claude-code" as const, t: "Claude Code", live: running },
          { brand: "github-copilot" as const, t: "GitHub Copilot", live: false },
        ].map((a) => (
          <span key={a.t} className="mt-1 flex items-center gap-2 px-1.5 py-1 text-muted-foreground">
            <BrandMark brand={a.brand} className="size-4" /> {a.t}
            <span className="relative ml-auto flex size-2">
              {a.live && <span className="anim-pulse-ring absolute inline-flex size-full rounded-full bg-shape-green" />}
              <span className={cn("relative inline-flex size-2 rounded-full", a.live ? "bg-shape-green" : "bg-rule")} />
            </span>
          </span>
        ))}
      </div>
    </aside>
  );
}

/* ───────────────────────────── le board ───────────────────────────── */

type Card = { key: string; title: string; label?: string; who: "me" | "claude-code" | "github-copilot" | null; pr?: boolean };

function BoardCard({ card, lifted = false, innerRef }: Readonly<{ card: Card; lifted?: boolean; innerRef?: RefObject<HTMLDivElement | null> }>) {
  return (
    <motion.div
      ref={innerRef}
      layout
      layoutId={card.key === "WEB-42" ? "web42" : undefined}
      transition={{ layout: { type: "spring", stiffness: 260, damping: 30 } }}
      animate={{ y: lifted ? -3 : 0, boxShadow: lifted ? "var(--shadow-lg)" : "var(--shadow-sm)" }}
      className={cn("rounded-lg border bg-white p-3", card.key === "WEB-42" ? "border-primary/40" : "border-black/[0.06]")}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-subtle">{card.key}</span>
        {card.pr && (
          <span className="flex items-center gap-1 bg-tint-green px-1.5 py-0.5 font-mono text-[9px] text-ink-green rounded-md">
            <GitPullRequest className="size-2.5" /> #42
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug font-medium">{card.title}</p>
      <div className="mt-2.5 flex items-center justify-between">
        {card.label ? <span className="bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground rounded-md">{card.label}</span> : <span />}
        {card.who === "me" && <Avatar initials="Y" />}
        {card.who && card.who !== "me" && <BrandMark brand={card.who} className="size-5" />}
      </div>
    </motion.div>
  );
}

function Board({ beat, cardRef }: Readonly<{ beat: number; cardRef: RefObject<HTMLDivElement | null> }>) {
  const where: Status = beat >= B.MOVE ? "review" : beat >= B.BACK ? "progress" : "todo";
  const web42: Card = {
    key: "WEB-42",
    title: "Add dark mode to the settings page",
    label: "Design",
    who: where === "todo" ? null : "claude-code",
    pr: where === "review",
  };
  const cols: { id: Status; name: string; cards: Card[] }[] = [
    {
      id: "todo",
      name: "Todo",
      cards: [
        ...(where === "todo" ? [web42] : []),
        { key: "WEB-44", title: "Empty state for search", label: "UX", who: null },
        { key: "API-17", title: "Rate limit the export", label: "API", who: "me" },
      ],
    },
    {
      id: "progress",
      name: "In progress",
      cards: [
        ...(where === "progress" ? [web42] : []),
        { key: "WEB-39", title: "Keyboard shortcuts page", label: "Docs", who: "me" },
        { key: "MOB-12", title: "Offline mode for notes", label: "Mobile", who: "github-copilot" },
      ],
    },
    {
      id: "review",
      name: "In review",
      cards: [
        ...(where === "review" ? [web42] : []),
        { key: "WEB-37", title: "Contrast fixes in the sidebar", label: "Design", who: "claude-code", pr: true },
      ],
    },
  ];
  const lifted = beat === B.TO_CARD || beat === B.PRESS_CARD;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-black/[0.06] px-6">
        <span className="text-[13px] font-medium">Website</span>
        <span className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5 text-[11.5px]">
          <span className="rounded-md bg-white px-2 py-0.5 shadow-sm">Board</span>
          <span className="px-2 py-0.5 text-muted-foreground">List</span>
          <span className="px-2 py-0.5 text-muted-foreground">Backlog</span>
        </span>
        <span className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-[11.5px] font-medium text-white">
          <Plus className="size-3.5" /> New issue
        </span>
      </div>
      <LayoutGroup>
        <div className="grid flex-1 grid-cols-3 gap-4 p-6">
          {cols.map((c) => (
            <div key={c.id} className="flex min-w-0 flex-col gap-2.5 rounded-lg bg-paper p-2.5">
              <p className="flex items-center gap-2 px-1 text-[12px] font-medium">
                <span className={cn("size-2 rounded-full", STATUS[c.id].dot)} />
                {c.name}
                <span className="font-mono text-[10.5px] text-subtle">{c.cards.length}</span>
              </p>
              {c.cards.map((card) => (
                <BoardCard key={card.key} card={card} lifted={card.key === "WEB-42" && lifted} innerRef={card.key === "WEB-42" ? cardRef : undefined} />
              ))}
            </div>
          ))}
        </div>
      </LayoutGroup>
    </div>
  );
}

/* ───────────────────────────── l'issue ───────────────────────────── */

function Row({ children, done, live }: Readonly<{ children: ReactNode; done?: boolean; live?: boolean }>) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="flex h-[30px] items-center gap-2.5 text-[12px]"
    >
      <span className="flex size-4 items-center justify-center">
        {live ? <Loader2 className="size-3.5 animate-spin text-primary" /> : done ? <Check className="size-3.5 text-ink-green" strokeWidth={2.6} /> : null}
      </span>
      {children}
    </motion.li>
  );
}

function IssueView({
  beat,
  compact,
  refs,
}: Readonly<{
  beat: number;
  compact: boolean;
  refs: { assignee: RefObject<HTMLSpanElement | null>; claude: RefObject<HTMLSpanElement | null>; allow: RefObject<HTMLSpanElement | null> };
}>) {
  const status: Status = beat >= B.REVIEW ? "review" : beat >= B.ASSIGNED ? "progress" : "todo";
  const assigned = beat >= B.ASSIGNED;
  const menu = beat >= B.MENU && beat < B.ASSIGNED;
  const rows = TIMELINE.filter((r) => beat >= r.beat);
  const lastRunBeat = beat >= B.APPROVAL ? -1 : rows.at(-1)?.beat;
  const approval = beat >= B.APPROVAL && beat < B.ALLOWED;
  const allowed = beat >= B.ALLOWED;

  const props = (
    <div className={cn("flex flex-col text-[12px]", compact ? "mt-5 border-y border-black/[0.06] py-2" : "w-[272px] shrink-0 border-l border-black/[0.06] pl-6")}>
      <div className="flex h-11 items-center justify-between border-b border-black/[0.06]">
        <span className="text-muted-foreground">Status</span>
        <StatusPill status={status} />
      </div>
      <div className="relative flex h-11 items-center justify-between border-b border-black/[0.06]">
        <span className="text-muted-foreground">Assignee</span>
        <span ref={refs.assignee} className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-white px-2 py-1">
          <AnimatePresence mode="popLayout" initial={false}>
            {assigned ? (
              <motion.span key="cc" className="inline-flex items-center gap-1.5" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                <BrandMark brand="claude-code" className="size-4" /> Claude Code
              </motion.span>
            ) : (
              <motion.span key="none" className="text-muted-foreground" exit={{ opacity: 0, x: -6 }}>
                Unassigned
              </motion.span>
            )}
          </AnimatePresence>
          <ChevronDown className="size-3 text-subtle" />
        </span>
        <AnimatePresence>
          {menu && (
            <motion.div
              className="absolute top-[42px] right-0 z-20 w-[236px] rounded-lg border border-black/[0.06] bg-white p-1 shadow-xl"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.15 } }}
              transition={{ duration: 0.25, ease: EASE }}
              style={{ transformOrigin: "top right" }}
            >
              <p className="px-2 pt-1 pb-1.5 text-[9px] text-subtle font-medium">Assign to</p>
              {[
                { t: "You", brand: null, ref: undefined },
                { t: "Claude Code", brand: "claude-code" as const, ref: refs.claude },
                { t: "GitHub Copilot", brand: "github-copilot" as const, ref: undefined },
              ].map((o) => {
                const hot = o.brand === "claude-code" && beat >= B.HOVER_CLAUDE;
                return (
                  <span key={o.t} ref={o.ref} className="relative flex h-[30px] items-center gap-2 px-2 text-[12px]">
                    {hot && <motion.span layoutId="assign-hl" className="absolute inset-0 rounded-lg bg-accent" transition={{ duration: 0.2 }} />}
                    <span className="relative">{o.brand ? <BrandMark brand={o.brand} className="size-4" /> : <Avatar initials="Y" />}</span>
                    <span className={cn("relative", hot && "text-accent-foreground")}>{o.t}</span>
                    {o.brand && <span className="relative ml-auto text-[9px] text-ink-green font-medium">Ready</span>}
                  </span>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex h-11 items-center justify-between border-b border-black/[0.06]">
        <span className="text-muted-foreground">Branch</span>
        <AnimatePresence mode="popLayout" initial={false}>
          {beat >= B.TL1 ? (
            <motion.span key="b" className="flex items-center gap-1 font-mono text-[10.5px]" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}>
              <GitBranch className="size-3 text-subtle" /> tf/web-42-dark-mode
            </motion.span>
          ) : (
            <motion.span key="n" className="text-subtle" exit={{ opacity: 0 }}>
              None yet
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {!compact && (
        <>
          <div className="flex h-11 items-center justify-between border-b border-black/[0.06]">
            <span className="text-muted-foreground">Labels</span>
            <span className="bg-muted px-1.5 py-0.5 text-[11px] rounded-md">Design</span>
          </div>
          <div className="flex h-11 items-center justify-between border-b border-black/[0.06]">
            <span className="text-muted-foreground">Priority</span>
            <span className="flex items-center gap-1.5 text-[11.5px]">
              <span className="flex items-end gap-px" aria-hidden="true">
                <span className="h-1.5 w-[3px] bg-foreground" />
                <span className="h-2.5 w-[3px] bg-foreground" />
                <span className="h-3.5 w-[3px] bg-foreground" />
              </span>
              High
            </span>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className={cn("flex h-full", compact ? "flex-col p-6" : "gap-8 p-8")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10.5px] text-subtle font-medium">Website › WEB-42</p>
          {compact && <StatusPill status={status} />}
        </div>
        <p className="mt-3 text-[22px] leading-tight font-medium tracking-[-0.025em]">Add dark mode to the settings page</p>
        <p className="mt-2.5 max-w-[520px] text-[13px] leading-relaxed text-muted-foreground">
          Follow the system theme by default, with a toggle in Settings. Colors come from the design tokens.
        </p>
        {compact && props}

        <p className="mt-7 flex items-center gap-2 text-[10px] text-subtle font-medium">
          Activity
          {beat >= B.TL1 && beat < B.REVIEW && (
            <span className="flex items-center gap-1 text-ink-green normal-case">
              <span className="size-1.5 rounded-full bg-shape-green" /> live
            </span>
          )}
        </p>
        <ul className="mt-2 flex flex-col">
          {beat < B.TL1 && (
            <li className="flex h-[30px] items-center gap-2.5 text-[12px] text-subtle">
              <span className="size-4" /> Created by you · 2 days ago
            </li>
          )}
          {rows.map((r) => (
            <Row key={r.beat} done={r.beat !== lastRunBeat} live={r.beat === lastRunBeat}>
              {r.icon === "edit" ? <Wrench className="size-3.5 text-subtle" /> : r.icon === "read" ? <FileText className="size-3.5 text-subtle" /> : <GitBranch className="size-3.5 text-subtle" />}
              <span className="font-medium">{r.verb}</span>
              <span className={cn("truncate text-muted-foreground", r.icon !== "start" && r.verb !== "Searched" && "font-mono text-[11px]")}>{r.detail}</span>
            </Row>
          ))}

          <AnimatePresence mode="popLayout">
            {approval && (
              <motion.li
                key="approval"
                layout
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="mt-2 mb-1 rounded-lg border border-black/[0.06] border-l-[3px] border-l-shape-yellow bg-white p-3 shadow-md"
              >
                <p className="flex items-center gap-2 text-[12.5px] font-medium">
                  <BrandMark brand="claude-code" className="size-4" /> Claude Code asks to run Bash
                </p>
                <p className="mt-2 bg-muted px-2 py-1 font-mono text-[11px] rounded-md">npm test -- settings</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <motion.span
                    ref={refs.allow}
                    animate={{ scale: beat === B.PRESS_ALLOW ? 0.93 : 1 }}
                    transition={{ duration: 0.12 }}
                    className="inline-flex h-7 items-center bg-primary px-3 text-[11.5px] font-medium text-white shadow-key rounded-lg"
                  >
                    Allow
                  </motion.span>
                  <span className="inline-flex h-7 items-center px-3 text-[11.5px] shadow-[inset_0_0_0_1px_var(--input)] rounded-lg">Deny</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">9 min left, then it is denied</span>
                </div>
                <div className="mt-2.5 h-[3px] bg-muted">
                  <motion.span
                    className="block h-full origin-left bg-shape-yellow"
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0.86 }}
                    transition={{ duration: 2, ease: "linear" }}
                  />
                </div>
              </motion.li>
            )}
          </AnimatePresence>

          {allowed && (
            <Row done>
              <ShieldCheck className="size-3.5 text-subtle" />
              <span className="font-medium">Bash</span>
              <span className="font-mono text-[11px] text-muted-foreground">npm test -- settings</span>
              <span className="text-muted-foreground">· Allowed by you</span>
            </Row>
          )}
          {beat >= B.TESTS && (
            <Row done>
              <Check className="size-3.5 text-subtle" />
              <span className="font-medium">Tests</span>
              <span className="text-ink-green">12 passed</span>
            </Row>
          )}
          {beat >= B.COMMIT && (
            <Row done>
              <GitCommitHorizontal className="size-3.5 text-subtle" />
              <span className="font-medium">Committed</span>
              <span className="text-muted-foreground">3 files on tf/web-42-dark-mode</span>
            </Row>
          )}
        </ul>

        <AnimatePresence>
          {beat >= B.PR && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="mt-4 overflow-hidden rounded-lg border border-black/[0.06] bg-white shadow-md"
            >
              <p className="flex items-center gap-2 border-b border-black/[0.06] bg-paper px-3 py-2.5 text-[12.5px] font-medium rounded-md">
                <GitPullRequest className="size-4 text-ink-green" /> Pull request #42 opened
                <span className="ml-auto font-mono text-[10px] font-normal text-subtle">ready for your review</span>
              </p>
              <p className="flex items-center gap-3 px-3 py-2.5 text-[12px] text-muted-foreground">
                3 files <span className="text-ink-green">+84</span> <span className="text-ink-red">−12</span>
                <span className="ml-auto inline-flex h-7 items-center gap-1 bg-primary px-3 text-[11.5px] font-medium text-white shadow-key rounded-lg">
                  <BrandMark brand="github" className="size-3.5 invert" /> Review on GitHub
                </span>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {!compact && props}
    </div>
  );
}

/* ───────────────────────────── badges flottants (hors fenêtre) ───────────────────────────── */

function Badge({ show, className, delay = "0s", children }: Readonly<{ show: boolean; className: string; delay?: string; children: ReactNode }>) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className={cn("absolute z-30", className)}
          initial={{ opacity: 0, y: 12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.25 } }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          <div
            className="anim-float flex items-center gap-2.5 rounded-full bg-white/95 px-4 py-2.5 text-[14px] whitespace-nowrap shadow-lg ring-1 ring-black/5 backdrop-blur"
            style={{ animationDelay: delay }}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ───────────────────────────── la scène ───────────────────────────── */

export default function HeroApp({ className }: Readonly<{ className?: string }>) {
  const reduce = useReducedMotion() ?? false;
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const playing = usePlaying(host);
  const fitWide = useFit(host, STAGE.w);
  const compact = fitWide !== null && fitWide * STAGE.w < 720;
  const size = compact ? COMPACT : STAGE;
  const k = fitWide === null ? null : compact ? Math.min(1, (fitWide * STAGE.w) / COMPACT.w) : fitWide;
  const { beat, cycle } = useBeat(playing, reduce);

  const cardRef = useRef<HTMLDivElement>(null);
  const assigneeRef = useRef<HTMLSpanElement>(null);
  const claudeRef = useRef<HTMLSpanElement>(null);
  const allowRef = useRef<HTMLSpanElement>(null);

  // le curseur : vers la cible du temps fort, mesurée dans la scène (coordonnées intérieures)
  const rest = compact ? { x: COMPACT.w - 70, y: COMPACT.h - 60 } : { x: WIN.x + WIN.w - 90, y: WIN.y + WIN.h - 70 };
  const [cursor, setCursor] = useState(rest);
  useLayoutEffect(() => {
    const target: RefObject<HTMLElement | null> | null =
      beat === B.TO_CARD || beat === B.PRESS_CARD
        ? cardRef
        : beat === B.TO_ASSIGNEE || beat === B.MENU
          ? assigneeRef
          : beat === B.HOVER_CLAUDE || beat === B.ASSIGNED
            ? claudeRef
            : beat === B.TO_ALLOW || beat === B.PRESS_ALLOW
              ? allowRef
              : null;
    const el = target?.current;
    const box = stage.current?.getBoundingClientRect();
    if (!el || !box || !k) {
      setCursor(rest);
      return;
    }
    const r = el.getBoundingClientRect();
    setCursor({ x: (r.left - box.left + r.width * 0.5) / k, y: (r.top - box.top + r.height * 0.55) / k });
    // « rest » est recalculé à chaque rendu : seules la page, l'échelle et le format relancent la mesure.
  }, [beat, k, compact]);

  const pressing = beat === B.PRESS_CARD || beat === B.ASSIGNED || beat === B.PRESS_ALLOW;
  const cursorShown = !reduce && beat >= B.TO_CARD && beat < B.BACK && !(compact && beat < B.ISSUE);
  const scene = compact ? "issue" : beat >= B.ISSUE && beat < B.BACK ? "issue" : "board";
  const running = beat >= B.TL1 && beat < B.REVIEW;

  const window_ = (
    <div className="absolute flex flex-col overflow-hidden rounded-xl bg-white shadow-window" style={compact ? { inset: 0 } : { left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h }}>
      <div className="flex h-9 shrink-0 items-center border-b border-black/[0.06] bg-paper px-3.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-3 rounded-full bg-shape-red/80" />
          <span className="size-3 rounded-full bg-shape-yellow/80" />
          <span className="size-3 rounded-full bg-shape-green/80" />
        </span>
        <span className="mx-auto pr-12 text-[10.5px] text-subtle font-medium">TaskForce</span>
      </div>
      <div className="flex min-h-0 flex-1">
        {!compact && <Sidebar running={running} />}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <AnimatePresence initial={false}>
            {scene === "board" ? (
              <motion.div
                key={`board-${cycle}-${beat >= B.BACK ? "back" : "start"}`}
                className="absolute inset-0"
                style={{ transformOrigin: "22% 26%" }}
                initial={beat >= B.BACK ? { opacity: 0, scale: 1.06 } : { opacity: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.4, transition: { duration: 0.55, ease: [0.5, 0, 0.75, 0] } }}
                transition={{ duration: 0.6, ease: EASE }}
              >
                <Board beat={beat} cardRef={cardRef} />
              </motion.div>
            ) : (
              <motion.div
                key={`issue-${cycle}`}
                className="absolute inset-0 bg-white"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.45, ease: [0.5, 0, 0.75, 0] } }}
                transition={{ duration: 0.55, ease: EASE, delay: compact ? 0 : 0.2 }}
              >
                <IssueView beat={beat} compact={compact} refs={{ assignee: assigneeRef, claude: claudeRef, allow: allowRef }} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* le message après « Allow », en bas à droite de la fenêtre */}
          <AnimatePresence>
            {beat >= B.ALLOWED && beat < B.COMMIT && (
              <motion.div
                className="absolute right-5 bottom-5 z-20 flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-[12.5px] text-white shadow-lg"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ type: "spring", stiffness: 340, damping: 28 }}
              >
                <Check className="size-4 text-shape-lime" strokeWidth={2.6} /> Allowed: the agent goes on
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={host}
      className={cn("relative w-full", className)}
      style={{ aspectRatio: `${size.w} / ${size.h}` }}
      role="img"
      aria-label="The TaskForce desktop app at work: an issue is assigned to Claude Code, the agent's steps appear live, it asks before running the tests, you allow it, and a pull request comes back for your review."
    >
      <div
        ref={stage}
        className="absolute top-0 left-0 origin-top-left transition-opacity duration-500"
        style={{ width: size.w, height: size.h, transform: `scale(${k ?? 1})`, opacity: k === null ? 0 : 1 }}
        aria-hidden="true"
      >
        {window_}

        {!compact && (
          <>
            <Badge show={running} className="top-[540px] left-0" delay="-1.2s">
              <BrandMark brand="claude-code" className="size-5" />
              <span className="font-medium">Claude Code</span>
              <span className="flex items-center gap-1.5 bg-tint-green px-1.5 py-0.5 text-[10px] text-ink-green font-medium rounded-md">
                <span className="size-1.5 rounded-full bg-shape-green" /> Running
              </span>
            </Badge>
            <Badge show={beat >= B.APPROVAL && beat < B.ALLOWED} className="top-[410px] right-0" delay="-3s">
              <span className="relative flex size-2.5">
                <span className="anim-pulse-ring absolute inline-flex size-full rounded-full bg-shape-yellow" />
                <span className="relative inline-flex size-2.5 rounded-full bg-shape-yellow" />
              </span>
              <span className="font-medium">Needs your approval</span>
            </Badge>
            <Badge show={beat >= B.PR && beat < B.END} className="top-[560px] right-[10px]" delay="-2.2s">
              <GitPullRequest className="size-4 text-ink-green" />
              <span className="font-medium">Pull request #42</span>
              <span className="text-muted-foreground">ready for review</span>
            </Badge>
          </>
        )}

        {/* le curseur */}
        <motion.div
          className="pointer-events-none absolute top-0 left-0 z-40"
          initial={false}
          animate={{ x: cursor.x, y: cursor.y, opacity: cursorShown ? 1 : 0, scale: pressing ? 0.86 : 1 }}
          transition={{
            x: { duration: 0.75, ease: EASE },
            y: { duration: 0.75, ease: EASE },
            opacity: { duration: 0.3 },
            scale: { duration: 0.12 },
          }}
        >
          <MousePointer2 className="size-6 -translate-x-1 -translate-y-1 fill-foreground text-white drop-shadow-md" strokeWidth={1.4} />
        </motion.div>
      </div>
    </div>
  );
}
