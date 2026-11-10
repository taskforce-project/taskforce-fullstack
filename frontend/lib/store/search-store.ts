import { create } from "zustand"

import { searchIssueComments, searchIssues, type IssueCommentHit, type IssueHit } from "@/lib/api/issue-service"
import { searchNotes, type NoteHit } from "@/lib/api/note-service"

// ---------------------------------------------------------------------------
// La recherche d'issues de la fenêtre (R123, R124, séance n°18) : Ctrl+K les trouve par leur clé ou leur titre et les
// ouvre dans le volet ; le « @ » et le « + » du compositeur les joignent à une demande ; l'arrivée d'une conversation
// suggère à partir des dernières changées (la recherche sans texte). Ctrl+K cherche aussi dans ce qui est écrit : les
// commentaires et les notes (R141, séance n°20). Un domaine = un store ; un échec rend null ou false.
// ---------------------------------------------------------------------------

/** Les recherches gardées au plus : les plus anciennes partent. */
const MAX_KEPT = 30

/** Une recherche par mots lit au moins un mot de deux lettres (le serveur ne cherche rien en deçà). */
const MIN_WORDS_QUERY = 2

/** Une recherche se nomme par son espace et son texte, sans la casse ni les blancs autour. */
export const searchKey = (slug: string, query: string): string => `${slug}:${query.trim().toLowerCase()}`

/** La carte des recherches, avec celle-ci en plus et les plus anciennes en moins. */
function kept<T>(found: Record<string, T>, key: string, value: T): Record<string, T> {
  const others = Object.entries(found).filter(([other]) => other !== key).slice(-(MAX_KEPT - 1))
  return Object.fromEntries([...others, [key, value]])
}

interface SearchState {
  /** Les issues trouvées, par recherche (`searchKey`). */
  hits: Record<string, IssueHit[]>
  /** La dernière recherche aboutie de chaque espace : une liste la garde le temps que la suivante arrive. */
  latest: Record<string, IssueHit[]>
  /** Les recherches en cours, par recherche. */
  pending: Record<string, boolean>
  /** Les issues trouvées par leurs commentaires, par recherche. */
  comments: Record<string, IssueCommentHit[]>
  /** Les notes trouvées, par recherche. */
  notes: Record<string, NoteHit[]>
  /**
   * Cherche les issues de l'espace (sans texte : les dernières changées) ; les garde sous `searchKey` et les rend. null
   * en cas d'échec, la recherche d'avant restant gardée.
   */
  find: (slug: string, query: string) => Promise<IssueHit[] | null>
  /**
   * Cherche dans ce qui est écrit, les commentaires et les notes (R141), et garde chaque réponse sous `searchKey`. false
   * quand l'une des deux échoue : l'autre reste, et une liste vide tient la place de celle qui manque.
   */
  findInside: (slug: string, query: string) => Promise<boolean>
}

export const useSearchStore = create<SearchState>()((set) => ({
  hits: {},
  latest: {},
  pending: {},
  comments: {},
  notes: {},

  find: async (slug, query) => {
    if (!slug) return null
    const key = searchKey(slug, query)
    set((s) => ({ pending: { ...s.pending, [key]: true } }))
    try {
      const found = await searchIssues(slug, query.trim())
      set((s) => ({ hits: kept(s.hits, key, found), latest: { ...s.latest, [slug]: found } }))
      return found
    } catch {
      return null
    } finally {
      set((s) => {
        const pending = { ...s.pending }
        delete pending[key]
        return { pending }
      })
    }
  },

  findInside: async (slug, query) => {
    if (!slug) return false
    const key = searchKey(slug, query)
    const text = query.trim()
    if (text.length < MIN_WORDS_QUERY) {
      set((s) => ({ comments: kept(s.comments, key, []), notes: kept(s.notes, key, []) }))
      return true
    }
    const [comments, notes] = await Promise.allSettled([searchIssueComments(slug, text), searchNotes(slug, text)])
    set((s) => ({
      comments: kept(s.comments, key, comments.status === "fulfilled" ? comments.value : []),
      notes: kept(s.notes, key, notes.status === "fulfilled" ? notes.value : []),
    }))
    return comments.status === "fulfilled" && notes.status === "fulfilled"
  },
}))
