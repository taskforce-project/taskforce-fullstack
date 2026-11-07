"use client"

import Link from "next/link"
import type { MouseEvent, ReactNode } from "react"

/** Un clic simple : ni un autre bouton, ni une touche qui demande un onglet ou une fenêtre. */
export function plainClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

/**
 * Un lien qui ouvre un volet de la fenêtre (R120) : son adresse est celle qu'on partage ; un clic simple passe par le
 * geste de la fenêtre (`open`), qui garde la conversation et ouvre l'issue par-dessus l'écran qui la liste. Un clic du
 * milieu, ou avec Ctrl, ouvre l'adresse dans un autre onglet, comme tout lien.
 */
export function PaneLink({ href, open, className, title, children, ...rest }: Readonly<{
  href: string
  open: () => void
  className?: string
  title?: string
  children: ReactNode
  "aria-label"?: string
}>) {
  return (
    <Link
      href={href}
      title={title}
      className={className}
      aria-label={rest["aria-label"]}
      onClick={(e) => {
        if (!plainClick(e)) return
        e.preventDefault()
        open()
      }}
    >
      {children}
    </Link>
  )
}
