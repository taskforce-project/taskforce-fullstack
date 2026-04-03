"use client"

import * as React from "react"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar"
import { AppTopbar } from "@/components/layout/topbar/app-topbar"

interface AppShellProps {
  readonly children: React.ReactNode
}

/**
 * App Shell — wraps every protected page with the sidebar + topbar layout.
 * Must be rendered inside AuthProvider (for useAuth) and SidebarRail context.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <AppTopbar />
        <main className="flex flex-1 flex-col gap-6 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
