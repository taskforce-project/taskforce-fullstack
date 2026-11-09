/** Une note du Brain OS, lue avec les droits de la personne : ce que Cortex a lu s'ouvre d'un clic (R137). */
import { apiClient } from "./client"
import { NOTE_ROUTES } from "../config/api-routes"

export interface BrainNote {
  id: number
  title: string
  content: string | null
  domain: string | null
  updatedAt: string | null
}

/** La note, par son id. Appel de fond : ce qui n'a pas marché se dit dans son dialogue. */
export async function getNote(slug: string, nodeId: number): Promise<BrainNote> {
  const res = await apiClient.get<{ data: BrainNote }>(NOTE_ROUTES.NOTE(slug, nodeId), { silentError: true })
  return res.data.data
}
