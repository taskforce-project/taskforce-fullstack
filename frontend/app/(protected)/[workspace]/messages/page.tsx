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
import type { Channel, Message } from "@/components/messages/types"
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
    addMessage,
    removeMessage,
  } = useMessageStore()

  const [localActiveId, setLocalActiveId] = useState("general")
  const [localMessages, setLocalMessages]  = useState<Record<string, Message[]>>({})

  const channelIds = useMemo(() => channels.map((c) => c.id), [channels])
  const realtime = useStomp(channelIds)

  useEffect(() => {
    if (slug) fetchChannels(slug)
  }, [slug, fetchChannels])

  useEffect(() => {
    if (slug && activeChannelId !== null) {
      fetchMessages(slug, activeChannelId)
    }
  }, [slug, activeChannelId, fetchMessages])

  const useApiMode = channels.length > 0

  // Auto-sélection du 1er canal réel dès que les canaux API sont chargés
  // (évite de rester bloqué sur le canal mock "general" à l'ouverture).
  useEffect(() => {
    if (channels.length > 0 && activeChannelId === null) {
      setActiveChannel(channels[0].id)
    }
  }, [channels, activeChannelId, setActiveChannel])

  const activeStringId = activeChannelId === null ? localActiveId : activeChannelId.toString()

  // En mode API, l'en-tête/nom vient du canal réel ; sinon fallback sur les mocks.
  const channel: Channel | undefined = useMemo(() => {
    if (useApiMode && activeChannelId !== null) {
      const active = channels.find((c) => c.id === activeChannelId)
      if (active) {
        const kindMap = { CHANNEL: "channel", DM: "dm", GROUP_DM: "group-dm", PROJECT_CHANNEL: "project-channel" } as const
        return {
          id:          active.id.toString(),
          kind:        kindMap[active.kind] ?? "channel",
          name:        active.name ?? `channel-${active.id}`,
          description: active.description ?? undefined,
        }
      }
    }
    return findChannel(activeStringId) ?? findChannel(localActiveId)
  }, [useApiMode, activeChannelId, channels, activeStringId, localActiveId])

  const apiMessages: Message[] = useMemo(() => {
    if (activeChannelId === null) return []
    return (messagesByChannel[activeChannelId] ?? []).map(toUiMessage)
  }, [activeChannelId, messagesByChannel])

  const realtimeNotice = useMemo(() => {
    if (!useApiMode || realtime.connectionState === "idle") return null
    if (realtime.connectionState === "connected" && realtime.transport === "sockjs") {
      return "Temps reel actif via le fallback SockJS."
    }
    if (realtime.connectionState === "connecting") {
      return "Connexion du chat temps reel en cours..."
    }
    if (realtime.connectionState === "disconnected") {
      return "Temps reel momentanement indisponible. L envoi REST reste actif."
    }
    if (realtime.connectionState === "error") {
      return `Temps reel en erreur${realtime.lastError ? ` : ${realtime.lastError}` : ""}.`
    }
    return null
  }, [useApiMode, realtime.connectionState, realtime.lastError, realtime.transport])

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
        const res = await apiClient.post<{ data: ApiChatMessage }>(
          MESSAGE_ROUTES.MESSAGES(slug, activeChannelId),
          { content: text }
        )
        // Affichage immédiat via la réponse REST. L'écho STOMP qui suivra sera
        // dédupliqué par id dans le store (addMessage) → pas de doublon, et le
        // message s'affiche même si le temps réel est momentanément indisponible.
        addMessage(activeChannelId, res.data.data)
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
  }, [useApiMode, activeChannelId, slug, localActiveId, addMessage])

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
          {realtimeNotice ? (
            <div className="border-b border-border/60 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
              {realtimeNotice}
            </div>
          ) : null}
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
