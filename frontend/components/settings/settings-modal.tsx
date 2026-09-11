"use client"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useSettingsStore } from "@/lib/store/settings-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import {
  SECTIONS,
  SettingsNav,
  SettingsPanels,
  type SettingsSection,
} from "@/app/(protected)/[workspace]/settings/page"

/**
 * Modal Settings « façon Claude » : un grand dialogue avec navigation latérale + contenu défilant,
 * ouvrable depuis n'importe quel CTA via {@link useSettingsStore}. Réutilise exactement les mêmes
 * sections/panneaux que la page `/settings` (aucune duplication).
 */
export function SettingsModal() {
  const open = useSettingsStore((s) => s.open)
  const section = useSettingsStore((s) => s.section)
  const closeSettings = useSettingsStore((s) => s.closeSettings)
  const setSection = useSettingsStore((s) => s.setSection)
  const { t } = usePreferencesStore()

  // Section validée (repli sur "profile" si inconnue).
  const active = (SECTIONS.some((s) => s.key === section) ? section : "profile") as SettingsSection
  const activeSection = SECTIONS.find((s) => s.key === active)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeSettings() }}>
      <DialogContent
        className="max-w-5xl sm:max-w-5xl w-[94vw] h-[84vh] gap-0 overflow-hidden p-0 sm:rounded-2xl"
      >
        <DialogTitle className="sr-only">{t.settings.title}</DialogTitle>
        {/* min-w-0 : DialogContent est en display:grid ; sans lui, ce grid-item flex gonfle à la
            largeur min-content de son contenu (ex. catalogue d'intégrations) et déborde/coupe à droite. */}
        <div className="flex h-full min-h-0 min-w-0 flex-col sm:flex-row">
          {/* Navigation latérale (>= sm) - la recherche (dans SettingsNav) tient lieu d'en-tête. */}
          <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r bg-muted/30 p-4 sm:flex">
            <SettingsNav active={active} onSelect={setSection} />
          </aside>

          {/* Nav mobile (< sm) : la barre laterale est masquee sur telephone, un selecteur de section
              prend le relais - sinon impossible de changer de section (retour CEO « pas responsive »). */}
          <div className="shrink-0 border-b p-3 sm:hidden">
            <select
              value={active}
              onChange={(e) => setSection(e.target.value as SettingsSection)}
              aria-label={activeSection?.label ?? "Settings section"}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary/50"
            >
              {SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Contenu de la section */}
          <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-6 md:p-8">
            <h2 className="mb-5 text-base font-semibold text-foreground">{activeSection?.label}</h2>
            <SettingsPanels active={active} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
