import { create } from "zustand"

import { searchIssues, type IssueHit } from "@/lib/api/issue-service"

// ---------------------------------------------------------------------------
// La recherche d'issues de la fenêtre (R123, R124, séance n°18) : Ctrl+K les trouve par leur clé ou leur titre et les
// ouvre dans le volet ; le « @ » et le « + » du compositeur les joignent à une demande ; l'arrivée d'une conversation
// suggère à partir des dernières changées (la recherche sans texte). Un domaine = un store ; un échec rend null.
// ---------------------------------------------------------------------------

/** Les recherches gardées au plus : les plus anciennes partent. */
const MAX_KEPT = 30

/** Une recherche se nomme par son espace et son texte, sans la casse ni les blancs autour. */
export const searchKey = (slug: string, query: string): string => `${slug}:${query.trim().toLowerCase()}`

interface SearchState {
  /** Les issues trouvées, par recherche (`searchKey`). */
  hits: Record<string, IssueHit[]>
  /** La dernière recherche aboutie de chaque espace : une liste la garde le temps que la suivante arrive. */
  latest: Record<string, IssueHit[]>
  /** Les recherches en cours, par recherche. */
  pending: Record<string, boolean>
  /**
   * Cherche les issues de l'espace (sans texte : les dernières changées) ; les garde sous `searchKey` et les rend. null
   * en cas d'échec, la recherche d'avant restant gardée.
   */
  find: (slug: string, query: string) => Promise<IssueHit[] | null>
}

export const useSearchStore = create<SearchState>()((set) => ({
  hits: {},
  latest: {},
  pending: {},

  find: async (slug, query) => {
    if (!slug) return null
    const key = searchKey(slug, query)
    set((s) => ({ pending: { ...s.pending, [key]: true } }))
    try {
      const found = await searchIssues(slug, query.trim())
      set((s) => {
        const kept = Object.entries(s.hits).filter(([other]) => other !== key).slice(-(MAX_KEPT - 1))
        return { hits: Object.fromEntries([...kept, [key, found]]), latest: { ...s.latest, [slug]: found } }
      })
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
}))
