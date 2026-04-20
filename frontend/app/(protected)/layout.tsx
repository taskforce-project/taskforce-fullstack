"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { useAuth } from "@/lib/contexts/auth-context"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { AppShell } from "@/components/layout/app-shell"
import { Toaster } from "@/components/ui/sonner"

export default function ProtectedLayout({
  children,
}: {
  readonly children: React.ReactNode
}) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const fetchWorkspace = useWorkspaceStore((s) => s.fetchWorkspace)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/auth/login")
    }
  }, [isAuthenticated, isLoading, router])

  // Charger le workspace dès que l'utilisateur est authentifié
  useEffect(() => {
    if (isAuthenticated) {
      fetchWorkspace()
    }
  }, [isAuthenticated, fetchWorkspace])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <>
      <AppShell>{children}</AppShell>
      <Toaster position="bottom-right" richColors closeButton />
    </>
  )
}
