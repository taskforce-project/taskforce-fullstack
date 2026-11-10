import axios from "axios"

import { AI_TIMEOUT_MS, getErrorMessage, getErrorStatus } from "@/lib/api/client"
import type { CONSTANTS_EN } from "@/lib/constants_en"
import { fillText } from "@/lib/delivery/result-card"

type ThreadTexts = (typeof CONSTANTS_EN)["thread"]

/** Le mot du serveur quand la validation refuse, trop général pour être montré : ce sont ses détails qui disent quoi. */
const GENERIC = "Invalid input data"

/** Le refus d'un champ de la demande, tel que le serveur l'a écrit ; null sans détail. */
function refusedField(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null
  const details = (error.response?.data as { validationErrors?: Record<string, string[]> } | undefined)?.validationErrors
  if (!details) return null
  return details.message?.[0] ?? Object.values(details).flat()[0] ?? null
}

/**
 * Ce que dit la conversation quand une demande n'a pas eu de réponse (R133, TF-J1-15) : ce qui s'est passé et quoi faire,
 * depuis la vraie cause. « Sorry, I couldn't answer » cachait un refus de taille. Le plafond de tokens (409) a sa carte, et
 * ne passe pas ici.
 */
export function failureText(error: unknown, t: ThreadTexts): string {
  const refused = refusedField(error)
  if (refused) return refused
  const status = getErrorStatus(error)
  if (status === undefined) {
    return axios.isAxiosError(error) && error.code === "ECONNABORTED"
      ? fillText(t.failTimeout, { seconds: String(Math.round(AI_TIMEOUT_MS / 1000)) })
      : t.failNetwork
  }
  if (status >= 500) return t.failServer
  const said = getErrorMessage(error)
  return said && said !== GENERIC ? said : t.failServer
}
