import type { AssistantToolCall } from "@/lib/api/assistant-service"
import type { CortexTurn } from "@/lib/store/cortex-store"

/**
 * « Changes » (R122) : ce que la conversation a changé dans TaskForce, lu dans les résultats de ses gestes. Un geste
 * proposé, refusé ou en échec n'a rien changé ; seuls comptent ceux qui ont abouti, dans ses tours ou sur leurs cartes
 * (une issue préparée puis créée, une action accordée, la suite d'une carte de questions).
 */
export type ChangeKind = "created" | "moved" | "assigned" | "commented" | "changed" | "deleted" | "delegated"

export interface Change {
  /** Une clé stable : le tour (ou la carte) et le rang du geste. */
  readonly id: string
  readonly kind: ChangeKind
  /** Ce qui a changé : la clé et le titre de l'issue, sinon ce que le serveur en dit. */
  readonly what: string
  readonly call: AssistantToolCall
}

const KINDS: Readonly<Record<string, ChangeKind>> = {
  create_issue: "created",
  create_project: "created",
  create_note: "created",
  add_comment: "commented",
  delete_issue: "deleted",
  delegate_issue: "delegated",
}

function inputOf(call: AssistantToolCall): Record<string, unknown> {
  if (!call.input) return {}
  try {
    const value: unknown = JSON.parse(call.input)
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const given = (value: unknown): boolean => value !== undefined && value !== null && value !== ""

/** Un changement d'issue se dit par ce qu'il touche d'abord : sa colonne (déplacée), puis son assigné. */
export function changeKind(call: AssistantToolCall): ChangeKind | null {
  if (call.name !== "update_issue") return KINDS[call.name] ?? null
  const input = inputOf(call)
  if (given(input.status) || given(input.statusId)) return "moved"
  if (given(input.assignee) || given(input.assigneeId)) return "assigned"
  return "changed"
}

function whatOf(call: AssistantToolCall): string {
  if (call.target) return [call.target.key, call.target.title].filter(Boolean).join(" ")
  const input = inputOf(call)
  const named = [input.title, input.name, input.issue].find((value) => typeof value === "string" && value.trim())
  if (typeof named === "string") return named.trim()
  return (call.output ?? "").split("\n")[0].slice(0, 120)
}

function changeOf(call: AssistantToolCall, id: string): Change | null {
  if (call.status !== "success") return null
  const kind = changeKind(call)
  return kind ? { id, kind, what: whatOf(call), call } : null
}

/** Les changements de la conversation, du plus récent au plus ancien : ceux de ses tours, puis ceux de ses cartes. */
export function changesOf(turns: readonly CortexTurn[], done: readonly AssistantToolCall[] = []): Change[] {
  const fromTurns = turns.flatMap((turn) =>
    (turn.answer?.toolCalls ?? []).map((call, i) => changeOf(call, `${turn.id}:${i}`)),
  )
  const fromCards = done.map((call, i) => changeOf(call, `card:${i}`))
  return [...fromTurns, ...fromCards].filter((change): change is Change => change !== null).reverse()
}
