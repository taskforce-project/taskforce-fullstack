"use client"

import { Settings2 } from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useSettingsStore } from "@/lib/store/settings-store"
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

  // Section validée (repli sur "profile" si inconnue).
  const active = (SECTIONS.some((s) => s.key === section) ? section : "profile") as SettingsSection
  const activeSection = SECTIONS.find((s) => s.key === active)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeSettings() }}>
      <DialogContent
        className="max-w-4xl sm:max-w-4xl w-[93vw] h-[82vh] gap-0 overflow-hidden p-0 sm:rounded-2xl"
      >
        <DialogTitle className="sr-only">Réglages</DialogTitle>
        {/* min-w-0 : DialogContent est en display:grid ; sans lui, ce grid-item flex gonfle à la
            largeur min-content de son contenu (ex. catalogue d'intégrations) et déborde/coupe à droite. */}
        <div className="flex h-full min-h-0 min-w-0">
          {/* Navigation latérale */}
          <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r bg-muted/30 p-4 sm:flex">
            <div className="mb-4 flex items-center gap-2 px-3 text-sm font-semibold">
              <Settings2 className="size-4 text-muted-foreground" /> Réglages
            </div>
            <SettingsNav active={active} onSelect={setSection} />
          </aside>

          {/* Contenu de la section */}
          <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
            <h2 className="mb-5 text-base font-semibold text-foreground">{activeSection?.label}</h2>
            <SettingsPanels active={active} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
