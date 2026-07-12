"use client"

import { Sparkles, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useUpgradeStore } from "@/lib/store/upgrade-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"

/**
 * Modal d'upgrade léger — monté une fois globalement (AppShell), piloté par `useUpgradeStore`.
 * Renvoie vers la page **Facturation** (grille complète des 4 forfaits) plutôt que de dupliquer
 * les cartes dans un dialogue étroit.
 */
export function UpgradeDialog() {
  const open = useUpgradeStore((s) => s.open)
  const closeUpgrade = useUpgradeStore((s) => s.closeUpgrade)
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)
  const router = useRouter()

  function seePlans() {
    closeUpgrade()
    if (slug) router.push(`/${slug}/billing`)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeUpgrade() }}>
      <DialogContent className="max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-1 flex size-11 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="size-5 text-primary" />
          </div>
          <DialogTitle className="text-xl">Passez à la vitesse supérieure</DialogTitle>
          <DialogDescription>
            Débloquez plus de workspaces, l&apos;analytics avancée, les décisions IA et davantage de tokens Cortex.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-2">
          <Button className="w-full gap-1.5" onClick={seePlans}>
            Voir les forfaits <ArrowRight className="size-4" />
          </Button>
          <Button variant="ghost" className="w-full" onClick={closeUpgrade}>Plus tard</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
