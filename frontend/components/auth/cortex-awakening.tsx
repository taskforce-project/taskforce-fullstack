"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * « Cortex — white cinematic intro ».
 *
 * Direction : *white product visualization*, PAS *AI animation*. Fond blanc pur, énormément de vide,
 * une forme abstraite 3D qui se **construit** (un trait dessine la structure → des éléments mats
 * s'assemblent → stabilisation + légère respiration → dissolution vers l'interface). Aucun néon,
 * aucune particule, aucun fond sombre. Blanc / gris clair / graphite + une seule couleur d'accent
 * (le noyau), ombres studio très douces, matériaux mats.
 *
 * Rendu Canvas 2D (projection 3D maison) : autonome, thémable, CSP-safe, réutilisable ailleurs
 * (login, onboarding, splash, empty states). Joue **une fois** puis appelle {@link onDone}
 * — l'animation EST la transition (pas d'écran de chargement intercalé).
 */
type V3 = { x: number; y: number; z: number; core?: boolean }
type Strut = [number, number, number] // [i, j, ordre de tracé normalisé]

function buildNodes(): V3[] {
  const a: V3[] = []
  const P = 15
  for (let i = 0; i < P; i++) {
    const y = 1 - (i / (P - 1)) * 2
    const rad = Math.sqrt(Math.max(0, 1 - y * y))
    const th = i * 2.399963 // angle d'or → répartition organique
    a.push({ x: Math.cos(th) * rad * 0.92, y: y * 1.02, z: Math.sin(th) * rad * 0.92 })
  }
  a.push({ x: 0, y: 0, z: 0, core: true }) // noyau (seul accent coloré)
  return a
}

function buildStruts(nodes: V3[]): Strut[] {
  const raw: Array<[number, number]> = []
  for (let i = 0; i < nodes.length; i++) {
    const ds: Array<[number, number]> = []
    for (let j = 0; j < nodes.length; j++) if (j !== i) {
      const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, dz = nodes[i].z - nodes[j].z
      ds.push([dx * dx + dy * dy + dz * dz, j])
    }
    ds.sort((u, v) => u[0] - v[0])
    for (let k = 0; k < 2; k++) { const j = ds[k][1]; if (j > i) raw.push([i, j]) }
  }
  for (let i = 0; i < nodes.length; i++) { if (nodes[i].core) continue; if (i % 3 === 0) raw.push([i, nodes.length - 1]) }
  raw.sort((u, v) => (nodes[u[0]].y + nodes[u[1]].y) - (nodes[v[0]].y + nodes[v[1]].y))
  return raw.map((s, i) => [s[0], s[1], raw.length > 1 ? i / (raw.length - 1) : 0])
}

const N3 = buildNodes()
const STRUTS = buildStruts(N3)

const easeIO = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const FULL_MS = 4800
const MICRO_MS = 1200

interface Env { build: number; solid: number; dissolve: number; scale: number; breathe: number; seed: number }
function envelope(p: number): Env {
  if (p < 0.09) return { build: 0, solid: 0, dissolve: 0, scale: 1, breathe: 1, seed: easeOut(p / 0.09) }
  if (p < 0.40) { const u = (p - 0.09) / 0.31; return { build: easeOut(u), solid: clamp((u - 0.45) / 0.55, 0, 1), dissolve: 0, scale: 1, breathe: 1, seed: 1 - u } }
  if (p < 0.62) { const u = (p - 0.40) / 0.22; return { build: 1, solid: lerp(0.5, 1, easeOut(u)), dissolve: 0, scale: 1, breathe: 1, seed: 0 } }
  if (p < 0.82) { const u = (p - 0.62) / 0.20; return { build: 1, solid: 1, dissolve: 0, scale: 1, breathe: 1 + 0.014 * Math.sin(u * Math.PI * 2), seed: 0 } }
  const u = (p - 0.82) / 0.18
  return { build: 1, solid: 1, dissolve: easeIO(u), scale: 1 + 0.17 * easeIO(u), breathe: 1, seed: 0 }
}

