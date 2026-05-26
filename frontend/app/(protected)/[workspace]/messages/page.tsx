"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { ChatSidebar }   from "@/components/messages/chat-sidebar"
import { ChannelHeader } from "@/components/messages/channel-header"
import { MessageList }   from "@/components/messages/message-list"
import { MessageInput }  from "@/components/messages/message-input"
import { findChannel } from "@/components/messages/data"
import { applyReact }    from "@/components/messages/helpers"
import { useMessageStore }   from "@/lib/store/message-store"
import { useStomp }          from "@/lib/hooks/use-stomp"
import type { Message }      from "@/components/messages/types"
import type { ApiChatMessage } from "@/lib/api/message-service"
import { apiClient } from "@/lib/api/client"
import { MESSAGE_ROUTES } from "@/lib/config/api-routes"

// Convertir ApiChatMessage -> Message (type UI)
function toUiMessage(m: ApiChatMessage): Message {
  return {
    id:             m.id.toString(),
    authorId:       m.authorId?.toString() ?? "unknown",
    authorName:     m.authorName,
    authorInitials: m.authorInitials,
    content:        m.content,
    ts:             new Date(m.createdAt),
    edited:         m.isEdited,
  }
}

export default function MessagesPage() {
  const params  = useParams()
  const slug    = Array.isArray(params.workspace) ? params.workspace[0] : (params.workspace as string)

  const {
    channels,
    activeChannelId,
    messagesByChannel,
    loadingChannels,
    fetchChannels,
    fetchMessages,
    setActiveChannel,
    removeMessage,
  } = useMessageStore()

  const [localActiveId, setLocalActiveId] = useState("general")
  const [localMessages, setLocalMessages]  = useState<Record<string, Message[]>>({})

  const channelIds = useMemo(() => channels.map((c) => c.id), [channels])
  useStomp(channelIds)

  useEffect(() => {
    if (slug) fetchChannels(slug)
  }, [slug, fetchChannels])

  useEffect(() => {
    if (slug && activeChannelId !== null) {
      fetchMessages(slug, activeChannelId)
    }
  }, [slug, activeChannelId, fetchMessages])

  const useApiMode = channels.length > 0

  const activeStringId = activeChannelId === null ? localActiveId : activeChannelId.toString()
  const channel        = findChannel(activeStringId) ?? findChannel(localActiveId)

  const apiMessages: Message[] = useMemo(() => {
    if (activeChannelId === null) return []
    return (messagesByChannel[activeChannelId] ?? []).map(toUiMessage)
  }, [activeChannelId, messagesByChannel])

  const channelMessages: Message[] = useApiMode
    ? apiMessages
    : (localMessages[localActiveId] ?? [])

  function handleSelect(id: string) {
    const numId = Number.parseInt(id, 10)
    if (useApiMode && !Number.isNaN(numId)) {
      setActiveChannel(numId)
    } else {
      setLocalActiveId(id)
    }
  }

  const handleSend = useCallback(async (text: string) => {
    if (useApiMode && activeChannelId !== null) {
      try {
        await apiClient.post<{ data: ApiChatMessage }>(
          MESSAGE_ROUTES.MESSAGES(slug, activeChannelId),
          { content: text }
        )
      } catch {
        toast.error("Impossible d envoyer le message")
      }
    } else {
      const newMsg: Message = {
        id:       `${localActiveId}-${Date.now()}`,
        authorId: "me",
        content:  text,
        ts:       new Date(),
      }
      setLocalMessages((prev) => ({
        ...prev,
        [localActiveId]: [...(prev[localActiveId] ?? []), newMsg],
      }))
    }
  }, [useApiMode, activeChannelId, slug, localActiveId])

  const handleReact = useCallback((msgId: string, emoji: string) => {
    if (!useApiMode) {
      setLocalMessages((prev) => applyReact(prev, localActiveId, msgId, emoji))
    }
  }, [useApiMode, localActiveId])

  const handleEdit = useCallback(() => {
    toast.info("Edit mode - coming soon")
  }, [])

  const handleDelete = useCallback(async (msgId: string) => {
    if (useApiMode && activeChannelId !== null) {
      await removeMessage(slug, activeChannelId, Number.parseInt(msgId, 10))
      toast.success("Message supprime")
    } else {
      setLocalMessages((prev) => ({
        ...prev,
        [localActiveId]: (prev[localActiveId] ?? []).filter((m) => m.id !== msgId),
      }))
      toast.success("Message deleted")
    }
  }, [useApiMode, activeChannelId, slug, localActiveId, removeMessage])

  return (
    <div className="-m-6 md:-m-8 flex overflow-hidden" style={{ height: "calc(100dvh - 3.5rem)" }}>
      <ChatSidebar
        activeId={activeStringId}
        onSelect={handleSelect}
        apiChannels={useApiMode ? channels : undefined}
      />

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
          {loadingChannels ? "Chargement des canaux..." : "Selectionnez un canal pour commencer"}
        </div>
      )}
    </div>
  )
}
