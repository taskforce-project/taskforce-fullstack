export type ChannelKind = "channel" | "dm" | "group-dm" | "project-channel"

export interface Member {
  id: string
  name: string
  initials: string
  color: string
  online: boolean
}

export interface Channel {
  id: string
  kind: ChannelKind
  name: string
  description?: string
  unread?: number
  members?: string[]
  projectId?: string
  muted?: boolean
}

export interface Reaction {
  emoji: string
  count: number
  mine: boolean
}

export interface Message {
  id: string
  authorId: string
  content: string
  ts: Date
  reactions?: Reaction[]
  edited?: boolean
  pinned?: boolean
}
