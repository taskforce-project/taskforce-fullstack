import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"
import type { NotifType, Signal } from "@/lib/store/notification-store"
import { parseServerDate } from "@/lib/utils/server-date"
import type { WaitingItem } from "@/lib/window/arrival"

type InboxTexts = (typeof CONSTANTS_EN)["inbox"]

/**
 * « Waiting for you » (R141, séance n°20) : trois groupes de lignes, une phrase chacune. Ce qui attend la personne (R128,
 * lu des demandes elles-mêmes), ce qui s'est passé, les alertes. Plus de tableau, plus de colonne : une ligne dit ce qui
 * se passe dans les mots de quelqu'un qui ne code pas (R133).
 */

/** Ce qui presse et concerne le temps ou la charge : le reste du fil raconte. */
const ALERTS = new Set<NotifType>(["overdue", "dueSoon", "overload"])

/** Les signaux dont le serveur écrit le corps pour la personne ; celui des agents reste dans l'issue (R133). */
const HINTED = new Set<NotifType>(["mention", "commented", "overload"])

/** Les lignes d'un groupe avant « Show more » : pas de pagination sous quelques dizaines de lignes. */
export const GROUP_PAGE = 50

/** Les alertes, les plus urgentes d'abord : l'ordre du store. */
export function alertsOf(signals: readonly Signal[]): Signal[] {
  return signals.filter((signal) => ALERTS.has(signal.type))
}

const timeOf = (signal: Signal): number => parseServerDate(signal.createdAt).getTime()

/**
 * Ce qui s'est passé, le plus récent d'abord. Ni une demande d'accord (ce qui est ouvert est en haut, lu des demandes
 * elles-mêmes, et le reste se lit dans la mission), ni une mention non lue, ni la fin d'une mission dont le résultat
 * attend déjà en haut : une ligne ne répète pas une autre.
 */
export function happenedOf(signals: readonly Signal[], waiting: readonly WaitingItem[]): Signal[] {
  const toReview = new Set(waiting.filter((item) => item.kind === "result").map((item) => item.key))
  return signals
    .filter((signal) => !ALERTS.has(signal.type) && signal.type !== "agentApproval")
    .filter((signal) => !(signal.type === "mention" && !signal.read))
    .filter((signal) => !(signal.type === "agentDone" && toReview.has(signal.issueId)))
    .sort((a, b) => timeOf(b) - timeOf(a))
}

/** Les mentions, lues ou non, pour leur adresse à elles (`/inbox/mentions`). */
export function mentionsOf(signals: readonly Signal[]): Signal[] {
  return signals.filter((signal) => signal.type === "mention")
}

/** La phrase d'une ligne de ce qui attend la personne. */
export function waitingSentence(item: WaitingItem, t: InboxTexts): string {
  const title = item.title || item.label
  if (item.kind === "approval") return fillText(item.count > 1 ? t.approveMany : t.approve, { title, count: item.count })
  if (item.kind === "result") return fillText(t.review, { title })
  return fillText(t.mentioned, { who: item.who || t.someone, title })
}

/** La phrase d'un signal : celle que le serveur a écrite, ou son auteur et son geste quand il n'a écrit que le titre. */
export function signalSentence(signal: Signal, t: InboxTexts): string {
  const who = signal.actor?.name || t.someone
  switch (signal.type) {
    case "mention": return fillText(t.mentioned, { who, title: signal.title })
    case "commented": return fillText(t.commented, { who, title: signal.title })
    case "assigned": return fillText(t.assigned, { who, title: signal.title })
    default: return signal.title
  }
}

/** Le nom du genre de signal : au survol, à la place de l'ancienne colonne. */
export function signalKind(signal: Signal, t: InboxTexts): string {
  return (t.types as Readonly<Record<string, string>>)[signal.type] ?? t.types.other
}

/** Le détail au survol : le genre, le projet et les mots du commentaire. */
export function signalHint(signal: Signal, t: InboxTexts): string {
  const kind = [signalKind(signal, t), signal.operation].filter(Boolean).join(", ")
  return signal.body && HINTED.has(signal.type) ? `${kind}: ${signal.body}` : kind
}
