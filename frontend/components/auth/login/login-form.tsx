"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Link from "next/link"
import { useAuth } from "@/lib/contexts/auth-context"
import { validateEmail, sanitizeInput, globalRateLimiter } from "@/lib/utils/validation"
import { Loader2 } from "lucide-react"
import { AuthSocialButtons } from "@/components/auth/auth-social-buttons"

/**
 * Connexion.
 *
 * Une colonne, quatre éléments : titre, deux champs, une action. Le panneau de marque et le décor
 * animé ont été retirés — ils occupaient la moitié de l'écran pour ne rien dire, et forçaient un
 * défilement sur les hauteurs d'écran courantes. La marque vit désormais dans la barre supérieure.
 *
 * La logique de validation est inchangée : limitation du nombre de tentatives, format d'adresse,
 * assainissement des entrées.
 */
export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const { login } = useAuth()
  const router = useRouter()
  const { t } = usePreferencesStore()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({ email: "", password: "" })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.email || !formData.password) {
      toast.error(t.common.error, { description: "Veuillez remplir tous les champs" })
      return
    }
    if (!globalRateLimiter.isAllowed("login", 5, 15 * 60 * 1000)) {
      const timeLeft = globalRateLimiter.getTimeUntilReset("login", 15 * 60 * 1000)
      toast.error(t.common.error, { description: `Trop de tentatives. Réessayez dans ${timeLeft} secondes` })
      return
    }
    if (!validateEmail(formData.email)) {
      toast.error(t.common.error, { description: "Format d'email invalide" })
      return
    }

    const sanitizedEmail    = sanitizeInput(formData.email)
    const sanitizedPassword = sanitizeInput(formData.password)

    setIsLoading(true)
    try {
      const loggedIn = await login({ email: sanitizedEmail, password: sanitizedPassword })
      globalRateLimiter.reset("login")
      toast.success(t.auth.success.loginSuccess)
      // Direct vers l'onboarding si non fait — évite que l'app « flashe » avant le wizard.
      router.replace(loggedIn?.onboardingCompleted === false ? "/onboarding" : "/")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(t.common.error, { description: errorMessage || t.auth.errors.loginFailed })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn("auth-panel", className)} {...props}>
      <h1 className="auth-title">Connexion</h1>
      <p className="auth-subtitle">Accédez à votre espace de travail.</p>

      {/* Fournisseurs externes, au-dessus du formulaire comme partout : quand ils existent, ils sont
          le chemin le plus rapide. Absents tant que le flux d'autorisation n'est pas implémenté. */}
      <AuthSocialButtons />

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="auth-label">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="vous@entreprise.com"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            disabled={isLoading}
            className="auth-input"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="auth-label">
              Mot de passe
            </label>
            <Link href="/auth/forgot-password" className="auth-link-muted mb-1.5 text-[11px]">
              Mot de passe oublié ?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            disabled={isLoading}
            className="auth-input"
          />
        </div>

        <Button type="submit" disabled={isLoading} className="auth-submit">
          {isLoading ? (<><Loader2 className="size-4 animate-spin" />Connexion…</>) : "Se connecter"}
        </Button>
      </form>

      <p className="mt-5 text-center text-xs" style={{ color: "var(--label-tertiary)" }}>
        Pas encore de compte ?{" "}
        <Link href="/auth/register" className="auth-link">
          Créer un compte
        </Link>
      </p>
    </div>
  )
}
