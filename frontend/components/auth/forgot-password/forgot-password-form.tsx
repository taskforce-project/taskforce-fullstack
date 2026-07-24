"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/api/auth-service";
import { ArrowLeft, Loader2 } from "lucide-react";

type FormState = "request" | "otp-sent";

/**
 * Réinitialisation du mot de passe, en deux temps sur la même page.
 *
 * Le passage « demande du code » → « saisie du code » se fait sans changer de route : c'est une
 * seule intention, l'adresse saisie reste en mémoire, et un aller-retour de navigation ferait
 * perdre le contexte pour rien.
 */
export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const { t } = usePreferencesStore();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [formState, setFormState] = useState<FormState>("request");
  const [formData, setFormData] = useState({ otpCode: "", password: "", confirmPassword: "" });

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error(t.common.error, { description: "Veuillez entrer votre adresse email" }); return; }
    setIsLoading(true);
    try {
      await authService.forgotPassword(email);
      setFormState("otp-sent");
      toast.success("Code envoyé", { description: "Vérifiez votre boîte de réception" });
    } catch (error) {
      toast.error(t.common.error, { description: error instanceof Error ? error.message : "Erreur lors de l'envoi de l'email" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.otpCode || !formData.password || !formData.confirmPassword) {
      toast.error(t.common.error, { description: "Veuillez remplir tous les champs" }); return;
    }
    if (formData.otpCode.length !== 6 || !/^\d{6}$/.test(formData.otpCode)) {
      toast.error(t.common.error, { description: "Le code OTP doit contenir 6 chiffres" }); return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error(t.common.error, { description: t.auth.errors.passwordsDoNotMatch }); return;
    }
    if (formData.password.length < 8) {
      toast.error(t.common.error, { description: t.auth.errors.passwordTooShort }); return;
    }
    setIsLoading(true);
    try {
      await authService.resetPassword(email, formData.otpCode, formData.password);
      toast.success("Mot de passe réinitialisé", { description: "Vous pouvez maintenant vous connecter" });
      router.push("/auth/login");
    } catch (error) {
      toast.error(t.common.error, { description: error instanceof Error ? error.message : "Erreur lors de la réinitialisation" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    try {
      await authService.forgotPassword(email);
      toast.success("Code renvoyé", { description: "Un nouveau code a été envoyé à votre adresse email" });
    } catch (error) {
      toast.error(t.common.error, { description: error instanceof Error ? error.message : "Erreur lors du renvoi du code" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("auth-panel", className)} {...props}>
      {formState === "request" ? (
        <>
          <h1 className="auth-title">Mot de passe oublié</h1>
          <p className="auth-subtitle">
            Indiquez votre adresse, nous vous envoyons un code de vérification.
          </p>

          <form onSubmit={handleRequestReset} className="mt-6 space-y-4">
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="auth-input"
              />
            </div>

            <Button type="submit" disabled={isLoading} className="auth-submit">
              {isLoading ? (<><Loader2 className="size-4 animate-spin" />Envoi en cours…</>) : "Envoyer le code"}
            </Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="auth-title">Code envoyé !</h1>
          <p className="auth-subtitle">
            Saisissez le code à 6 chiffres reçu à l&apos;adresse <strong style={{ color: "var(--label-secondary)" }}>{email}</strong>,
            puis choisissez un nouveau mot de passe.
          </p>

          <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
            <div>
              <label htmlFor="otpCode" className="auth-label">
                Code de vérification
              </label>
              <Input
                id="otpCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                required
                value={formData.otpCode}
                // Filtre à la saisie : `type="text"` accepte tout, et un `maxLength` de 6 sur une
                // valeur contenant des lettres tronquerait le code réel. On ne garde que les chiffres.
                onChange={(e) => setFormData({ ...formData, otpCode: e.target.value.replace(/\D/g, "") })}
                disabled={isLoading}
                className="auth-input tracking-[0.4em] text-center font-mono"
              />
            </div>

            <div>
              <label htmlFor="password" className="auth-label">
                Nouveau mot de passe
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={isLoading}
                className="auth-input"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="auth-label">
                Confirmer le mot de passe
              </label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                disabled={isLoading}
                className="auth-input"
              />
            </div>

            <Button type="submit" disabled={isLoading} className="auth-submit">
              {isLoading ? (<><Loader2 className="size-4 animate-spin" />Réinitialisation…</>) : "Réinitialiser le mot de passe"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs" style={{ color: "var(--label-tertiary)" }}>
            Code non reçu ?{" "}
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={isLoading}
              className="auth-link underline underline-offset-2 disabled:opacity-50"
            >
              Renvoyer
            </button>
          </p>
        </>
      )}

      <p className="mt-5 text-center text-xs">
        <Link href="/auth/login" className="auth-link-muted inline-flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
