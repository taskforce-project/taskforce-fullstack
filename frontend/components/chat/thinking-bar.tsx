"use client"

import { cn } from "@/lib/utils"
import { Loader } from "@/components/ui/loader"
import { ShimmeringText } from "@/components/ui/shimmering-text"

/** Indicateur compact « réfléchit / agit » pour le chat agentique. */
export function ThinkingBar({ label = "Taskforce AI réfléchit…", className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Loader variant="spin" size="sm" className="text-primary" />
      <ShimmeringText>{label}</ShimmeringText>
    </span>
  )
}
