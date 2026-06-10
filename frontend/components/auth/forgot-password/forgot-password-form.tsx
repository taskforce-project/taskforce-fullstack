"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FloatingPaths } from "@/components/auth/floating-paths";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { authService } from "@/lib/api/auth-service";
import { ArrowLeft, Mail } from "lucide-react";

type FormState = "request" | "otp-sent";

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
    <div className={cn("relative flex min-h-screen w-full overflow-hidden", className)} {...props}>

      {/* ── Left: brand panel ── */}
      <div
        className="relative hidden lg:flex lg:w-[45%] flex-col justify-between p-10 overflow-hidden"
        style={{ background: "#0d0d0d", color: "#ffffff" }}
      >
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />

        <div aria-hidden className="pointer-events-none absolute bottom-0 inset-x-0 h-56 z-10"
          style={{ background: "linear-gradient(to top, #0d0d0d 0%, transparent 100%)" }} />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10"
          style={{ background: "linear-gradient(to left, #0d0d0d 0%, transparent 100%)" }} />

        <div className="relative z-20 flex items-center gap-2.5">
          <Image src="/assets/logo/logo_taskforce_tp.png" alt="TaskForce" width={84} height={84}
            style={{ filter: "brightness(0) invert(1) drop-shadow(0 0 8px rgba(112,0,255,0.6))" }} />
          <span className="text-base font-semibold" style={{ color: "#ffffff" }}>TaskForce</span>
        </div>

        <div className="relative z-20">
          <blockquote className="space-y-3">
            <p className="text-xl font-medium leading-snug" style={{ color: "#ffffff" }}>
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
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -right-32 h-125 w-125 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(112,0,255,0.06) 0%, transparent 65%)" }} />
          <div className="absolute -bottom-24 -left-24 h-100 w-100 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(241,61,212,0.04) 0%, transparent 65%)" }} />
        </div>

        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2 mb-8 self-start">
          <Image src="/assets/logo/logo_taskforce_tp.png" alt="TaskForce" width={32} height={32}
            className="h-8 w-8 object-contain dark:invert" />
          <span className="text-sm font-semibold">TaskForce</span>
        </div>

        <div className="relative z-10 w-full max-w-sm">
          {formState === "request" ? (
            <form onSubmit={handleRequestReset}>
              <FieldGroup>
                <div className="flex flex-col gap-1 mb-6">
                  <h1 className="text-2xl font-bold tracking-tight">Mot de passe oublié ?</h1>
                  <p className="text-sm text-muted-foreground">
                    Entrez votre email pour recevoir un code de vérification
                  </p>
                </div>

                <Field>
                  <FieldLabel htmlFor="email">Adresse email</FieldLabel>
                  <Input id="email" type="email" placeholder="m@exemple.com" required
                    value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
                </Field>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Envoi en cours…" : "Envoyer le code"}
                </Button>

                <Link href="/auth/login"
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors justify-center mt-2">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Retour à la connexion
                </Link>
              </FieldGroup>
            </form>
          ) : (
            <form onSubmit={handleResetPassword}>
              <FieldGroup>
                <div className="flex flex-col gap-1 mb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 mb-3">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight">Code envoyé !</h1>
                  <p className="text-sm text-muted-foreground">
                    Un code à 6 chiffres a été envoyé à <strong className="text-foreground">{email}</strong>
                  </p>
                </div>

                <Field>
                  <FieldLabel htmlFor="otpCode">Code de vérification</FieldLabel>
                  <Input id="otpCode" type="text" placeholder="123456" required maxLength={6}
                    value={formData.otpCode}
                    onChange={(e) => setFormData({ ...formData, otpCode: e.target.value.replace(/\D/g, "") })}
                    disabled={isLoading} />
                  <FieldDescription>Code à 6 chiffres reçu par email</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="password">Nouveau mot de passe</FieldLabel>
                  <Input id="password" type="password" required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    disabled={isLoading} />
                  <FieldDescription>Au moins 8 caractères</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="confirmPassword">Confirmer le mot de passe</FieldLabel>
                  <Input id="confirmPassword" type="password" required
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    disabled={isLoading} />
                </Field>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Réinitialisation…" : "Réinitialiser le mot de passe"}
                </Button>

                <div className="flex items-center justify-between text-sm mt-2">
                  <button type="button" onClick={handleResendOtp} disabled={isLoading}
                    className="text-muted-foreground hover:text-foreground transition-colors">
                    Renvoyer le code
                  </button>
                  <Link href="/auth/login" className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Connexion
                  </Link>
                </div>
              </FieldGroup>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
