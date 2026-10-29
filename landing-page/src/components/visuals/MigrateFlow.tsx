import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, KeyRound, Lock } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Cursor, Fit, MiniWindow, useSequence } from "./vignettes/parts";
import { cn } from "@/lib/utils";

/**
 * Le passage de la webapp à l'app desktop, en boucle : on se connecte dans le navigateur avec le compte de la webapp,
 * l'app voit qu'il a déjà des projets et propose de les rapatrier ; on accepte, ils arrivent sur l'ordinateur.
 * Côte à côte sur grand écran, l'un sous l'autre sur téléphone. Données d'exemple. Mouvement réduit : l'état final.
 */

const STEPS = [900, 900, 700, 1200, 900, 3200] as const;

type Box = { left: number; top: number; width: number; height: number };
type Layout = { w: number; h: number; web: Box; app: Box; path: string; chip: { left: number; top: number; dx: number; dy: number } };

const WIDE: Layout = {
  w: 1000,
  h: 420,
  web: { left: 0, top: 30, width: 380, height: 340 },
  app: { left: 620, top: 30, width: 380, height: 340 },
  path: "M 400 200 C 470 200, 530 200, 600 200",
  chip: { left: 430, top: 183, dx: 70, dy: 0 },
};

const COMPACT: Layout = {
  w: 420,
  h: 640,
  web: { left: 20, top: 10, width: 380, height: 270 },
  app: { left: 20, top: 360, width: 380, height: 270 },
  path: "M 210 282 L 210 358",
  chip: { left: 150, top: 296, dx: 0, dy: 30 },
};

/* Repères intérieurs, mesurés depuis le coin de chaque fenêtre : le curseur s'en sert dans les deux mises en page. */
const SIGN_IN = { x: 190, y: 185 };
const BRING = { x: 76, y: 141 };

const ISSUES = [
  { k: "WEB-42", t: "Add dark mode to the settings page", s: "In review" },
  { k: "WEB-44", t: "Empty state for search", s: "Todo" },
  { k: "API-17", t: "Rate limit the export", s: "In progress" },
  { k: "WEB-39", t: "Keyboard shortcuts page", s: "Done" },
];

