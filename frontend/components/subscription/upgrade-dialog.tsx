"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { useUpgradeStore } from "@/lib/store/upgrade-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

/**
 * Pont « upgrade » — monté une fois globalement (AppShell), piloté par `useUpgradeStore`.
 *
 * <p>Historiquement un petit modal intermédiaire ; désormais une <b>redirection directe</b> vers la page
 * <b>Facturation</b> (grille complète des 4 forfaits). Motif (retour user) : cliquer « abonnement / améliorer »
 * ne doit pas ouvrir une pop-up, mais envoyer <b>directement sur les plans</b>. Comme tous les CTA d'upgrade
 * de l'app appellent `openUpgrade()` (menu compte, switcher de workspace, conso Cortex, membres, analytics…),
 * centraliser la redirection ici les couvre <b>tous</b> d'un coup, sans toucher chaque appelant.</p>
 *
 * <p>Ne rend rien : dès que le store passe {@code open=true}, on referme (reset) et on navigue.</p>
 */
export function UpgradeDialog() {
  const open = useUpgradeStore((s) => s.open)
  const closeUpgrade = useUpgradeStore((s) => s.closeUpgrade)
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    closeUpgrade() // reset immédiat du drapeau (évite de re-déclencher au prochain rendu)
    if (slug) router.push(`/${slug}/billing`)
  }, [open, slug, closeUpgrade, router])

  return null
}
