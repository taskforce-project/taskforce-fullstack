import { useEffect, useRef, memo } from "react";

/**
 * DotField — nappe de points qui réagit au curseur (bulge + halo doux). Portage React Bits
 * (github.com/…/react-bits) adapté à TaskForce : couleurs de MARQUE (bleu, pas le violet par défaut),
 * fond transparent, `pointer-events-none` (à poser en absolute inset-0 derrière le contenu), et
 * respect de `prefers-reduced-motion` → une seule image figée, zéro RAF. Zéro dépendance (canvas natif).
 */

const TWO_PI = Math.PI * 2;

interface DotFieldProps {
  dotRadius?: number;
  dotSpacing?: number;
  cursorRadius?: number;
  bulgeStrength?: number;
  glowRadius?: number;
  gradientFrom?: string;
  gradientTo?: string;
  glowColor?: string;
}

const DotField = memo(function DotField({
  dotRadius = 1.6,
  dotSpacing = 15,
  cursorRadius = 460,
  bulgeStrength = 52,
  glowRadius = 150,
  // bleu de marque (var(--primary) #2563eb) en très faible alpha → texture subtile sur fond clair
  gradientFrom = "rgba(37, 99, 235, 0.26)",
  gradientTo = "rgba(37, 99, 235, 0.08)",
  glowColor = "rgba(37, 99, 235, 0.13)",
}: DotFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const dotsRef = useRef<Array<{ ax: number; ay: number; sx: number; sy: number }>>([]);
  const mouseRef = useRef({ x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 });
  const rafRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0, offsetX: 0, offsetY: 0 });
  const glowOpacity = useRef(0);
  const engagement = useRef(0);
  const propsRef = useRef({ dotRadius, dotSpacing, cursorRadius, bulgeStrength, gradientFrom, gradientTo });
  propsRef.current = { dotRadius, dotSpacing, cursorRadius, bulgeStrength, gradientFrom, gradientTo };
  const glowIdRef = useRef(`tf-dotfield-glow-${Math.round(dotSpacing * 1000 + dotRadius * 100)}`);

  useEffect(() => {
    const canvas = canvasRef.current;
    const glowEl = glowRef.current;
    if (!canvas || !canvas.parentElement) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let resizeTimer: ReturnType<typeof setTimeout>;

    function resize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(doResize, 100);
    }

    function doResize() {
      const rect = canvas.parentElement!.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h, offsetX: rect.left + window.scrollX, offsetY: rect.top + window.scrollY };
      buildDots(w, h);
    }

    function buildDots(w: number, h: number) {
      const p = propsRef.current;
      const step = p.dotRadius + p.dotSpacing;
      const cols = Math.floor(w / step);
      const rows = Math.floor(h / step);
      const padX = (w % step) / 2;
      const padY = (h % step) / 2;
      const dots = new Array(rows * cols);
      let idx = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const ax = padX + col * step + step / 2;
          const ay = padY + row * step + step / 2;
          dots[idx++] = { ax, ay, sx: ax, sy: ay };
        }
      }
      dotsRef.current = dots;
    }

    function paint(withMotion: boolean) {
      const dots = dotsRef.current;
      const m = mouseRef.current;
      const { w, h } = sizeRef.current;
      const p = propsRef.current;
      ctx!.clearRect(0, 0, w, h);
      const grad = ctx!.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, p.gradientFrom);
      grad.addColorStop(1, p.gradientTo);
      ctx!.fillStyle = grad;
      const cr = p.cursorRadius;
      const crSq = cr * cr;
      const rad = p.dotRadius / 2;
      const eng = engagement.current;
      ctx!.beginPath();
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        if (withMotion) {
          const dx = m.x - d.ax;
          const dy = m.y - d.ay;
          const distSq = dx * dx + dy * dy;
          if (distSq < crSq && eng > 0.01) {
            const dist = Math.sqrt(distSq);
            const t = 1 - dist / cr;
            const push = t * t * p.bulgeStrength * eng;
            const angle = Math.atan2(dy, dx);
            d.sx += (d.ax - Math.cos(angle) * push - d.sx) * 0.15;
            d.sy += (d.ay - Math.sin(angle) * push - d.sy) * 0.15;
          } else {
            d.sx += (d.ax - d.sx) * 0.1;
            d.sy += (d.ay - d.sy) * 0.1;
          }
          ctx!.moveTo(d.sx + rad, d.sy);
          ctx!.arc(d.sx, d.sy, rad, 0, TWO_PI);
        } else {
          ctx!.moveTo(d.ax + rad, d.ay);
          ctx!.arc(d.ax, d.ay, rad, 0, TWO_PI);
        }
      }
      ctx!.fill();
    }

    function onMouseMove(e: MouseEvent) {
      const s = sizeRef.current;
      mouseRef.current.x = e.pageX - s.offsetX;
      mouseRef.current.y = e.pageY - s.offsetY;
    }

    function updateMouseSpeed() {
      const m = mouseRef.current;
      const dx = m.prevX - m.x;
      const dy = m.prevY - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      m.speed += (dist - m.speed) * 0.5;
      if (m.speed < 0.001) m.speed = 0;
      m.prevX = m.x;
      m.prevY = m.y;
    }

    function tick() {
      const m = mouseRef.current;
      const targetEngagement = Math.min(m.speed / 5, 1);
      engagement.current += (targetEngagement - engagement.current) * 0.06;
      if (engagement.current < 0.001) engagement.current = 0;
      glowOpacity.current += (engagement.current - glowOpacity.current) * 0.08;
      if (glowEl) {
        glowEl.setAttribute("cx", String(m.x));
        glowEl.setAttribute("cy", String(m.y));
        glowEl.style.opacity = String(glowOpacity.current);
      }
      paint(true);
      rafRef.current = requestAnimationFrame(tick);
    }

    doResize();

    if (reduce) {
      paint(false);
      const staticResize = () => {
        doResize();
        paint(false);
      };
      window.addEventListener("resize", staticResize);
      return () => {
        clearTimeout(resizeTimer);
        window.removeEventListener("resize", staticResize);
      };
    }

    const speedInterval = setInterval(updateMouseSpeed, 20);
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(speedInterval);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        // fondu doux vers les bords (comme .decor-dots) → jamais de points « collés » au cadre
        WebkitMaskImage: "radial-gradient(115% 115% at 50% 42%, #000 52%, transparent 92%)",
        maskImage: "radial-gradient(115% 115% at 50% 42%, #000 52%, transparent 92%)",
      }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <defs>
          <radialGradient id={glowIdRef.current}>
            <stop offset="0%" stopColor={glowColor} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle
          ref={glowRef}
          cx="-9999"
          cy="-9999"
          r={glowRadius}
          fill={`url(#${glowIdRef.current})`}
          style={{ opacity: 0, willChange: "opacity" }}
        />
      </svg>
    </div>
  );
});

export default DotField;
