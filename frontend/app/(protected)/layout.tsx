"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { useAuth } from "@/lib/contexts/auth-context"
import { AppShell } from "@/components/layout/app-shell"
import { LabShell } from "@/components/layout/lab-shell"
import { LoginIntro } from "@/components/layout/login-intro"

export default function ProtectedLayout({
  children,
}: {
  readonly children: React.ReactNode
}) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  // Intro de connexion : jouée UNE fois juste après un login (drapeau `tf.intro` posé par le callback
  // OAuth). Lu de façon SYNCHRONE au 1er rendu → l'overlay est présent dès la première frame, il
  // couvre donc le spinner d'auth ET l'hydratation de l'app (pas de « loader au début »).
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try {
      return sessionStorage.getItem("tf.intro") === "1"
    } catch {
      return false
    }
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    // Consommé une seule fois : on retire le drapeau dès qu'il a servi.
    if (!showIntro) return
    try {
      sessionStorage.removeItem("tf.intro")
    } catch {
      /* ignore */
    }
  }, [showIntro])

  useEffect(() => {
    if (!mounted || isLoading) return
    // Ne rediriger que si : pas authentifié ET pas de token en localStorage
    // Évite les faux positifs dus au timing React (état contexte pas encore propagé)
    const hasLocalToken = !!localStorage.getItem("accessToken")
    if (!isAuthenticated && !hasLocalToken) {
      router.replace("/auth/login")
    }
  }, [mounted, isAuthenticated, isLoading, router])

  const authLoading = !mounted || isLoading
  const hasLocalToken = typeof window !== "undefined" && !!localStorage.getItem("accessToken")
  const blocked = !authLoading && !isAuthenticated && !hasLocalToken

  return (
    <>
      {authLoading ? (
        // Pendant la vérif d'auth : si l'intro joue, elle couvre déjà tout → pas de spinner (sinon on
        // le verrait « clignoter » avant l'overlay). Sans intro : le spinner habituel.
        showIntro ? null : (
          <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )
      ) : blocked ? null : (
        <>
          {/* LabShell : bandeau « sandbox » en haut + coins arrondis sur les zones Labs (sinon transparent). */}
          <LabShell>
            <AppShell>{children}</AppShell>
          </LabShell>
        </>
      )}

      {/* Overlay d'intro - rendu au niveau LE PLUS HAUT (stable à travers la transition loading→app,
          donc l'animation ne redémarre pas). L'app charge dessous ; la vague se dissout dessus. */}
      {showIntro && <LoginIntro phase="reveal" onDone={() => setShowIntro(false)} />}
    </>
  )
}
