"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar"
import { AppTopbar } from "@/components/layout/topbar/app-topbar"
import { PanelDock } from "@/components/layout/panel-dock"
import { AppFooter } from "@/components/layout/app-footer"
import { UpgradeDialog } from "@/components/subscription/upgrade-dialog"
import { SettingsModal } from "@/components/settings/settings-modal"
import { CreateProjectModal } from "@/components/dialogs/create-project-modal"
import { ProductTour } from "@/components/tour/product-tour"
import { LabsGradientDefs } from "@/components/ui/labs-gradient-defs"
import { PendingInvitationsBanner } from "@/components/invitations/pending-invitations-banner"

interface AppShellProps {
  readonly children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <AppTopbar />
        {/* Invitations reçues en attente d'approbation — bannière montée hors du <main> keyé par
            la route : un seul fetch par session, persistante à la navigation. Nulle si rien. */}
        <PendingInvitationsBanner />
        <div className="flex min-h-0 flex-1">
          <PanelDock side="left" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.main
              key={pathname}
              className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.20, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
              {/* Footer dans le flux de scroll : révélé seulement quand on atteint le bas. */}
              <AppFooter />
            </motion.main>
          </AnimatePresence>
          <PanelDock side="right" />
        </div>
      </SidebarInset>

      {/* Modals globaux — ouvrables depuis n'importe quel CTA */}
      <UpgradeDialog />
      <SettingsModal />
      <CreateProjectModal />

      {/* Tour produit (coach-marks) — rendu conditionnel via son store ; cible les data-tour du dashboard */}
      <ProductTour />

      {/* Dégradé SVG de l'identité Labs — référencé par les icônes `tf-labs-icon` (sidebar, topbar, Ctrl+K) */}
      <LabsGradientDefs />
    </SidebarProvider>
  )
}
