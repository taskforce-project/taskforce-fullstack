"use client"

import { useEffect, useRef } from "react"
import { MessageBubble } from "./message-bubble"
import { isSameGroup } from "./helpers"
import type { Message } from "./types"

interface MessageListProps {
  readonly messages: Message[]
  readonly onReact: (id: string, emoji: string) => void
  readonly onEdit: (id: string) => void
  readonly onDelete: (id: string) => void
}

export function MessageList({ messages, onReact, onEdit, onDelete }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Date divider */}
      <div className="relative flex items-center px-6 py-5">
        <div className="flex-1 border-t border-border" />
        <span className="mx-3 text-xs text-muted-foreground font-medium bg-background px-2 select-none">Today</span>
        <div className="flex-1 border-t border-border" />
      </div>

      {messages.map((msg, i) => {
        const prev = messages[i - 1]
        const showHeader = !prev || !isSameGroup(prev, msg)
        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            showHeader={showHeader}
            onReact={onReact}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )
      })}

      {/* Bottom padding for last message */}
      <div className="h-4" />
      <div ref={bottomRef} />
    </div>
  )
}
