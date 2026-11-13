import axios from "axios"

import { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"

type ConnectTexts = (typeof CONSTANTS_EN)["connect"]
export type FailureKind = keyof ConnectTexts["failures"]

/**
 * Une connexion à un outil qui n'a pas abouti (revue des écrans de J2, séance n°23, R160) : la raison que le serveur
 * donne (`error` de sa réponse, un code stable), et son texte brut, gardé pour « Show what the server said ». L'écran ne
 * lit jamais ce texte pour décider : il dit la raison en mots.
 */
export interface ConnectFailure {
  /** L'outil du geste qui a échoué. */
  key: string
  /** La raison : un code du serveur (`CONNECT_…`), `network` sans réponse, `forbidden` pour un rôle qui manque. */
  kind: FailureKind
  /** Ce que le serveur a dit, tel quel ; null quand il n'a rien dit. */
  raw: string | null
}

/** Une raison que l'écran sait dire ; une autre se dit « unknown », avec le texte brut à deux clics. */
const isKind = (code: unknown): code is FailureKind =>
  typeof code === "string" && Object.prototype.hasOwnProperty.call(CONSTANTS_EN.connect.failures, code)

/**
 * L'échec d'un geste, lu dans l'erreur de l'appel : sa raison, et le texte brut à part. `fallback` : ce que le geste
 * dit quand le serveur ne donne pas de raison connue (« Your company's app wasn't saved » plutôt qu'une connexion).
 */
export function failureOf(error: unknown, key: string, fallback: FailureKind = "unknown"): ConnectFailure {
  if (axios.isAxiosError(error)) {
    if (!error.response) return { key, kind: "network", raw: error.message || null }
    const data = error.response.data as { error?: unknown; message?: unknown } | undefined
    const raw = typeof data?.message === "string" && data.message ? data.message : error.message || null
    if (error.response.status === 403) return { key, kind: "forbidden", raw }
    const code = data?.error
    return { key, kind: isKind(code) ? code : fallback, raw }
  }
  return { key, kind: fallback, raw: error instanceof Error && error.message ? error.message : null }
}

/**
 * Ce qui s'est passé et quoi faire, en une phrase pour la personne (R133). Une clé n'est proposée que si l'outil en offre
 * une (`withKey`), et alors le panneau offre aussi son bouton.
 */
export function failureSentence(failure: Pick<ConnectFailure, "kind">, name: string, t: ConnectTexts, withKey = false): string {
  const keyed = withKey ? (t.failuresWithKey as Readonly<Record<string, string | undefined>>)[failure.kind] : undefined
  return fillText(keyed ?? t.failures[failure.kind], { name })
}

/** Cet échec se répare-t-il par une clé, quand l'outil en offre une ? Le panneau montre alors son bouton. */
export function keyHelps(failure: Pick<ConnectFailure, "kind">, t: ConnectTexts): boolean {
  return Object.prototype.hasOwnProperty.call(t.failuresWithKey, failure.kind)
}

/** Où le geste s'est arrêté, un clic plus loin. */
export function failureStep(failure: Pick<ConnectFailure, "kind">, name: string, t: ConnectTexts): string {
  return fillText(t.failureStep, { step: fillText(t.failureSteps[failure.kind], { name }) })
}
