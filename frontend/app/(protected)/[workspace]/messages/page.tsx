"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"
import { ChatSidebar }   from "@/components/messages/chat-sidebar"
import { ChannelHeader } from "@/components/messages/channel-header"
import { MessageList }   from "@/components/messages/message-list"
import { MessageInput }  from "@/components/messages/message-input"
import { findChannel, getMessages, MOCK_MESSAGES } from "@/components/messages/data"
import { applyReact }    from "@/components/messages/helpers"
import type { Message }  from "@/components/messages/types"

export default function MessagesPage() {
  const [activeId, setActiveId] = useState("general")
  const [messages, setMessages] = useState<Record<string, Message[]>>(() => ({ ...MOCK_MESSAGES }))

  const channel         = findChannel(activeId)
  const channelMessages = messages[activeId] ?? getMessages(activeId)

  function handleSelect(id: string) {
    setActiveId(id)
  }

  const handleSend = useCallback((text: string) => {
    const newMsg: Message = {
      id:       `${activeId}-${Date.now()}`,
      authorId: "me",
      content:  text,
      ts:       new Date(),
    }
    setMessages((prev) => ({
      ...prev,
      [activeId]: [...(prev[activeId] ?? getMessages(activeId)), newMsg],
    }))
  }, [activeId])

  const handleReact = useCallback((msgId: string, emoji: string) => {
    setMessages((prev) => applyReact(prev, activeId, msgId, emoji))
  }, [activeId])

  const handleEdit = useCallback(() => {
    toast.info("Edit mode � coming soon")
  }, [])

  const handleDelete = useCallback((msgId: string) => {
    setMessages((prev) => ({
      ...prev,
      [activeId]: (prev[activeId] ?? []).filter((m) => m.id !== msgId),
    }))
    toast.success("Message deleted")
  }, [activeId])

  return (
    <div className="-m-6 md:-m-8 flex overflow-hidden" style={{ height: "calc(100dvh - 3.5rem)" }}>
      <ChatSidebar activeId={activeId} onSelect={handleSelect} />

      {channel ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <ChannelHeader channel={channel} />
          <MessageList
            messages={channelMessages}
            onReact={handleReact}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
          <MessageInput
            channelName={channel.name}
            onSend={handleSend}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Select a channel to start messaging
        </div>
      )}
    </div>
  )
}
