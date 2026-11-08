"use client"

import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"

import { PaneLink } from "@/components/layout/pane-link"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { cn } from "@/lib/utils"
import { withConversation } from "@/lib/window/address"
import { progressPath } from "@/lib/window/pane"

/**
 * Le lien de Settings > AI vers le volet « Progress » (R125) : ce que chaque modèle sait faire y est mesuré. Un clic
 * simple ferme les réglages et ouvre le volet à côté de la conversation, qui reste la même (`?c=`).
 */
export function ProgressLink({ className }: Readonly<{ className?: string }>) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug) ?? ""
  const label = usePreferencesStore((s) => s.t.progress.seeProgress)
  const closeSettings = useSettingsStore((s) => s.closeSettings)
  if (!slug) return null
  const href = progressPath(slug)
  return (
    <PaneLink
      href={href}
      open={() => {
        closeSettings()
        router.push(withConversation(href, globalThis.location?.search ?? ""), { scroll: false })
      }}
      className={cn("inline-flex w-fit items-center gap-1 text-xs text-foreground underline-offset-4 hover:underline", className)}
    >
      {label}
      <ArrowRight aria-hidden className="size-3.5" />
    </PaneLink>
  )
}
