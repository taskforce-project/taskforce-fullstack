"use client"

import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/** Libellé de la touche de commande selon le système : « ⌘ » sur Mac et iOS, « Ctrl » ailleurs. */
export function modKeyLabel(platform: string): string {
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? "⌘" : "Ctrl"
}

function clientLabel(): string {
  return modKeyLabel(navigator.platform || navigator.userAgent || "")
}

/**
 * Libellé de la touche de commande pour l'utilisateur courant (raccourcis ⌘K / Ctrl+K). Le rendu serveur
 * et l'hydratation affichent « Ctrl » ; le client se corrige juste après, sans écart d'hydratation.
 */
export function useModKeyLabel(): string {
  return useSyncExternalStore(subscribe, clientLabel, () => "Ctrl")
}
