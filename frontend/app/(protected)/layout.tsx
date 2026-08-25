"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { useAuth } from "@/lib/contexts/auth-context"
import { AppShell } from "@/components/layout/app-shell"
import { LabFrame } from "@/components/layout/lab-frame"
import { Toaster } from "@/components/ui/sonner"

export default function ProtectedLayout({
  children,
}: {
  readonly children: React.ReactNode
}) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || isLoading) return
    // Ne rediriger que si : pas authentifié ET pas de token en localStorage
    // Évite les faux positifs dus au timing React (état contexte pas encore propagé)
    const hasLocalToken = !!localStorage.getItem("accessToken")
    if (!isAuthenticated && !hasLocalToken) {
      router.replace("/auth/login")
    }
  }, [mounted, isAuthenticated, isLoading, router])

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Double vérification : token localStorage présent = laisser passer
  // (le contexte se synchronisera au prochain cycle)
  const hasLocalToken = typeof window !== "undefined" && !!localStorage.getItem("accessToken")
  if (!isAuthenticated && !hasLocalToken) {
    return null
  }

  return (
    <>
      <AppShell>{children}</AppShell>
      {/* Cadre « sandbox » des zones Labs — monté hors d'AppShell (le <main> a un transform). */}
      <LabFrame />
      <Toaster position="bottom-right" richColors closeButton />
    </>
  )
}


