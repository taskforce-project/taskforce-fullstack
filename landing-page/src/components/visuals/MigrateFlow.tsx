import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Download, FileJson, Lock } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Cursor, Fit, MiniWindow, useSequence } from "./vignettes/parts";
import { cn } from "@/lib/utils";

/**
 * Le trajet d'un projet de la webapp vers l'app desktop, en boucle : le menu Export de la webapp (libellés réels :
 * « Full project export », « JSON (full) »), le fichier qui traverse, l'import dans l'app où les issues arrivent.
 * Côte à côte sur grand écran, l'une sous l'autre sur téléphone. Données d'exemple. Mouvement réduit : l'état final.
 */

const STEPS = [700, 700, 800, 1300, 900, 3200] as const;

type Box = { left: number; top: number; width: number; height: number };
type Layout = {
  w: number;
  h: number;
  web: Box;
  app: Box;
  chip: { left: number; top: number; dx: number; dy: number };
  path: string;
  cursor: { rest: [number, number]; exportBtn: [number, number]; json: [number, number] };
};

const WIDE: Layout = {
  w: 1000,
  h: 420,
  web: { left: 0, top: 30, width: 380, height: 340 },
  app: { left: 620, top: 30, width: 380, height: 340 },
  chip: { left: 420, top: 183, dx: 120, dy: 0 },
  path: "M 400 200 C 470 200, 530 200, 600 200",
  cursor: { rest: [300, 330], exportBtn: [318, 88], json: [270, 186] },
};

const COMPACT: Layout = {
  w: 420,
  h: 640,
  web: { left: 20, top: 10, width: 380, height: 270 },
  app: { left: 20, top: 360, width: 380, height: 270 },
  chip: { left: 140, top: 296, dx: 0, dy: 34 },
  path: "M 210 282 L 210 358",
  cursor: { rest: [330, 250], exportBtn: [338, 68], json: [290, 166] },
};

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
  const menu = step >= 1 && step <= 2;
  const picked = step >= 2;
  const flying = step === 3;
  const imported = step >= 4;
  const [cx, cy] = step === 0 ? L.cursor.rest : step === 1 ? L.cursor.exportBtn : L.cursor.json;
  const rows = compact ? 3 : 4;

  return (
    <div ref={ref} className="relative">
      <div className="wash wash-sky flex justify-center rounded-2xl px-3 py-8 sm:px-8 sm:py-12">
        <div className="w-full" style={{ maxWidth: L.w }} aria-hidden="true">
          <Fit key={compact ? "c" : "w"} w={L.w} h={L.h}>
            {/* la webapp, dans un navigateur */}
            <div className="absolute overflow-hidden bg-white shadow-float rounded-xl" style={L.web}>
              <div className="flex h-8 items-center gap-2 border-b border-black/[0.06] bg-paper px-3">
                <span className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-rule" />
                  <span className="size-2.5 rounded-full bg-rule" />
                  <span className="size-2.5 rounded-full bg-rule" />
                </span>
                <span className="ml-2 flex h-5 flex-1 items-center gap-1.5 bg-white px-2 font-mono text-[9.5px] text-subtle shadow-[inset_0_0_0_1px_var(--border)]">
                  <Lock className="size-2.5" /> {host ?? "app.taskforce-project.fr"}
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium">Website</p>
                  <span className={cn("inline-flex h-7 items-center gap-1 border px-2 text-[11px]", menu ? "border-foreground/40" : "border-input")}>
                    <Download className="size-3" /> Export <ChevronDown className="size-3" />
                  </span>
                </div>
                <AnimatePresence>
                  {menu && (
                    <motion.div
                      className="absolute top-[78px] right-4 z-10 w-[190px] border border-black/[0.06] bg-white p-1 text-[11px] shadow-xl rounded-lg"
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      style={{ transformOrigin: "top right" }}
                    >
                      <p className="px-2 pt-1 pb-1.5 text-[10px] text-subtle">Full project export</p>
                      <p className="px-2 py-1.5">CSV (issues and details)</p>
                      <p className={cn("px-2 py-1.5 transition-colors", picked ? "bg-accent text-accent-foreground" : "")}>JSON (full)</p>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="mt-4 flex flex-col gap-2">
                  {ISSUES.slice(0, rows).map((it) => (
                    <div key={it.k} className="flex items-center gap-2 border border-black/[0.06] px-2.5 py-2 rounded-lg">
                      <span className="font-mono text-[9.5px] text-subtle">{it.k}</span>
                      <span className="truncate text-[11px]">{it.t}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[9px] text-subtle font-medium">The web app · closing</p>
              </div>
            </div>

            {/* le fichier qui traverse */}
            <svg className="absolute inset-0" viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden="true">
              <path d={L.path} fill="none" stroke="var(--ink-blue)" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="5 5" />
            </svg>
            <motion.div
              className="absolute z-10 flex items-center gap-1.5 bg-white px-2.5 py-2 font-mono text-[11px] shadow-lg"
              style={{ left: L.chip.left, top: L.chip.top }}
              initial={false}
              animate={{
                x: flying || imported ? L.chip.dx : 0,
                y: flying || imported ? L.chip.dy : 0,
                opacity: picked && !imported ? 1 : 0,
                scale: flying ? 1.05 : 1,
              }}
              transition={{ duration: flying ? 1.1 : 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <FileJson className="size-4 text-primary" /> WEB-export.json
            </motion.div>

            {/* l'app desktop */}
            <MiniWindow title="TaskForce" style={L.app} bodyClassName="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium">Website</p>
                <AnimatePresence>
                  {imported && (
                    <motion.span
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-1 bg-tint-green px-2 py-1 text-[9px] text-ink-green font-medium rounded-md"
                    >
                      <Check className="size-3" strokeWidth={3} /> Imported
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {ISSUES.slice(0, rows).map((it, i) => (
                  <motion.div
                    key={it.k}
                    className="flex items-center gap-2 border border-black/[0.06] px-2.5 py-2 rounded-lg"
                    initial={false}
                    animate={{ opacity: imported ? 1 : 0, y: imported ? 0 : 8 }}
                    transition={{ duration: 0.4, delay: imported ? 0.12 * i : 0, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className="font-mono text-[9.5px] text-subtle">{it.k}</span>
                    <span className="truncate text-[11px]">{it.t}</span>
                    <span className="ml-auto shrink-0 text-[9.5px] text-muted-foreground">{it.s}</span>
                  </motion.div>
                ))}
              </div>
              <motion.p
                className="mt-3 text-[10.5px] text-muted-foreground"
                initial={false}
                animate={{ opacity: imported ? 1 : 0 }}
                transition={{ delay: 0.6 }}
              >
                With their comments and their history
              </motion.p>
            </MiniWindow>
            <Cursor x={cx} y={cy} press={step === 1 || step === 2} show={!reduce && step <= 2} />
          </Fit>
        </div>
      </div>
    </div>
  );
}
