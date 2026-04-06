"use client"

import { useState } from "react"
import { MoreHorizontal, Pencil, Pin, SmilePlus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { MEMBERS } from "./data"
import { formatTime } from "./helpers"
import type { Message } from "./types"

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🚀", "👀"]

interface MessageBubbleProps {
  readonly message: Message
  readonly showHeader: boolean
  readonly onReact: (id: string, emoji: string) => void
  readonly onEdit: (id: string) => void
  readonly onDelete: (id: string) => void
}

export function MessageBubble({ message, showHeader, onReact, onEdit, onDelete }: MessageBubbleProps) {
  const [emojiPicker, setEmojiPicker] = useState(false)
  const author = MEMBERS[message.authorId]

  return (
    <div className={cn(
      "group relative flex gap-3 px-6 rounded-md transition-colors hover:bg-muted/30",
      showHeader ? "pt-4 pb-1" : "py-0.5"
    )}>
      {/* Avatar column — fixed width keeps text aligned */}
      <div className="w-9 shrink-0">
        {showHeader ? (
          <div className={cn(
            "h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold text-white mt-0.5",
            author?.color ?? "bg-muted"
          )}>
            {author?.initials ?? "?"}
          </div>
        ) : (
          <span className="block text-[10px] text-transparent group-hover:text-muted-foreground/60 leading-6 text-right pr-1 tabular-nums select-none transition-colors">
            {formatTime(message.ts)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {showHeader && (
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-foreground">
              {author?.name ?? message.authorId}
            </span>
            <span className="text-[11px] text-muted-foreground">{formatTime(message.ts)}</span>
            {message.pinned && (
              <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                <Pin className="h-2.5 w-2.5" /> pinned
              </span>
            )}
          </div>
        )}

        <p className={cn(
          "text-sm text-foreground leading-relaxed",
          message.edited && "after:content-['_(edited)'] after:text-xs after:text-muted-foreground after:ml-1"
        )}>
          {message.content}
        </p>

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact(message.id, r.emoji)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  r.mine
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-muted/50 text-muted-foreground hover:border-primary/30 hover:bg-primary/5"
                )}
              >
                <span>{r.emoji}</span>
                <span className="font-medium">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover action bar */}
      <div className="absolute right-4 top-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-background shadow-md px-1 py-1 z-10 transition-opacity">
        {/* Emoji quick-pick */}
        <div className="relative">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setEmojiPicker((v) => !v)}
            title="Add reaction"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </Button>
          {emojiPicker && (
            <div className="absolute right-0 top-full mt-1 flex gap-1.5 rounded-lg border border-border bg-background shadow-lg p-2 z-20">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  className="text-base hover:scale-125 transition-transform"
                  onClick={() => { onReact(message.id, e); setEmojiPicker(false) }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* More actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {message.authorId === "me" && (
              <>
                <DropdownMenuItem onClick={() => onEdit(message.id)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Edit message
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(message.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </>
            )}
            {message.authorId !== "me" && (
              <DropdownMenuItem>
                <Pin className="h-3.5 w-3.5 mr-2" /> Pin message
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