export function CortexAwakening({
  variant = "full",
  onDone,
  skippable = true,
}: {
  readonly variant?: "full" | "micro"
  readonly onDone?: () => void
  readonly skippable?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(false)
  const [showSkip, setShowSkip] = useState(false)

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    onDone?.()
  }, [onDone])

  useEffect(() => {
    const skipTimer = window.setTimeout(() => setShowSkip(true), variant === "micro" ? 400 : 1100)
    const wrap = wrapRef.current, canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let W = 0, H = 0, raf = 0
    const resize = () => {
      const r = wrap.getBoundingClientRect()
      W = Math.max(1, r.width); H = Math.max(1, r.height)
      const DPR = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = W * DPR; canvas.height = H * DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    }
    const ro = new ResizeObserver(resize); ro.observe(wrap); resize()

    const dur = variant === "micro" ? MICRO_MS : FULL_MS
    const p0 = variant === "micro" ? 0.5 : 0 // micro : démarre déjà assemblé
    const start = performance.now()

    const project = (n: V3, ang: number, tilt: number, S: number, cx: number, cy: number, br: number) => {
      const sa = Math.sin(ang), ca = Math.cos(ang)
      const x = n.x * ca - n.z * sa, z = n.x * sa + n.z * ca, y = n.y
      const st = Math.sin(tilt), ct = Math.cos(tilt)
      const y2 = y * ct - z * st, z2 = y * st + z * ct
      const persp = 3.4 / (3.4 - z2 * 0.55)
      return { sx: cx + x * persp * S * br, sy: cy + y2 * persp * S * br, d: z2, r: persp }
    }
    const rr = (x: number, y: number, w: number, h: number, rad: number) => {
      ctx.beginPath(); ctx.moveTo(x + rad, y)
      ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad)
      ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); ctx.fill(); ctx.stroke()
    }

    const draw = (now: number) => {
      const p = Math.min(1, p0 + (1 - p0) * ((now - start) / dur))
      const e = envelope(p)
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H)

      const cx = W * 0.5, cy = H * 0.47, S = Math.min(W, H) * 0.15 * e.scale
      const gA = 1 - e.dissolve

      if (gA > 0.01) { // ombre studio très douce au sol
        const sh = ctx.createRadialGradient(cx, cy + S * 1.35, 0, cx, cy + S * 1.35, S * 1.7)
        sh.addColorStop(0, `rgba(40,44,70,${0.1 * e.solid * gA})`); sh.addColorStop(1, "rgba(40,44,70,0)")
        ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(cx, cy + S * 1.35, S * 1.6, S * 0.42, 0, 0, Math.PI * 2); ctx.fill()
      }
      if (e.seed > 0.01) { ctx.fillStyle = `rgba(150,156,172,${0.5 * e.seed})`; ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill() }

      const ang = now * 0.00013, tilt = 0.34, br = e.breathe
      const pts = N3.map((n) => project(n, ang, tilt, S, cx, cy, br))

      ctx.lineCap = "round"
      for (const s of STRUTS) { // « un trait dessine la structure »
        const df = clamp((e.build * 1.28 - s[2] * 0.9) / 0.22, 0, 1); if (df <= 0.01) continue
        const a = pts[s[0]], b = pts[s[1]]
        const ex = lerp(a.sx, b.sx, df), ey = lerp(a.sy, b.sy, df)
        const shade = clamp(0.5 + ((a.d + b.d) / 2) * 0.4, 0.18, 0.9)
        ctx.strokeStyle = `rgba(120,126,144,${0.55 * shade * gA})`; ctx.lineWidth = a.r
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(ex, ey); ctx.stroke()
      }

      const order = pts.map((p2, i) => [p2.d, i] as [number, number]).sort((u, v) => u[0] - v[0])
      for (const [, i] of order) { // éléments mats, arrière → avant
        const P2 = pts[i], n = N3[i], a = e.solid * gA; if (a <= 0.02) continue
        const depth = clamp(0.5 + P2.d * 0.45, 0.2, 1)
        const R = (n.core ? 11 : 7.5) * P2.r * (0.6 + 0.4 * e.solid)
        ctx.save()
        ctx.shadowColor = `rgba(38,42,66,${0.14 * a * depth})`; ctx.shadowBlur = 16 * P2.r; ctx.shadowOffsetY = 7 * P2.r
        const g = ctx.createRadialGradient(P2.sx - R * 0.36, P2.sy - R * 0.42, R * 0.1, P2.sx, P2.sy, R)
        if (n.core) { g.addColorStop(0, "#ffffff"); g.addColorStop(0.55, `rgba(224,226,246,${a})`); g.addColorStop(1, `rgba(150,152,214,${a})`) }
        else { g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.6, `rgba(238,240,245,${a})`); g.addColorStop(1, `rgba(206,210,221,${a})`) }
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P2.sx, P2.sy, R, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
        ctx.lineWidth = 1; ctx.strokeStyle = n.core ? `rgba(120,122,200,${0.5 * a})` : `rgba(150,155,170,${0.42 * a * depth})`
        ctx.beginPath(); ctx.arc(P2.sx, P2.sy, R, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }

      if (e.dissolve > 0.02) { // les éléments deviennent l'interface
        const a = easeIO(clamp((e.dissolve - 0.15) / 0.6, 0, 1)) * 0.5
        ctx.fillStyle = `rgba(244,245,248,${a})`; ctx.strokeStyle = `rgba(214,217,226,${a})`; ctx.lineWidth = 1
        rr(cx - S * 2.2, cy - S * 1.1, S * 1.5, S * 2.2, 10)
        rr(cx + S * 0.7, cy - S * 1.1, S * 1.5, S * 1.0, 10)
        rr(cx + S * 0.7, cy + S * 0.05, S * 1.5, S * 1.05, 10)
      }

      if (p >= 1) { finish(); return }
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.clearTimeout(skipTimer) }
  }, [variant, finish])

  return (
    <div ref={wrapRef} className="fixed inset-0 z-50 bg-white">
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
      {skippable && showSkip && (
        <button
          type="button"
          onClick={finish}
          className="absolute bottom-6 right-6 rounded-full border border-black/10 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-neutral-400 backdrop-blur transition-colors hover:text-neutral-600"
        >
          Skip
        </button>
      )}
    </div>
  )
}
