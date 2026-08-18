"use client"

import { useEffect } from "react"
import {
  GitCommitHorizontal, CircleDot, CheckCircle2, Clock,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useProfileStore, type HeatWeek, type HeatCell } from "@/lib/store/profile-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

/**
 * Aperçu « Mon profil » (stats + heatmap de contributions), extrait de l'ancienne page `/profile`
 * (supprimée) pour être monté dans la section **Profil** du modal Réglages — tout dans le modal, façon
 * Claude, plutôt qu'une page standalone. Autonome : lit le workspace courant du store.
 *
 * NB : le flux « Activité récente » a été retiré (jugé peu utile ici — retour user).
 */

const HEAT_COLORS = [
  "bg-muted",
  "bg-emerald-900/60",
  "bg-emerald-700/70",
  "bg-emerald-500/80",
  "bg-emerald-400",
  "bg-emerald-300",
]

function ContributionGraph({ heatmap }: Readonly<{ heatmap: HeatWeek[] }>) {
  const totalContribs = heatmap.flatMap((w) => w.days).reduce((a, cell) => a + cell.val, 0)

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Activité</h3>
        <span className="text-xs text-muted-foreground">{totalContribs} contributions sur 5 mois</span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {heatmap.map((week) => (
          <div key={week.id} className="flex flex-col gap-1">
            {week.days.map((cell: HeatCell) => (
              <div
                key={cell.id}
                title={`${cell.val} contribution${cell.val === 1 ? "" : "s"}`}
                className={cn("h-3 w-3 rounded-sm transition-colors", HEAT_COLORS[Math.min(cell.val, HEAT_COLORS.length - 1)])}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-1.5 mt-2">
        <span className="text-[10px] text-muted-foreground">Moins</span>
        {HEAT_COLORS.map((c) => (
          <div key={c} className={cn("h-3 w-3 rounded-sm", c)} />
        ))}
        <span className="text-[10px] text-muted-foreground">Plus</span>
      </div>
    </div>
  )
}

export function ProfileOverview() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug ?? "")
  const { stats, heatmap, fetchProfile } = useProfileStore()

  useEffect(() => {
    if (slug) fetchProfile(slug).catch(() => { /* silent */ })
  }, [slug, fetchProfile])

  return (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Issues créées",    value: stats?.issuesCreated   ?? "—", icon: <CircleDot className="h-4 w-4" /> },
          { label: "Clôturées",        value: stats?.issuesClosed    ?? "—", icon: <CheckCircle2 className="h-4 w-4" /> },
          { label: "Cycles terminés",  value: stats?.cyclesCompleted ?? "—", icon: <GitCommitHorizontal className="h-4 w-4" /> },
          { label: "Jours actifs",     value: stats?.daysActive      ?? "—", icon: <Clock className="h-4 w-4" /> },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{stat.label}</span>
              <span className="text-muted-foreground">{stat.icon}</span>
            </div>
            <span className="text-2xl font-bold text-foreground tabular-nums">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Heatmap de contributions */}
      <ContributionGraph heatmap={heatmap} />
    </div>
  )
}
