/**
 * Les notes de l'espace (le Brain OS, `/api/workspaces/{slug}/brain`) : Ctrl+K les cherche par leurs mots, le volet les
 * lit (R141, séance n°20). Les notes d'un projet que la personne ne voit pas ne répondent jamais.
 */
import { apiClient } from "./client"
import { NOTE_ROUTES } from "../config/api-routes"

export interface Note {
  id: number
  title: string
  /** En Markdown ; absent d'un résultat de recherche, qui porte son passage. */
  content: string | null
  /** L'adresse du document d'origine quand la note vient d'ailleurs. */
  contentUrl: string | null
  updatedAt: string | null
}

/** Une note trouvée : son passage, en texte brut, autour de ce qu'on cherche. */
export interface NoteHit {
  id: number
  title: string
  excerpt: string
}

interface RawHit {
  node: Pick<Note, "id" | "title">
  excerpt: string | null
}

/** Le texte que la recherche envoie au plus : au-delà, c'est une question pour Cortex, pas une recherche. */
const MAX_QUERY = 200

/** Cherche dans les notes, en plein texte : à la frappe, sans occuper le modèle. Appel de fond : jamais de toast. */
export async function searchNotes(slug: string, query: string, limit = 6): Promise<NoteHit[]> {
  const res = await apiClient.post<{ data: RawHit[] }>(
    NOTE_ROUTES.SEARCH(slug),
    { query: query.slice(0, MAX_QUERY), topK: limit, textOnly: true },
    { silentError: true },
  )
  return (res.data.data ?? []).map((hit) => ({ id: hit.node.id, title: hit.node.title, excerpt: hit.excerpt ?? "" }))
}

/** Une note, à lire dans le volet. Le volet dit lui-même si elle ne s'ouvre pas : jamais de toast. */
export async function getNote(slug: string, id: number): Promise<Note> {
  const res = await apiClient.get<{ data: Note }>(NOTE_ROUTES.BY_ID(slug, id), { silentError: true })
  return res.data.data
}
