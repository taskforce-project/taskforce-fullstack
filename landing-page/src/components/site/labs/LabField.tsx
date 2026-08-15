import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LabField — signature #1 : le « champ expérimental » du hero Labs.
 *
 * Canvas 2D (aucune dépendance, aucun WebGL) : une trame de points sur grille qu'une
 * « sonde » éclaire par proximité. La sonde suit le curseur ; sans curseur (idle / tactile)
 * elle dérive en Lissajous pour que la page « respire ». GPU-friendly, DPR plafonné.
 *
 * Perf & a11y (brief §17/18) :
 *  - pause hors-écran (IntersectionObserver) et onglet caché (visibilitychange) ;
 *  - `prefers-reduced-motion` → une seule image statique, pas de rAF ;
 *  - pointeur grossier (tactile) → pas de suivi curseur, dérive ambiante seule ;
 *  - canvas `aria-hidden`, `pointer-events:none` — purement décoratif, le texte reste sélectionnable.
 *
 * Le petit panneau « Customize the field » (brief §8) ne touche QUE le visuel (motion/densité/grille),
 * jamais le contenu métier. Boutons réels, focus clavier, `aria-pressed`.
 */

type Density = "low" | "med" | "high";
const SPACING: Record<Density, number> = { low: 46, med: 34, high: 25 };

interface LabFieldProps {
  /** Affiche le panneau de réglages (hero du hub). */
  controls?: boolean;
  /** `calm` = variante posée pour les pages détail (rayon + densité réduits). */
  intensity?: "full" | "calm";
  className?: string;
}

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

