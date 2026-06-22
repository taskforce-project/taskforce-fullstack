"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar"
import { AppTopbar } from "@/components/layout/topbar/app-topbar"
import { PanelDock } from "@/components/layout/panel-dock"

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
            </motion.main>
          </AnimatePresence>
          <PanelDock side="right" />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