export default function MigrateFlow({ host }: Readonly<{ host?: string }>) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCompact(e.contentRect.width < 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = compact ? COMPACT : WIDE;
  const step = useSequence(STEPS, inView, reduce);
  const signedIn = step >= 2;
  const asking = step >= 3 && step <= 4;
  const bringing = step === 4;
  const imported = step >= 5;
  const cursor: [number, number] =
    step <= 0
      ? [L.web.left + 300, L.web.top + 290]
      : step <= 2
        ? [L.web.left + SIGN_IN.x + 6, L.web.top + SIGN_IN.y + 4]
        : [L.app.left + BRING.x + 6, L.app.top + BRING.y + 4];
  const rows = compact ? 3 : 4;

  return (
    <div ref={ref} className="relative">
      <div className="wash wash-sky flex justify-center rounded-2xl px-3 py-8 sm:px-8 sm:py-12">
        <div className="w-full text-foreground" style={{ maxWidth: L.w }} aria-hidden="true">
          <Fit key={compact ? "c" : "w"} w={L.w} h={L.h}>
            {/* la connexion, dans le navigateur, avec le compte de la webapp */}
            <div className="absolute overflow-hidden rounded-xl bg-white shadow-float" style={L.web}>
              <div className="flex h-8 items-center gap-2 border-b border-black/[0.06] bg-paper px-3">
                <span className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-rule" />
                  <span className="size-2.5 rounded-full bg-rule" />
                  <span className="size-2.5 rounded-full bg-rule" />
                </span>
                <span className="ml-2 flex h-5 flex-1 items-center gap-1.5 rounded-md bg-white px-2 font-mono text-[9.5px] text-subtle shadow-[inset_0_0_0_1px_var(--border)]">
                  <Lock className="size-2.5" /> {host ?? "app.taskforce-project.fr"}
                </span>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                {signedIn ? (
                  <motion.div
                    key="done"
                    className="absolute inset-x-0 top-8 bottom-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <span className="flex size-10 items-center justify-center rounded-full bg-tint-green text-ink-green">
                      <Check className="size-5" strokeWidth={2.6} />
                    </span>
                    <p className="text-[14px] font-medium">You're signed in</p>
                    <p className="text-[11px] text-muted-foreground">You can go back to the TaskForce app.</p>
                  </motion.div>
                ) : (
                  <motion.div key="form" className="absolute inset-x-0 top-8 px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="mt-[18px] text-[14px] font-medium">Sign in to TaskForce</p>
                    <span className="absolute top-[52px] right-6 left-6 flex h-8 items-center rounded-md px-2.5 text-[11px] shadow-[inset_0_0_0_1px_var(--input)]">you@example.com</span>
                    <span className="absolute top-[92px] right-6 left-6 flex h-8 items-center rounded-md px-2.5 text-[12px] tracking-[0.2em] text-subtle shadow-[inset_0_0_0_1px_var(--input)]">
                      ••••••••••
                    </span>
                    <motion.span
                      className="absolute top-[136px] right-6 left-6 flex h-[34px] items-center justify-center rounded-md bg-primary text-[12px] font-medium text-white"
                      animate={{ scale: step === 2 ? 0.97 : 1 }}
                      transition={{ duration: 0.15 }}
                    >
                      Sign in
                    </motion.span>
                    <p className="absolute top-[184px] right-6 left-6 text-center text-[10.5px] text-muted-foreground">Same account as the web app</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* la connexion qui revient à l'app */}
            <svg className="absolute inset-0" viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden="true">
              <path d={L.path} fill="none" stroke="var(--ink-blue)" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="5 5" />
            </svg>
            <motion.div
              className="absolute z-10 flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-[11px] font-medium shadow-float"
              style={{ left: L.chip.left, top: L.chip.top }}
              initial={false}
              animate={{ x: step >= 3 ? L.chip.dx : 0, y: step >= 3 ? L.chip.dy : 0, opacity: step === 2 || step === 3 ? 1 : 0 }}
              transition={{ duration: step === 3 ? 0.9 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <KeyRound className="size-3.5 text-primary" /> Signed in
            </motion.div>

            {/* l'app desktop : elle attend, propose de rapatrier les projets, puis les montre */}
            <MiniWindow title="TaskForce" style={L.app} bodyClassName="p-4">
              <AnimatePresence mode="wait" initial={false}>
                {imported ? (
                  <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-medium">Website</p>
                      <span className="flex items-center gap-1 rounded-md bg-tint-green px-2 py-1 text-[9px] font-medium text-ink-green">
                        <Check className="size-3" strokeWidth={3} /> On this computer
                      </span>
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                      {ISSUES.slice(0, rows).map((it, i) => (
                        <motion.div
                          key={it.k}
                          className="flex items-center gap-2 rounded-md px-2.5 py-2 shadow-[inset_0_0_0_1px_rgb(25_23_21/0.06)]"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: 0.1 * i, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <span className="font-mono text-[9.5px] text-subtle">{it.k}</span>
                          <span className="truncate text-[11px]">{it.t}</span>
                          <span className="ml-auto shrink-0 text-[9.5px] text-muted-foreground">{it.s}</span>
                        </motion.div>
                      ))}
                    </div>
                    <p className="mt-3 text-[10.5px] text-muted-foreground">With their notes, history and attachments</p>
                  </motion.div>
                ) : asking ? (
                  <motion.div
                    key="ask"
                    className="rounded-lg bg-white p-3 shadow-float"
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <p className="text-[13px] font-medium">Welcome back</p>
                    <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                      2 workspaces and 3 projects, with their notes, are in the web app. Copy them to this computer?
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <motion.span
                        className={cn("inline-flex h-[30px] w-[112px] items-center justify-center rounded-md text-[11px] font-medium text-white", bringing ? "bg-primary-hover" : "bg-primary")}
                        animate={{ scale: bringing ? 0.96 : 1 }}
                        transition={{ duration: 0.15 }}
                      >
                        Copy everything
                      </motion.span>
                      <span className="inline-flex h-[30px] items-center rounded-md px-3 text-[11px] shadow-[inset_0_0_0_1px_var(--input)]">Choose</span>
                    </div>
                    <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-muted">
                      <motion.span
                        className="block h-full origin-left bg-primary"
                        initial={false}
                        animate={{ scaleX: bringing ? 1 : 0 }}
                        transition={{ duration: bringing ? 0.85 : 0, ease: "linear" }}
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="wait"
                    className="flex h-[200px] flex-col items-center justify-center gap-2 text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <span className="size-2 rounded-full bg-primary anim-pulse" />
                    <p className="text-[12px] font-medium">Sign in to continue</p>
                    <p className="text-[10.5px] text-muted-foreground">Your browser opened the sign-in page.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </MiniWindow>
            <Cursor x={cursor[0]} y={cursor[1]} press={step === 2 || step === 4} show={!reduce && step <= 4} />
          </Fit>
        </div>
      </div>
    </div>
  );
}
