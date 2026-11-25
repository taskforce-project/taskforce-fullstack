import type { MissionEvidence } from "@/lib/api/delivery-service"
import { chainOf, checkDossier, type DossierCheck } from "@/lib/evidence/verifier/dossier"

/**
 * La page de vérification recalcule le dossier avant d'en rien dire (R161 B1, R159 P5), avec le vérificateur du runner,
 * partagé et non recopié (`lib/evidence`, `npm run share:app`) : chaque empreinte de la chaîne, l'en-tête face à la
 * chaîne, chaque texte face à son empreinte, et le sceau, comparé aux clés de cette instance quand elle les a données.
 */
export interface RecordCheck {
  /** Quand la page a vérifié (ISO, UTC). */
  readonly at: string
  /** La chaîne tient, ou pourquoi elle ne tient pas. */
  readonly chain: "holds" | "format" | "unreadable" | "link" | "root"
  /** L'événement où la chaîne casse. */
  readonly brokenAt: number | null
  /** Ce que prouve le reste du dossier ; nul quand la chaîne ne tient pas. */
  readonly details: DossierCheck | null
  /** La page a eu les clés de l'instance : un sceau d'une autre clé ne vient pas d'elle. */
  readonly keysKnown: boolean
}

/** Vérifie un dossier dans l'app : jamais d'exception, une chaîne illisible se dit comme les autres. */
export async function checkRecord(file: MissionEvidence, keys: readonly string[] | null, now: () => Date = () => new Date()): Promise<RecordCheck> {
  const at = now().toISOString()
  const record = file as unknown as Record<string, unknown>
  const chain = chainOf(record)
  if (!chain.ok) return { at, chain: chain.reason, brokenAt: chain.brokenAt ?? null, details: null, keysKnown: keys !== null }
  try {
    const details = await checkDossier(record, { keys: keys ?? [] })
    return { at, chain: "holds", brokenAt: null, details, keysKnown: keys !== null }
  } catch {
    return { at, chain: "unreadable", brokenAt: null, details: null, keysKnown: keys !== null }
  }
}
