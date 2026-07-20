"use client"

import { ChevronRight, Search } from "lucide-react"

import { BrandLogo } from "@/components/ui/brand-logo"
import { useSettingsStore } from "@/lib/store/settings-store"

/** Connecteurs mis en avant dans la pilule (clés du catalogue — cf. ConnectorCatalog.java). */
const PILL_TOOLS = [
  { slug: "github", name: "GitHub" },
  { slug: "slack", name: "Slack" },
  { slug: "plane", name: "Plane" },
  { slug: "linear", name: "Linear" },
] as const

function greetingFor(hour: number): string {
  if (hour < 5) return "Encore debout"
  if (hour < 12) return "Bonjour"
  if (hour < 18) return "Bon après-midi"
  return "Bonsoir"
}

interface DashboardHeroProps {
  /** Nom réel de l'utilisateur (displayName) — vide si inconnu. */
  readonly displayName: string
}

/**
 * En-tête centré du dashboard (façon page d'accueil Cloudflare) :
 * pilule « Branchez vos outils sur le Brain OS » (→ Réglages / Intégrations),
 * salutation + H1, puis grande recherche qui ouvre la palette Cmd+K existante.
 */
export function DashboardHero({ displayName }: DashboardHeroProps) {
  const openSettings = useSettingsStore((s) => s.openSettings)
  const greeting = greetingFor(new Date().getHours())

  const openPalette = () => {
    // La palette est pilotée par le raccourci global Ctrl/Cmd+K (app-topbar) :
    // on rejoue l'événement clavier — la palette étant fermée, le toggle = ouverture.
    globalThis.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))
  }

  return (
    <div className="flex flex-col items-center gap-5 pt-2 text-center">
      {/* Pilule d'onboarding des connecteurs — discrète : bordure, fond card, hover. */}
      <button
        type="button"
        onClick={() => openSettings("integrations")}
        className="group flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-2.5 pr-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          {PILL_TOOLS.map((t) => (
            <BrandLogo key={t.slug} slug={t.slug} name={t.name} className="size-3.5 text-[7px]" />
          ))}
        </span>
        <span>Branchez vos outils sur le Brain OS</span>
        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </button>

      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {greeting}
          {displayName ? `, ${displayName}` : ""}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Reprenez là où vous en étiez.</h1>
      </div>

      {/* Grande recherche : simple déclencheur de la palette Cmd+K (aucune logique dupliquée). */}
      <button
        type="button"
        onClick={openPalette}
        aria-label="Ouvrir la recherche (Ctrl+K)"
        className="flex w-full max-w-2xl items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate">Rechercher une opération, une issue, une action…</span>
        <kbd className="flex shrink-0 items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
          Ctrl K
        </kbd>
      </button>
    </div>
  )
}
