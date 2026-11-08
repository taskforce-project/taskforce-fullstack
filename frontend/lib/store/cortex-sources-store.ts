import { create } from "zustand";

import { getCortexSources, type CortexSource } from "../api/cortex-sources-service";

// ---------------------------------------------------------------------------
// Store de ce que Cortex peut lire dans l'espace (R125, séance n°18) : ses sources, comptées et datées, pour le volet
// « Progress ». Un domaine = un store ; une lecture qui échoue rend null et garde ce qui était lu.
// ---------------------------------------------------------------------------

interface CortexSourcesState {
  /** Les sources de l'espace lu, dans l'ordre du serveur. `null` = pas encore lues. */
  sources: CortexSource[] | null;
  /** L'espace des sources lues : un autre espace repart de rien. */
  slug: string | null;
  /** La dernière lecture a échoué : le volet le dit au lieu d'attendre. */
  failed: boolean;

  fetchSources: (slug: string) => Promise<CortexSource[] | null>;
}

export const useCortexSourcesStore = create<CortexSourcesState>((set, get) => ({
  sources: null,
  slug: null,
  failed: false,

  fetchSources: async (slug) => {
    if (get().slug !== slug) set({ sources: null, slug, failed: false });
    try {
      const { sources } = await getCortexSources(slug);
      if (get().slug === slug) set({ sources, failed: false });
      return sources;
    } catch {
      if (get().slug === slug) set({ failed: true });
      return null;
    }
  },
}));
