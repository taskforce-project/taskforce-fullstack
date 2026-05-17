"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useState } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import Link from "next/link"
import Image from "next/image"
import { useAuth } from "@/lib/contexts/auth-context"
import { validateEmail, sanitizeInput, globalRateLimiter } from "@/lib/utils/validation"
import { Loader2, ArrowRight } from "lucide-react"
import { FloatingPaths } from "@/components/auth/floating-paths"

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const { login } = useAuth()
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
      await login({ email: sanitizedEmail, password: sanitizedPassword })
      globalRateLimiter.reset("login")
      toast.success(t.auth.success.loginSuccess)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(t.common.error, { description: errorMessage || t.auth.errors.loginFailed })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn("relative flex min-h-screen w-full overflow-hidden", className)} {...props}>

      {/* ── Left: brand panel ── */}
      <div
        className="relative hidden lg:flex lg:w-[45%] flex-col justify-between p-10 overflow-hidden"
        style={{ background: "#0d0d0d", color: "#ffffff" }}
      >
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />

        {/* Bottom gradient fade */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 inset-x-0 h-56 z-10"
          style={{ background: "linear-gradient(to top, #0d0d0d 0%, transparent 100%)" }}
        />
        {/* Right edge fade */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10"
          style={{ background: "linear-gradient(to left, #0d0d0d 0%, transparent 100%)" }}
        />

        {/* Logo */}
        <div className="relative z-20 flex items-center gap-2.5">
          <Image
            src="/assets/logo/logo_taskforce_tp.png"
            alt="TaskForce"
            width={84}
            height={84}
            style={{ filter: "brightness(0) invert(1) drop-shadow(0 0 8px rgba(112,0,255,0.6))" }}
          />
          <span className="text-base font-semibold" style={{ color: "#ffffff" }}>
            TaskForce
          </span>
        </div>

        {/* Quote */}
        <div className="relative z-20">
          <blockquote className="space-y-3">
            <p
              className="text-xl font-medium leading-snug"
              style={{ color: "#ffffff" }}
            >
              &ldquo;Intelligence artificielle au service de vos opérations.&rdquo;
            </p>
            <footer className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
              — TaskForce Platform
            </footer>
          </blockquote>
        </div>
      </div>

      {/* ── Right: form panel ── */}
      <div
        className="relative flex flex-1 flex-col items-center justify-center px-6 py-16 sm:px-10"
        style={{ background: "var(--background)" }}
      >
        {/* Subtle radial decoration */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -top-32 -right-32 h-125 w-125 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(112,0,255,0.06) 0%, transparent 65%)",
            }}
          />
          <div
            className="absolute -bottom-24 -left-24 h-100 w-100 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(241,61,212,0.04) 0%, transparent 65%)",
            }}
          />
        </div>

        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2 mb-8 self-start">
          <Image
            src="/assets/logo/logo_taskforce_tp.png"
            alt="TaskForce"
            width={22}
            height={22}
          />
          <span className="text-sm font-semibold" style={{ color: "var(--label-primary)" }}>
            TaskForce
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-sm space-y-6"
        >
          {/* Heading */}
          <div className="space-y-1.5">
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ color: "var(--label-primary)" }}
            >
              Connexion
            </h1>
            <p className="text-sm" style={{ color: "var(--label-tertiary)" }}>
              Accédez à votre espace opérationnel
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-xs font-medium"
                style={{ color: "var(--label-secondary)" }}
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="m@exemple.com"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isLoading}
                className="h-9 text-sm"
                style={{
                  background: "var(--fill-secondary)",
                  borderColor: "var(--separator)",
                  color: "var(--label-primary)",
                }}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-xs font-medium"
                  style={{ color: "var(--label-secondary)" }}
                >
                  Mot de passe
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-[11px] transition-colors"
                  style={{ color: "var(--label-tertiary)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "var(--label-primary)"
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "var(--label-tertiary)"
                  }}
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={isLoading}
                className="h-9 text-sm"
                style={{
                  background: "var(--fill-secondary)",
                  borderColor: "var(--separator)",
                  color: "var(--label-primary)",
                }}
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="btn-primary h-9 w-full gap-2 font-medium text-sm mt-1"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>

          {/* Register link */}
          <p className="text-center text-xs" style={{ color: "var(--label-quaternary)" }}>
            Pas encore de compte ?{" "}
            <Link
              href="/auth/register"
              className="font-medium transition-colors"
              style={{ color: "var(--label-secondary)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--label-primary)"
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--label-secondary)"
              }}
            >
              Créer un compte
            </Link>
          </p>

          {/* Legal */}
          <p className="text-center text-[10px]" style={{ color: "var(--label-quaternary)" }}>
            En continuant, vous acceptez nos{" "}
            <Link href="/legal-notices" className="underline underline-offset-2">
              Conditions d&apos;utilisation
            </Link>
            {" "}et{" "}
            <Link href="/privacy-policy" className="underline underline-offset-2">
              Politique de confidentialité
            </Link>
            .
          </p>
        </motion.div>
      </div>
    </div>
  )
}