"use client"

import { usePreferencesStore } from "@/lib/store/preferences-store"

/** Ce qui reste d'un tour que la personne a arrêté (R134) : une ligne calme, dans le fil et dans l'historique. */
export function StoppedNotice() {
  const line = usePreferencesStore((s) => s.t.composer.stopped)
  return <p className="my-3 text-xs text-muted-foreground">{line}</p>
}
