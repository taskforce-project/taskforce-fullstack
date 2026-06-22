"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { setRegisterData } from "@/lib/auth/register-storage";
import {
  validateEmail,
  validateName,
  validatePassword,
  sanitizeInput,
  isDisposableEmail,
  calculatePasswordStrength,
} from "@/lib/utils/validation";
import { Loader2, ArrowRight } from "lucide-react";
import { FloatingPaths } from "@/components/auth/floating-paths";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const { t } = usePreferencesStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  // Pré-remplissage de l'email depuis une invitation (?email=…, PROD-3.5)
  useEffect(() => {
    const invitedEmail = new URLSearchParams(window.location.search).get("email");
    if (invitedEmail) {
      setFormData((prev) => ({ ...prev, email: invitedEmail }));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password || !formData.confirmPassword) {
      toast.error(t.common.error, { description: "Veuillez remplir tous les champs" });
      return;
    }
    if (!validateName(formData.firstName)) {
      toast.error(t.common.error, { description: "Le prénom n'est pas valide (2-50 caractères, lettres uniquement)" });
      return;
    }
    if (!validateName(formData.lastName)) {
      toast.error(t.common.error, { description: "Le nom n'est pas valide (2-50 caractères, lettres uniquement)" });
      return;
    }
    if (!validateEmail(formData.email)) {
      toast.error(t.common.error, { description: "Format d'email invalide" });
      return;
    }
    if (isDisposableEmail(formData.email)) {
      toast.error(t.common.error, { description: "Les adresses email temporaires ne sont pas autorisées" });
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error(t.common.error, { description: t.auth.errors.passwordsDoNotMatch });
      return;
    }
    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.isValid) {
      toast.error(t.common.error, { description: passwordValidation.errors[0] });
      return;
    }
    const strength = calculatePasswordStrength(formData.password);
    if (strength < 50) {
      toast.error(t.common.error, { description: "Le mot de passe est trop faible. Utilisez un mot de passe plus complexe." });
      return;
    }

    const sanitizedData = {
      firstName: sanitizeInput(formData.firstName),
      lastName: sanitizeInput(formData.lastName),
      email: sanitizeInput(formData.email),
      password: formData.password,
    };

    setIsLoading(true);
    try {
      setRegisterData(sanitizedData);
      toast.success("Informations enregistrées", {
        description: "Passez à l'étape suivante pour choisir votre plan",
      });
      router.push("/auth/register/plan");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(t.common.error, { description: errorMessage || t.auth.errors.registrationFailed });
    } finally {
      setIsLoading(false);
    }
  };

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
              &ldquo;Rejoignez la plateforme qui révolutionne la gestion d&rsquo;équipes et d&rsquo;agents IA.&rdquo;
            </p>
            <footer className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
              — TaskForce Team
            </footer>
          </blockquote>
        </div>
      </div>

      {/* ── Right: form panel ── */}
      <div
        className="relative flex flex-1 flex-col items-center justify-center px-6 py-16 sm:px-10 overflow-y-auto"
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
          {/* Step indicator */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className="h-1 flex-1 rounded-full transition-all"
                  style={{
                    background: step === 1
                      ? "var(--gradient-purple-pink)"
                      : "var(--fill-tertiary)",
                  }}
                />
              ))}
            </div>
            <p className="text-[11px]" style={{ color: "var(--label-quaternary)" }}>
              Étape 1 sur 3 — Informations personnelles
            </p>
          </div>

          {/* Heading */}
          <div className="space-y-1.5">
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ color: "var(--label-primary)" }}
            >
              Créer un compte
            </h1>
            <p className="text-sm" style={{ color: "var(--label-tertiary)" }}>
              Entrez vos informations pour commencer
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="firstName"
                  className="text-xs font-medium"
                  style={{ color: "var(--label-secondary)" }}
                >
                  Prénom
                </label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="John"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  disabled={isLoading}
                  className="h-9 text-sm"
                  style={{
                    background: "var(--fill-secondary)",
                    borderColor: "var(--separator)",
                    color: "var(--label-primary)",
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="lastName"
                  className="text-xs font-medium"
                  style={{ color: "var(--label-secondary)" }}
                >
                  Nom
                </label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  disabled={isLoading}
                  className="h-9 text-sm"
                  style={{
                    background: "var(--fill-secondary)",
                    borderColor: "var(--separator)",
                    color: "var(--label-primary)",
                  }}
                />
              </div>
            </div>

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
                placeholder="john.doe@exemple.com"
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

            {/* Password row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="text-xs font-medium"
                  style={{ color: "var(--label-secondary)" }}
                >
                  Mot de passe
                </label>
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
              <div className="space-y-1.5">
                <label
                  htmlFor="confirm-password"
                  className="text-xs font-medium"
                  style={{ color: "var(--label-secondary)" }}
                >
                  Confirmer
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  disabled={isLoading}
                  className="h-9 text-sm"
                  style={{
                    background: "var(--fill-secondary)",
                    borderColor: "var(--separator)",
                    color: "var(--label-primary)",
                  }}
                />
              </div>
            </div>
            <p className="text-[11px]" style={{ color: "var(--label-quaternary)" }}>
              Au moins 8 caractères, une majuscule, un chiffre et un symbole.
            </p>

            <Button
              type="submit"
              disabled={isLoading}
              className="btn-primary h-9 w-full gap-2 font-medium text-sm mt-1"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Continuer
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>

          {/* Login link */}
          <p className="text-center text-xs" style={{ color: "var(--label-quaternary)" }}>
            Vous avez déjà un compte ?{" "}
            <Link
              href="/auth/login"
              className="font-medium transition-colors"
              style={{ color: "var(--label-secondary)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--label-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--label-secondary)";
              }}
            >
              Se connecter
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
  );
}