export default function LabField({ controls = false, intensity = "full", className }: LabFieldProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [reduced, setReduced] = useState(false);
  const [motion, setMotion] = useState(true);
  const [density, setDensity] = useState<Density>(intensity === "calm" ? "low" : "med");
  const [grid, setGrid] = useState(true);

  // Suit le réglage OS de reduced-motion (peut changer en cours de session).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const R = intensity === "calm" ? 128 : 168; // rayon de la sonde

    let w = 0;
    let h = 0;
    type Pt = { x: number; y: number; phase: number };
    let pts: Pt[] = [];
    const probe = { x: 0, y: 0, tx: 0, ty: 0, active: false };
    let t = 0;
    let raf = 0;
    let running = false;

    const build = () => {
      const rect = wrap.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const step = SPACING[density];
      pts = [];
      for (let y = step * 0.5; y < h; y += step) {
        for (let x = step * 0.5; x < w; x += step) {
          pts.push({
            x: x + (Math.random() - 0.5) * step * 0.34,
            y: y + (Math.random() - 0.5) * step * 0.34,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
      if (probe.tx === 0 && probe.ty === 0) {
        probe.x = w / 2;
        probe.y = h * 0.42;
        probe.tx = probe.x;
        probe.ty = probe.y;
      }
    };

    const drawGrid = () => {
      const step = 30;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.035)";
      ctx.beginPath();
      for (let x = 0; x <= w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    };

    const draw = (moving: boolean) => {
      ctx.clearRect(0, 0, w, h);
      if (grid) drawGrid();

      if (moving && !probe.active) {
        const cx = w / 2;
        const cy = h * 0.42;
        probe.tx = cx + Math.cos(t * 0.34) * w * 0.28;
        probe.ty = cy + Math.sin(t * 0.52) * h * 0.24;
      }
      probe.x += (probe.tx - probe.x) * 0.08;
      probe.y += (probe.ty - probe.y) * 0.08;

      // Halo de la sonde (additif, discret — violet Labs)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(probe.x, probe.y, 0, probe.x, probe.y, R * 1.4);
      glow.addColorStop(0, "rgba(124,92,246,0.15)");
      glow.addColorStop(1, "rgba(124,92,246,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(probe.x, probe.y, R * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const near: { x: number; y: number; d: number }[] = [];
      for (const p of pts) {
        const breathe = moving ? Math.sin(t * 0.8 + p.phase) * 0.5 + 0.5 : 0.5;
        const dx = p.x - probe.x;
        const dy = p.y - probe.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const infl = Math.max(0, 1 - dist / R);
        const e = infl * infl;
        const a = Math.min(0.9, 0.1 + breathe * 0.05 + e * 0.82);
        const size = 1 + e * 2.2;
        if (e > 0.14 && near.length < 40) near.push({ x: p.x, y: p.y, d: dist });
        ctx.fillStyle =
          e > 0.02
            ? `rgba(${lerp(228, 167, e)},${lerp(230, 139, e)},${lerp(238, 250, e)},${a})`
            : `rgba(228,230,238,${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Liens de la sonde vers les points les plus proches — « l'instrument touche le champ »
      near.sort((n1, n2) => n1.d - n2.d);
      ctx.lineWidth = 1;
      for (const n of near.slice(0, 6)) {
        ctx.strokeStyle = `rgba(167,139,250,${(1 - n.d / R) * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(probe.x, probe.y);
        ctx.lineTo(n.x, n.y);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(196,181,253,0.9)";
      ctx.beginPath();
      ctx.arc(probe.x, probe.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    };

    const loop = () => {
      t += 0.016;
      draw(true);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      if (reduced || !motion) {
        draw(false);
        return;
      }
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    build();
    draw(false); // 1re image SYNCHRONE — le rAF peut être throttlé au 1er paint (ou preview non-composité)
    start();

    // ── Suivi curseur (jamais sur pointeur tactile) ──
    const onMove = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      probe.active = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      if (probe.active) {
        probe.tx = x;
        probe.ty = y;
        if (!running && !reduced && motion) start();
      }
    };
    const onLeave = () => {
      probe.active = false;
    };
    if (!coarse) {
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("mouseout", onLeave, { passive: true });
    }

    // ── Resize ──
    const ro = new ResizeObserver(() => {
      build();
      draw(false); // repaint immédiat, indépendant du rAF
    });
    ro.observe(wrap);

    // ── Pause hors-écran ──
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) start();
        else stop();
      },
      { threshold: 0 },
    );
    io.observe(wrap);

    // ── Pause onglet caché ──
    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      if (!coarse) {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseout", onLeave);
      }
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduced, motion, density, grid, intensity]);

  return (
    <>
      <div ref={wrapRef} aria-hidden className={cn("absolute inset-0", className)}>
        <canvas ref={canvasRef} className="block size-full" />
      </div>

      {controls && (
        <div className="labs-panel pointer-events-auto absolute right-4 bottom-4 z-20 hidden w-[210px] p-3 sm:block">
          <div className="mb-2.5 flex items-center gap-1.5">
            <SlidersHorizontal className="size-3 text-[color:var(--labs-violet)]" strokeWidth={2} />
            <span className="font-mono text-[9px] tracking-[0.16em] text-[color:var(--labs-muted)] uppercase">
              Customize the field
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <Seg
              label="Motion"
              value={reduced ? "off" : motion ? "on" : "off"}
              disabled={reduced}
              onChange={(v) => setMotion(v === "on")}
              options={[
                { label: "On", value: "on" },
                { label: "Off", value: "off" },
              ]}
            />
            <Seg
              label="Density"
              value={density}
              onChange={(v) => setDensity(v as Density)}
              options={[
                { label: "Low", value: "low" },
                { label: "Med", value: "med" },
                { label: "High", value: "high" },
              ]}
            />
            <Seg
              label="Grid"
              value={grid ? "on" : "off"}
              onChange={(v) => setGrid(v === "on")}
              options={[
                { label: "On", value: "on" },
                { label: "Off", value: "off" },
              ]}
            />
          </div>
        </div>
      )}
    </>
  );
}

function Seg({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[9px] tracking-[0.14em] text-[color:var(--labs-faint)] uppercase">
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        className="flex overflow-hidden rounded-md border border-[color:var(--labs-line)]"
      >
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={cn(
                "px-2 py-1 font-mono text-[10px] transition-colors",
                on
                  ? "bg-white/12 text-[color:var(--labs-fg)]"
                  : "text-[color:var(--labs-muted)] hover:text-[color:var(--labs-fg)]",
                disabled && "cursor-not-allowed opacity-40 hover:text-[color:var(--labs-muted)]",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
