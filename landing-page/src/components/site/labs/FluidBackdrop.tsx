import { useEffect, useRef } from "react";

/**
 * FluidBackdrop - fond « verre liquide » fluide (retour user : style Microsoft 365, glassmorphisme).
 *
 * WebGL2 BRUT, zéro dépendance (comme LabField / RetroGrid - pas d'ogl/three, safe Docker) : un
 * dégradé domain-warpé (bruit simplex) qui coule lentement, palette sombre → violet/bleu/cyan/magenta.
 * Le tiers gauche est assombri par le shader pour garder le texte du hero lisible. Le curseur pose une
 * lueur douce. Rendu à résolution réduite (dégradé basse fréquence → invisible) pour la perf.
 *
 * Perf & a11y : DPR/echelle plafonnés, pause hors-écran (IO) + onglet caché, `prefers-reduced-motion`
 * → une image statique (pas de rAF), pointeur grossier → pas de suivi curseur (dérive ambiante seule).
 * Canvas `aria-hidden`, décoratif.
 */

const VERT = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uCalm;

out vec4 fragColor;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * snoise(p); p *= 2.0; a *= 0.5; }
  return s;
}

vec3 palette(float t) {
  vec3 c1 = vec3(0.035, 0.040, 0.090); // encre
  vec3 c2 = vec3(0.360, 0.200, 0.720); // violet
  vec3 c3 = vec3(0.140, 0.340, 0.860); // bleu
  vec3 c4 = vec3(0.160, 0.740, 0.860); // cyan
  vec3 c5 = vec3(0.860, 0.440, 0.820); // magenta
  vec3 col = mix(c1, c2, smoothstep(0.00, 0.30, t));
  col = mix(col, c3, smoothstep(0.28, 0.52, t));
  col = mix(col, c4, smoothstep(0.52, 0.72, t));
  col = mix(col, c5, smoothstep(0.72, 1.00, t));
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = uv * vec2(uResolution.x / uResolution.y, 1.0) * 1.6;
  float t = uTime * 0.05;

  // Domain warp - donne l'écoulement « satin / verre liquide ».
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 1.6 * q + vec2(1.7, 9.2) + 0.12 * t),
                fbm(p + 1.6 * q + vec2(8.3, 2.8) - 0.10 * t));
  float f = fbm(p + 2.2 * r);

  float mixv = clamp(f * 0.5 + 0.55, 0.0, 1.0);
  vec3 col = palette(mixv);
  col += 0.06 * vec3(0.6, 0.5, 0.9) * length(r) * 0.5;

  // Lueur douce sous le curseur.
  float d = distance(uv, uMouse);
  col += 0.10 * exp(-d * 3.5) * vec3(0.55, 0.45, 0.95);

  // Assombrit le tiers gauche → lisibilité du H1.
  col *= mix(0.26, 1.0, smoothstep(0.02, 0.62, uv.x));
  // Reste sombre/glacé (pas néon).
  col = mix(vec3(0.020, 0.025, 0.050), col, 0.9 - 0.15 * uCalm);

  fragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

interface FluidBackdropProps {
  /** `calm` = variante posée (pages détail) : plus lent, un poil plus sombre, résolution moindre. */
  variant?: "full" | "calm";
  className?: string;
}

export default function FluidBackdrop({ variant = "full", className }: FluidBackdropProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const calm = variant === "calm";
    const scale = calm ? 0.45 : coarse ? 0.5 : 0.58; // rendu sous-échantillonné (dégradé lisse)

    const vert = compile(gl, gl.VERTEX_SHADER, VERT);
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vert || !frag) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "uTime");
    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uMouse = gl.getUniformLocation(program, "uMouse");
    const uCalm = gl.getUniformLocation(program, "uCalm");
    gl.uniform1f(uCalm, calm ? 1.0 : 0.0);

    const mouse = { x: 0.7, y: 0.5, tx: 0.7, ty: 0.5 };
    let w = 0, h = 0, t = 0, raf = 0, running = false;
    let isReduced = media.matches;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width * scale));
      h = Math.max(1, Math.floor(rect.height * scale));
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uResolution, w, h);
    };

    const draw = () => {
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = () => {
      t += calm ? 0.010 : 0.016;
      draw();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      if (isReduced) { draw(); return; }
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    resize();
    draw(); // 1re image synchrone (rAF parfois throttlé au 1er paint)
    start();

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
        mouse.tx = x;
        mouse.ty = y;
        if (!running && !isReduced) start();
      }
    };
    if (!coarse) window.addEventListener("mousemove", onMove, { passive: true });

    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(wrap);
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) start(); else stop(); },
      { threshold: 0 },
    );
    io.observe(wrap);
    const onVis = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", onVis);
    const onReduce = () => { isReduced = media.matches; if (isReduced) { stop(); draw(); } else start(); };
    media.addEventListener("change", onReduce);

    return () => {
      stop();
      if (!coarse) window.removeEventListener("mousemove", onMove);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      media.removeEventListener("change", onReduce);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [variant]);

  return (
    <div ref={wrapRef} aria-hidden className={className ?? "absolute inset-0"}>
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
