"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"

/**
 * Graphe en barres **3D** interactif (Three.js) pour une répartition « X par Y ».
 *
 * Interactivité : glisser pour faire tourner la scène (sinon auto-rotation lente), survoler une
 * barre la surligne et affiche sa valeur. Sol quadrillé en fond. Rendu depuis les vraies données.
 *
 * <p>Composant défensif : nettoyage complet (géométries/matériaux/renderer, RAF, listeners,
 * ResizeObserver) au démontage, redimensionnement suivi.
 */
export function Bars3D({
  data, color = "#6366f1", yLabel,
}: Readonly<{ data: { label: string; value: number }[]; color?: string; yLabel?: string }>) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ x: number; y: number; label: string; value: number } | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || data.length === 0) return
    let width = mount.clientWidth || 600
    let height = mount.clientHeight || 400

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 6, 13)
    camera.lookAt(0, 1.5, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const dir = new THREE.DirectionalLight(0xffffff, 0.85)
    dir.position.set(6, 12, 8)
    scene.add(dir)

    const group = new THREE.Group()
    scene.add(group)

    const n = data.length
    const max = Math.max(...data.map((d) => d.value), 1)
    const spacing = 1.7
    const maxH = 5.5
    const totalW = (n - 1) * spacing
    const base = new THREE.Color(color)
    const bars: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = []

    data.forEach((d, i) => {
      const h = Math.max((d.value / max) * maxH, 0.06)
      const geo = new THREE.BoxGeometry(1, h, 1)
      const mat = new THREE.MeshStandardMaterial({ color: base.clone(), metalness: 0.1, roughness: 0.55 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(i * spacing - totalW / 2, h / 2, 0)
      mesh.userData = { label: d.label, value: d.value }
      group.add(mesh)
      bars.push(mesh)
    })

    // Sol quadrillé (la « grille derrière »).
    const grid = new THREE.GridHelper(Math.max(totalW + 4, 8), 12, 0x888888, 0xbbbbbb)
    const gridMat = grid.material as THREE.Material
    gridMat.opacity = 0.25
    gridMat.transparent = true
    scene.add(grid)

    // Interaction : drag = rotation, raycast = survol.
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let dragging = false
    let lastX = 0
    let autoRotate = true
    let rotY = 0.5
    let highlighted: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | null = null

    const clearHighlight = () => {
      if (highlighted) { highlighted.material.emissive.setHex(0x000000); highlighted = null }
    }

    const onDown = (e: PointerEvent) => { dragging = true; autoRotate = false; lastX = e.clientX }
    const onUp = () => { dragging = false }
    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      if (dragging) { rotY += (e.clientX - lastX) * 0.01; lastX = e.clientX }
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(bars)[0]
      clearHighlight()
      if (hit) {
        const m = hit.object as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
        m.material.emissive.copy(base).multiplyScalar(0.45)
        highlighted = m
        const info = m.userData as { label: string; value: number }
        setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, label: info.label, value: info.value })
      } else {
        setHover(null)
      }
    }
    const onLeave = () => { clearHighlight(); setHover(null) }

    const canvas = renderer.domElement
    canvas.addEventListener("pointerdown", onDown)
    globalThis.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerleave", onLeave)

    let raf = 0
    const animate = () => {
      if (autoRotate) rotY += 0.0035
      group.rotation.y = rotY
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    const ro = new ResizeObserver(() => {
      width = mount.clientWidth || width
      height = mount.clientHeight || height
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    })
    ro.observe(mount)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener("pointerdown", onDown)
      globalThis.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerleave", onLeave)
      bars.forEach((b) => { b.geometry.dispose(); b.material.dispose() })
      grid.geometry.dispose()
      gridMat.dispose()
      renderer.dispose()
      if (canvas.parentNode === mount) mount.removeChild(canvas)
    }
  }, [data, color])

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <p className="font-medium text-popover-foreground">{hover.label}</p>
          <p className="text-muted-foreground">
            {yLabel ?? "Valeur"} : <span className="font-semibold text-popover-foreground">{hover.value.toLocaleString("fr-FR")}</span>
          </p>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-muted-foreground/60">
        Glisse pour tourner · survole une barre
      </p>
    </div>
  )
}
