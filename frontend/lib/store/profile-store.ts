import { create } from "zustand";
import { getProfile, type ProfileData, type ProfileStats, type ActivityEntry, type HeatmapEntry } from "../api/profile-service";

// ---------------------------------------------------------------------------
// Heatmap helpers
// ---------------------------------------------------------------------------

const HEATMAP_WEEKS = 20;
const HEATMAP_DAYS  = 7;

export interface HeatCell { id: string; val: number }
export interface HeatWeek { id: string; days: HeatCell[] }

/**
 * Construit la grille heatmap (20 semaines × 7 jours) à partir des données API.
 * Les jours sans activité ont une valeur de 0.
 */
function buildHeatmapGrid(entries: HeatmapEntry[]): HeatWeek[] {
  // Indexer les données par date ISO
  const byDate = new Map<string, number>();
  for (const e of entries) {
    byDate.set(e.date, e.count);
  }

  // Générer la grille en remontant depuis aujourd'hui
  const today    = new Date();
  const grid: HeatWeek[] = [];

  // On part depuis (HEATMAP_WEEKS * 7 - 1) jours avant aujourd'hui
  const totalDays = HEATMAP_WEEKS * HEATMAP_DAYS;
  const start     = new Date(today);
  start.setDate(today.getDate() - totalDays + 1);

  const current = new Date(start);

  for (let w = 0; w < HEATMAP_WEEKS; w++) {
    const days: HeatCell[] = [];
    for (let d = 0; d < HEATMAP_DAYS; d++) {
      const iso = current.toISOString().slice(0, 10);
      days.push({ id: iso, val: byDate.get(iso) ?? 0 });
      current.setDate(current.getDate() + 1);
    }
    grid.push({ id: `w${w}`, days });
  }

  return grid;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface ProfileState {
  stats:    ProfileStats | null;
  activity: ActivityEntry[];
  heatmap:  HeatWeek[];
  loading:  boolean;
  error:    string | null;

  fetchProfile: (slug: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set) => ({
  stats:    null,
  activity: [],
  heatmap:  [],
  loading:  false,
  error:    null,

  fetchProfile: async (slug: string) => {
    set({ loading: true, error: null });
    try {
      const data: ProfileData = await getProfile(slug);
      set({
        stats:    data.stats,
        activity: data.activity,
        heatmap:  buildHeatmapGrid(data.heatmap),
        loading:  false,
      });
    } catch (err) {
      console.error("[ProfileStore] fetchProfile error:", err);
      set({ loading: false, error: "Impossible de charger le profil" });
    }
  },
}));
