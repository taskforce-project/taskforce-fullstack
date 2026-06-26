"use client"

import { useEffect, useRef } from "react"
import "./PixelBlast.css"

interface PixelBlastProps {
  variant?: "square" | "circle" | "triangle" | "diamond"
  pixelSize?: number
  color?: string
  patternScale?: number
  patternDensity?: number
  liquid?: boolean
  liquidStrength?: number
  liquidRadius?: number
  pixelSizeJitter?: number
  enableRipples?: boolean
  rippleIntensityScale?: number
  rippleThickness?: number
  rippleSpeed?: number
  liquidWobbleSpeed?: number
  autoPauseOffscreen?: boolean
  speed?: number
  transparent?: boolean
  edgeFade?: number
  noiseAmount?: number
  className?: string
  style?: React.CSSProperties
}

const SHAPE_MAP = { square: 0, circle: 1, triangle: 2, diamond: 3 } as const
const MAX_CLICKS = 10

export default function PixelBlast({
  variant = "circle",
  pixelSize = 4,
  color = "#a855f7",
  patternScale = 2,
  patternDensity = 1,
  enableRipples = true,
  rippleIntensityScale = 1,
  rippleThickness = 0.12,
  rippleSpeed = 0.3,
  autoPauseOffscreen = true,
  speed = 0.5,
  transparent = true,
  edgeFade = 0.4,
  noiseAmount = 0,
  pixelSizeJitter = 0,
  liquid = false,
  liquidStrength = 0.1,
  liquidRadius = 1,
  liquidWobbleSpeed = 4.5,
  className,
  style,
}: Readonly<PixelBlastProps>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)
  const rafRef = useRef<number>(0)
  const startTimeRef = useRef<number>(Date.now())
  const pausedRef = useRef<boolean>(false)
  const speedRef = useRef(speed)

  // click ripple state
  const clicksRef = useRef<{ x: number; y: number; t: number }[]>([])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const canvas = document.createElement("canvas")
    canvas.style.position = "absolute"
    canvas.style.top = "0"
    canvas.style.left = "0"
    canvas.style.width = "100%"
    canvas.style.height = "100%"
    container.appendChild(canvas)
    canvasRef.current = canvas

    // `!` : le guard ci-dessous protège à l'exécution ; l'assertion évite que TS
    // perde le narrowing non-null dans les closures (compileShader/resize).
    const gl = canvas.getContext("webgl", { alpha: transparent, premultipliedAlpha: false })!
    if (!gl) return
    glRef.current = gl

    // ─── shaders ──────────────────────────────────────────────────────────────
    const VERT_SRC = `
      attribute vec2 a_position;
      void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
    `
    const FRAG_SRC = `
      precision mediump float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform float u_pixelSize;
      uniform vec3 u_color;
      uniform float u_patternScale;
      uniform float u_patternDensity;
      uniform float u_edgeFade;
      uniform float u_noiseAmount;
      uniform float u_pixelSizeJitter;
      uniform int u_shape;
      uniform int u_enableRipples;
      uniform float u_rippleIntensityScale;
      uniform float u_rippleThickness;
      uniform float u_rippleSpeed;
      uniform float u_clickTimes[${MAX_CLICKS}];
      uniform vec2 u_clickPositions[${MAX_CLICKS}];
      uniform int u_clickCount;

      float rand(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453);
      }
      float fbm(vec2 p) {
        float v = 0.0; float a = 0.5;
        for(int i=0;i<4;i++) { v += a * (sin(p.x)*cos(p.y)); p *= 2.0; a *= 0.5; }
        return v;
      }
      float bayer2(vec2 p) {
        vec2 m = mod(p, 2.0);
        return m.x + m.y * 2.0;
      }
      float bayer8(vec2 p) {
        return (bayer2(p*0.5)*0.25 + bayer2(p*1.0)) / 4.0;
      }
      float shapeFunc(vec2 uv, int shape) {
        if(shape == 0) { return step(0.5, max(abs(uv.x), abs(uv.y))); } // square edge
        if(shape == 1) { return step(0.5, length(uv)); }
        if(shape == 2) { return step(0.5, max(uv.y * 0.5 + abs(uv.x) * 0.866 - 0.25, -uv.y)); }
        return step(0.5, abs(uv.x) + abs(uv.y)); // diamond
      }
      void main() {
        vec2 fragCoord = gl_FragCoord.xy;
        float ps = u_pixelSize;
        if(u_pixelSizeJitter > 0.0) {
          vec2 jCell = floor(fragCoord / ps);
          ps += u_pixelSizeJitter * (rand(jCell) - 0.5) * 2.0 * ps;
          ps = max(1.0, ps);
        }
        vec2 cellId = floor(fragCoord / ps);
        vec2 cellCenter = (cellId + 0.5) * ps;
        vec2 uvInCell = (fragCoord - cellCenter) / ps;

        float t = u_time;
        vec2 scaledCell = cellId * u_patternScale / u_resolution;
        float wave = sin(scaledCell.x * 6.28 + t * 1.5) * cos(scaledCell.y * 6.28 + t * 1.2) * 0.5 + 0.5;
        float density = u_patternDensity;
        float threshold = 1.0 - density * 0.8;
        float noise = u_noiseAmount > 0.0 ? fbm(scaledCell * 4.0 + t * 0.3) * u_noiseAmount : 0.0;
        float dither = bayer8(cellId);

        float fill = step(threshold + dither * 0.15 + noise, wave);
        float insideShape = 1.0 - shapeFunc(uvInCell, u_shape);
        fill *= insideShape;

        vec2 uv = fragCoord / u_resolution;
        vec2 edgeUv = uv * 2.0 - 1.0;
        float edgeDist = 1.0 - max(abs(edgeUv.x), abs(edgeUv.y));
        float fade = smoothstep(0.0, u_edgeFade, edgeDist);

        // Ripples
        if(u_enableRipples == 1) {
          for(int i = 0; i < ${MAX_CLICKS}; i++) {
            if(i >= u_clickCount) break;
            float age = t - u_clickTimes[i];
            float radius = age * u_rippleSpeed * 200.0;
            vec2 delta = fragCoord - u_clickPositions[i];
            float dist = length(delta);
            float ripple = smoothstep(u_rippleThickness * 30.0, 0.0, abs(dist - radius));
            ripple *= max(0.0, 1.0 - age * 0.4) * u_rippleIntensityScale;
            fill = max(fill, ripple * insideShape);
          }
        }

        float alpha = fill * fade;
        gl_FragColor = vec4(u_color * alpha, alpha);
      }
    `

    function compileShader(type: number, src: string): WebGLShader | null {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, src)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vert = compileShader(gl.VERTEX_SHADER, VERT_SRC)
    const frag = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC)
    if (!vert || !frag) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    programRef.current = program
    gl.useProgram(program)

    // quad
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const posLoc = gl.getAttribLocation(program, "a_position")
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    function hexToRgb(hex: string): [number, number, number] {
      const m = /^#([0-9a-f]{6})$/i.exec(hex)
      if (!m) return [1, 0, 1]
      return [
        Number.parseInt(m[1].slice(0, 2), 16) / 255,
        Number.parseInt(m[1].slice(2, 4), 16) / 255,
        Number.parseInt(m[1].slice(4, 6), 16) / 255,
      ]
    }

    const rgb = hexToRgb(color)

    function resize() {
      if (!container || !canvas) return
      const dpr = window.devicePixelRatio || 1
      const w = container.clientWidth
      const h = container.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    window.addEventListener("resize", resize)
    resize()

    // ripple click listener
    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const x = (e.clientX - rect.left) * dpr
      const y = (rect.height - (e.clientY - rect.top)) * dpr
      const t = (Date.now() - startTimeRef.current) / 1000
      clicksRef.current.push({ x, y, t })
      if (clicksRef.current.length > MAX_CLICKS) clicksRef.current.shift()
    }
    canvas.addEventListener("click", handleClick)

    if (transparent) gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    function render() {
      if (!gl || !program) return
      if (transparent) gl.clearColor(0, 0, 0, 0)
      else gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)

      const elapsed = ((Date.now() - startTimeRef.current) / 1000) * speedRef.current
      const u = (name: string) => gl.getUniformLocation(program, name)

      gl.uniform2f(u("u_resolution"), canvas.width, canvas.height)
      gl.uniform1f(u("u_time"), elapsed)
      gl.uniform1f(u("u_pixelSize"), pixelSize * (window.devicePixelRatio || 1))
      gl.uniform3f(u("u_color"), rgb[0], rgb[1], rgb[2])
      gl.uniform1f(u("u_patternScale"), patternScale)
      gl.uniform1f(u("u_patternDensity"), patternDensity)
      gl.uniform1f(u("u_edgeFade"), edgeFade)
      gl.uniform1f(u("u_noiseAmount"), noiseAmount)
      gl.uniform1f(u("u_pixelSizeJitter"), pixelSizeJitter)
      gl.uniform1i(u("u_shape"), SHAPE_MAP[variant] ?? 1)
      gl.uniform1i(u("u_enableRipples"), enableRipples ? 1 : 0)
      gl.uniform1f(u("u_rippleIntensityScale"), rippleIntensityScale)
      gl.uniform1f(u("u_rippleThickness"), rippleThickness)
      gl.uniform1f(u("u_rippleSpeed"), rippleSpeed)

      const clks = clicksRef.current
      const times = new Float32Array(MAX_CLICKS).fill(0)
      const positions = new Float32Array(MAX_CLICKS * 2).fill(0)
      clks.forEach((c, i) => {
        times[i] = c.t
        positions[i * 2] = c.x
        positions[i * 2 + 1] = c.y
      })
      gl.uniform1fv(u("u_clickTimes"), times)
      gl.uniform2fv(u("u_clickPositions"), positions)
      gl.uniform1i(u("u_clickCount"), clks.length)

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    let obs: IntersectionObserver | null = null
    if (autoPauseOffscreen) {
      obs = new IntersectionObserver((entries) => {
        pausedRef.current = !entries[0]?.isIntersecting
      })
      obs.observe(container)
    }

    function loop() {
      rafRef.current = requestAnimationFrame(loop)
      if (!pausedRef.current) render()
    }
    loop()

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("click", handleClick)
      obs?.disconnect()
      if (canvas.parentElement === container) canvas.remove()
      gl.deleteProgram(program)
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-init on key variant changes only
  }, [variant, liquid, noiseAmount])

  return (
    <div
      ref={containerRef}
      className={`pixel-blast-container${className ? " " + className : ""}`}
      style={style}
    />
  )
}
