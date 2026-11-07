import type { DeliveryRun } from "@/lib/api/delivery-service"
import type { Signal } from "@/lib/store/notification-store"
import { resultsToJudge } from "@/lib/window/missions"

/** Les signaux qui attendent la personne elle-même : une demande d'accord d'un agent, une mention. */
const ASKS = new Set<Signal["type"]>(["agentApproval", "mention"])

/**
 * Le nombre de « Waiting for you » (R121), qui remplace la cloche : les demandes d'accord et les mentions encore non
 * lues, et les résultats de mission qui attendent son jugement. Rien que ce que l'app sait déjà.
 */
export function waitingCount(
  signals: readonly Signal[],
  runs: readonly DeliveryRun[],
  me: string | number | null | undefined,
): number {
  const asks = signals.filter((signal) => !signal.read && ASKS.has(signal.type)).length
  return asks + resultsToJudge(runs, me).length
}
