"use client"

import { Hash } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { MEMBERS } from "./data"
import type { Channel } from "./types"

interface ChannelRowProps {
  readonly channel: Channel
  readonly active: boolean
  readonly onClick: () => void
}

export function ChannelRow({ channel, active, onClick }: ChannelRowProps) {
  const isDm     = channel.kind === "dm" || channel.kind === "group-dm"
  const isGroup  = channel.kind === "group-dm"
  const memberId = isDm && channel.members?.find((m) => m !== "me")
  const member   = memberId ? MEMBERS[memberId] : undefined

  let rowIcon: React.ReactNode
  if (!isDm) {
    rowIcon = <Hash className="h-3.5 w-3.5 shrink-0 opacity-60" />
  } else if (isGroup) {
    rowIcon = (
      <div className="relative h-5 w-5 shrink-0">
        <div className="absolute left-0 top-0 h-3.5 w-3.5 rounded-full bg-violet-500 flex items-center justify-center text-[7px] text-white font-bold">
          {channel.members?.length ?? 0}
        </div>
        <div className="absolute right-0 bottom-0 h-3.5 w-3.5 rounded-full bg-emerald-500 border border-sidebar" />
      </div>
    )
  } else {
    rowIcon = (
      <div className="relative h-5 w-5 shrink-0">
        <div className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white", member?.color ?? "bg-muted")}>
          {member?.initials ?? "?"}
        </div>
        {member?.online && (
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-[1.5px] border-sidebar" />
        )}
      </div>
    )
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
      )}
    >
      {rowIcon}
      <span className="flex-1 truncate">{channel.name}</span>
      {channel.unread ? (
        <Badge className="h-4 min-w-4 rounded-full px-1 text-[10px] font-semibold bg-primary text-primary-foreground">
          {channel.unread}
        </Badge>
      ) : null}
    </button>
  )
}
