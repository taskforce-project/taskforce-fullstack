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
    if (!email) { toast.error(t.common.error, { description: t.auth.ui.enterEmail }); return; }
    setIsLoading(true);
    try {
      await authService.forgotPassword(email);
      setFormState("otp-sent");
      toast.success(t.auth.ui.toastCodeSentTitle, { description: t.auth.ui.toastCodeSentDesc });
    } catch (error) {
      toast.error(t.common.error, { description: error instanceof Error ? error.message : t.auth.ui.sendEmailError });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.otpCode || !formData.password || !formData.confirmPassword) {
      toast.error(t.common.error, { description: t.auth.ui.fillAllFields }); return;
    }
    if (formData.otpCode.length !== 6 || !/^\d{6}$/.test(formData.otpCode)) {
      toast.error(t.common.error, { description: t.auth.ui.otpSixDigits }); return;
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
      toast.success(t.auth.ui.resetSuccessTitle, { description: t.auth.ui.resetSuccessDesc });
      router.push("/auth/login");
    } catch (error) {
      toast.error(t.common.error, { description: error instanceof Error ? error.message : t.auth.ui.resetError });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    try {
      await authService.forgotPassword(email);
      toast.success(t.auth.ui.codeResentTitle, { description: t.auth.ui.codeResentDesc });
    } catch (error) {
      toast.error(t.common.error, { description: error instanceof Error ? error.message : t.auth.ui.resendError });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("auth-panel", className)} {...props}>
      {formState === "request" ? (
        <>
          <h1 className="auth-title">{t.auth.ui.forgotTitle}</h1>
          <p className="auth-subtitle">
            {t.auth.ui.forgotSubtitle}
          </p>

          <form onSubmit={handleRequestReset} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="auth-label">
                {t.auth.ui.email}
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={t.auth.ui.emailPlaceholder}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="auth-input"
              />
            </div>

            <Button type="submit" disabled={isLoading} className="auth-submit">
              {isLoading ? (<><Loader2 className="size-4 animate-spin" />{t.auth.ui.sending}</>) : t.auth.ui.sendCode}
            </Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="auth-title">{t.auth.ui.codeSentTitle}</h1>
          <p className="auth-subtitle">
            {t.auth.ui.codeSentSubtitle.split("{email}")[0]}
            <strong style={{ color: "var(--label-secondary)" }}>{email}</strong>
            {t.auth.ui.codeSentSubtitle.split("{email}")[1]}
          </p>

          <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
            <div>
              <label htmlFor="otpCode" className="auth-label">
                {t.auth.ui.verificationCode}
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
                {t.auth.ui.newPassword}
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
                {t.auth.ui.confirmPassword}
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
              {isLoading ? (<><Loader2 className="size-4 animate-spin" />{t.auth.ui.resetting}</>) : t.auth.ui.resetPassword}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs" style={{ color: "var(--label-tertiary)" }}>
            {t.auth.ui.codeNotReceived}{" "}
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={isLoading}
              className="auth-link underline underline-offset-2 disabled:opacity-50"
            >
              {t.auth.ui.resend}
            </button>
          </p>
        </>
      )}

      <p className="mt-5 text-center text-xs">
        <Link href="/auth/login" className="auth-link-muted inline-flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t.auth.ui.backToLogin}
        </Link>
      </p>
    </div>
  );
}
