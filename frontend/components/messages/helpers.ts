import type { Message, Reaction } from "./types"

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
}

export function isSameGroup(a: Message, b: Message): boolean {
  return a.authorId === b.authorId && Math.abs(b.ts.getTime() - a.ts.getTime()) < 5 * 60_000
}

export function toggleReaction(reactions: Reaction[], emoji: string): Reaction[] {
  const existing = reactions.find((r) => r.emoji === emoji)
  if (!existing) return [...reactions, { emoji, count: 1, mine: true }]
  return reactions
    .map((r) => {
      if (r.emoji !== emoji) return r
      const newCount = r.mine ? r.count - 1 : r.count + 1
      return { ...r, count: newCount, mine: !r.mine }
    })
    .filter((r) => r.count > 0)
}

export function applyReact(
  prev: Record<string, Message[]>,
  activeId: string,
  msgId: string,
  emoji: string,
): Record<string, Message[]> {
  const list = prev[activeId] ?? []
  return {
    ...prev,
    [activeId]: list.map((m) => {
      if (m.id !== msgId) return m
      return { ...m, reactions: toggleReaction(m.reactions ?? [], emoji) }
    }),
  }
}
