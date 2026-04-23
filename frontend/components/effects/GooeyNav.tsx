"use client"

import { useEffect, useRef, useState } from "react"
import "./GooeyNav.css"

export interface GooeyNavItem {
  label: string
  href?: string
  onClick?: () => void
  icon?: React.ReactNode
}

interface GooeyNavProps {
  items: GooeyNavItem[]
  initialActiveIndex?: number
  animationTime?: number
  particleCount?: number
  particleSize?: number
  colors?: number[][]
}

export default function GooeyNav({
  items,
  initialActiveIndex = -1,
  animationTime = 600,
  particleCount = 15,
  particleSize = 12,
  colors = [
    [45, 98, 239],
    [255, 174, 4],
    [164, 164, 164],
    [255, 255, 255],
  ],
}: Readonly<GooeyNavProps>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const filterRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex)

  function getPos(
    el: HTMLElement,
    parent: HTMLElement
  ): { x: number; y: number; w: number; h: number } {
    const elRect = el.getBoundingClientRect()
    const parentRect = parent.getBoundingClientRect()
    return {
      x: elRect.left - parentRect.left,
      y: elRect.top - parentRect.top,
      w: elRect.width,
      h: elRect.height,
    }
  }

  function animateParticles(
    container: HTMLElement,
    fromEl: HTMLElement,
    toEl: HTMLElement,
    elapsed: number
  ) {
    const from = getPos(fromEl, container)
    const to = getPos(toEl, container)

    Array.from({ length: particleCount }).forEach((_, i) => {
      const color = colors[i % colors.length]
      const particle = document.createElement("span")
      particle.className = "gooey-particle"

      const startX = from.x + from.w / 2
      const startY = from.y + from.h / 2
      const randAngle = Math.random() * Math.PI * 2
      const dist = 20 + Math.random() * 40
      const endX = to.x + to.w / 2 + Math.cos(randAngle) * dist * 0.3
      const endY = to.y + to.h / 2 + Math.sin(randAngle) * dist * 0.3

      const point = document.createElement("span")
      point.className = "gooey-point"
      const size = particleSize / 2 + Math.random() * particleSize
      point.style.width = size + "px"
      point.style.height = size + "px"
      point.style.setProperty("--color", `rgb(${color[0]},${color[1]},${color[2]})`)
      point.style.setProperty("--scale", (0.5 + Math.random()).toString())

      particle.style.left = startX + "px"
      particle.style.top = startY + "px"
      particle.style.setProperty("--start-x", "0px")
      particle.style.setProperty("--start-y", "0px")
      particle.style.setProperty("--end-x", endX - startX + "px")
      particle.style.setProperty("--end-y", endY - startY + "px")
      particle.style.setProperty("--rotate", Math.random() * 720 - 360 + "deg")
      particle.style.setProperty("--time", elapsed * 1.5 + "ms")

      particle.appendChild(point)
      container.appendChild(particle)

      setTimeout(() => {
        particle.remove()
      }, elapsed * 1.5)
    })
  }

  const handleItemClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    index: number,
    item: GooeyNavItem
  ) => {
    if (item.onClick) {
      e.preventDefault()
      item.onClick()
    }

    if (!containerRef.current || !navRef.current) return
    const liEls = navRef.current.querySelectorAll<HTMLLIElement>("li")
    const prevIdx = activeIndex

    setActiveIndex(index)

    const filterEl = filterRef.current
    const textEl = textRef.current
    if (!filterEl || !textEl) return

    const pos = getPos(liEls[index], containerRef.current)
    filterEl.style.width = pos.w + "px"
    filterEl.style.height = pos.h + "px"
    filterEl.style.left = pos.x + "px"
    filterEl.style.top = pos.y + "px"
    filterEl.classList.add("active")

    textEl.style.width = pos.w + "px"
    textEl.style.height = pos.h + "px"
    textEl.style.left = pos.x + "px"
    textEl.style.top = pos.y + "px"
    textEl.textContent = item.label
    textEl.classList.add("active")

    if (prevIdx >= 0 && prevIdx !== index && liEls[prevIdx]) {
      animateParticles(containerRef.current, liEls[prevIdx], liEls[index], animationTime)
    }

    setTimeout(() => {
      filterEl.classList.remove("active")
      textEl.classList.remove("active")
    }, animationTime)
  }

  useEffect(() => {
    const nav = navRef.current
    const filter = filterRef.current
    const text = textRef.current
    const container = containerRef.current
    if (!nav || !filter || !text || !container || initialActiveIndex < 0) return

    const liEls = nav.querySelectorAll<HTMLLIElement>("li")
    if (!liEls[initialActiveIndex]) return

    const pos = getPos(liEls[initialActiveIndex], container)
    filter.style.width = pos.w + "px"
    filter.style.height = pos.h + "px"
    filter.style.left = pos.x + "px"
    filter.style.top = pos.y + "px"
    text.style.width = pos.w + "px"
    text.style.height = pos.h + "px"
    text.style.left = pos.x + "px"
    text.style.top = pos.y + "px"
    text.textContent = items[initialActiveIndex]?.label ?? ""
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={containerRef} className="gooey-nav-container">
      <nav ref={navRef}>
        <ul>
          {items.map((item, i) => (
            <li key={item.label} className={activeIndex === i ? "active" : ""}>
              <a
                href={item.href ?? "#"}
                onClick={(e) => handleItemClick(e, i, item)}
              >
                {item.icon && <span>{item.icon}</span>}
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <span ref={filterRef} className="effect filter" />
      <span ref={textRef} className="effect text" />
    </div>
  )
}
