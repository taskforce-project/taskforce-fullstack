import type { DeliveryRun, OpenApproval } from "@/lib/api/delivery-service"
import type { Signal } from "@/lib/store/notification-store"
import { resultsToJudge } from "@/lib/window/missions"

/**
 * Le nombre de « Waiting for you » (R121 ; R128, séance n°19), qui remplace la cloche : ce qui bloque un agent ou attend
 * le jugement de la personne, rien d'autre. Les demandes encore ouvertes, comptées une par une, et les résultats à
 * juger. Une notification d'accord non lue n'en dit rien : rien ne la marquait lue quand sa demande se fermait.
 */
export function waitingCount(
  approvals: readonly OpenApproval[],
  runs: readonly DeliveryRun[],
  me: string | number | null | undefined,
): number {
  return approvals.reduce((sum, row) => sum + row.requests, 0) + resultsToJudge(runs, me).length
}

/** Les mentions encore non lues (R128) : comptées à part de ce qui bloque un agent, un point discret et une ligne du volet. */
export function unreadMentions(signals: readonly Signal[]): Signal[] {
  return signals.filter((signal) => !signal.read && signal.type === "mention")
}

/**
 * Le dernier signal d'un agent reçu (une demande, une mission finie, en échec, refusée) : quand il change, ce qui attend
 * la personne se relit tout de suite. L'identifiant le plus grand, le plus récent ; null sans signal d'agent. Les
 * signaux sont triés par urgence, pas par date.
 */
const AGENT_SIGNALS = new Set<Signal["type"]>(["agentApproval", "agentDone", "agentFailed", "agentNotStarted"])

export function latestAgentSignal(signals: readonly Signal[]): number | null {
  let latest: number | null = null
  for (const signal of signals) {
    if (!AGENT_SIGNALS.has(signal.type)) continue
    const id = Number(signal.id)
    if (latest === null || id > latest) latest = id
  }
  return latest
}
