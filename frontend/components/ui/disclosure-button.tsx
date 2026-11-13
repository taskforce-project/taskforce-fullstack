"use client"

import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Un bouton qui montre ou cache un détail (R133 : le détail à un clic, le brut à deux). Il se voit comme un contrôle :
 * souligné, avec un chevron qui tourne quand le détail est ouvert (R161).
 */
export function DisclosureButton({ open, onToggle, children, className }: Readonly<{
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  className?: string
}>) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-sm text-xs font-medium text-foreground underline decoration-foreground/30 underline-offset-2 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    >
      <ChevronRight aria-hidden="true" className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
      {children}
    </button>
  )
}
