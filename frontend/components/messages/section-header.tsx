"use client"

import { ChevronDown, ChevronRight } from "lucide-react"

interface SectionHeaderProps {
  readonly label: string
  readonly open: boolean
  readonly onToggle: () => void
  readonly unread?: number
  readonly action?: React.ReactNode
}

export function SectionHeader({ label, open, onToggle, unread, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-1 pr-1 mb-0.5">
      <button
        onClick={onToggle}
        className="flex flex-1 items-center gap-1 px-2 py-1 rounded hover:bg-sidebar-accent/50 transition-colors text-left"
      >
        {open
          ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        }
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        {!!unread && (
          <span className="ml-1 text-[10px] font-bold text-primary">{unread}</span>
        )}
      </button>
      {action}
    </div>
  )
}
