"use client"

import { Bell, Hash, UserPlus, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { MEMBERS } from "./data"
import type { Channel } from "./types"

interface ChannelHeaderProps {
  readonly channel: Channel
}

export function ChannelHeader({ channel }: ChannelHeaderProps) {
  const isDm    = channel.kind === "dm" || channel.kind === "group-dm"
  const isGroup = channel.kind === "group-dm"

  const memberList = (channel.members ?? [])
    .filter((id) => id !== "me")
    .map((id) => MEMBERS[id])
    .filter(Boolean)

  let headerIcon: React.ReactNode
  if (!isDm) {
    headerIcon = (
      <div className="h-9 w-9 rounded-lg border border-border bg-muted/60 flex items-center justify-center shrink-0">
        <Hash className="h-4 w-4 text-muted-foreground" />
      </div>
    )
  } else if (isGroup) {
    headerIcon = (
      <div className="relative h-9 w-9 shrink-0">
        {memberList.slice(0, 2).map((m, i) => {
          const posClass = i === 0 ? "left-0 top-0" : "right-0 bottom-0"
          return (
            <div
              key={m.id}
              className={cn(
                "absolute h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white border-[1.5px] border-background",
                m.color,
                posClass
              )}
            >
              {m.initials}
            </div>
          )
        })}
      </div>
    )
  } else {
    headerIcon = (
      <div className="relative shrink-0">
        <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold text-white", memberList[0]?.color ?? "bg-muted")}>
          {memberList[0]?.initials ?? "?"}
        </div>
        {memberList[0]?.online && (
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
        )}
      </div>
    )
  }

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
      {headerIcon}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground truncate">{channel.name}</span>
          {isDm && !isGroup && memberList[0]?.online && (
            <span className="text-xs text-emerald-500 font-medium shrink-0">online</span>
          )}
          {isGroup && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
              {channel.members?.length ?? 0} members
            </Badge>
          )}
        </div>
        {channel.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{channel.description}</p>
        )}
        {isDm && !isGroup && !channel.description && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {memberList[0]?.online ? "Active now" : "Offline"}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Members" onClick={() => toast.info("Members panel (soon)")}>
          <Users className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Notifications" onClick={() => toast.info("Notification settings")}>
          <Bell className="h-4 w-4" />
        </Button>
        {!isDm && (
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Invite" onClick={() => toast.info("Invite to channel")}>
            <UserPlus className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
