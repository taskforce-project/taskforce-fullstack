"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/api/auth-service";

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
  const [formData, setFormData] = useState({
    otpCode: "",
    password: "",
    confirmPassword: "",
  });

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error(t.common.error, {
        description: "Veuillez entrer votre adresse email",
      });
      return;
    }

    setIsLoading(true);

    try {
      await authService.forgotPassword(email);

      setFormState("otp-sent");
      toast.success("Code envoyé", {
        description: "Vérifiez votre boîte de réception",
      });
    } catch (error) {
      toast.error(t.common.error, {
        description: error instanceof Error ? error.message : "Erreur lors de l'envoi de l'email",
      });
      console.error("Forgot password error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.otpCode || !formData.password || !formData.confirmPassword) {
      toast.error(t.common.error, {
        description: "Veuillez remplir tous les champs",
      });
      return;
    }

    if (formData.otpCode.length !== 6 || !/^\d{6}$/.test(formData.otpCode)) {
      toast.error(t.common.error, {
        description: "Le code OTP doit contenir 6 chiffres",
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error(t.common.error, {
        description: t.auth.errors.passwordsDoNotMatch,
      });
      return;
    }

    if (formData.password.length < 8) {
      toast.error(t.common.error, {
        description: t.auth.errors.passwordTooShort,
      });
      return;
    }

    setIsLoading(true);

    try {
      await authService.resetPassword(email, formData.otpCode, formData.password);

      toast.success("Mot de passe réinitialisé", {
        description:
          "Vous pouvez maintenant vous connecter avec votre nouveau mot de passe",
      });

      router.push("/auth/login");
    } catch (error) {
      toast.error(t.common.error, {
        description: error instanceof Error ? error.message : "Erreur lors de la réinitialisation du mot de passe",
      });
      console.error("Reset password error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    try {
      await authService.forgotPassword(email);
      toast.success("Code renvoyé", {
        description: "Un nouveau code a été envoyé à votre adresse email",
      });
    } catch (error) {
      toast.error(t.common.error, {
        description: error instanceof Error ? error.message : "Erreur lors du renvoi du code",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // État: Code OTP envoyé - formulaire de réinitialisation
  if (formState === "otp-sent") {
    return (
      <div className={cn("flex flex-col gap-6 w-[80%]", className)} {...props}>
        <Card className="overflow-hidden p-0">
          <CardContent className="grid p-0 md:grid-cols-2">
            <form onSubmit={handleResetPassword} className="p-6 md:p-8">
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <svg
                      className="h-6 w-6 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <h1 className="text-2xl font-bold">Code envoyé !</h1>
                  <p className="text-balance text-muted-foreground">
                    Un code à 6 chiffres a été envoyé à <strong>{email}</strong>
                  </p>
                </div>

                <Field>
                  <FieldLabel htmlFor="otpCode">Code de vérification</FieldLabel>
                  <Input
                    id="otpCode"
                    type="text"
                    placeholder="123456"
                    required
                    maxLength={6}
                    value={formData.otpCode}
                    onChange={(e) =>
                      // eslint-disable-next-line unicorn/prefer-string-replace-all
                      setFormData({ ...formData, otpCode: e.target.value.replace(/\D/g, "") })
                    }
                    disabled={isLoading}
                  />
                  <FieldDescription>Entrez le code à 6 chiffres reçu par email</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="password">
                    Nouveau mot de passe
                  </FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    disabled={isLoading}
                  />
                  <FieldDescription>Au moins 8 caractères</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="confirmPassword">
                    Confirmer le mot de passe
                  </FieldLabel>
                  <Input
                    id="confirmPassword"
                    type="password"
                    required
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        confirmPassword: e.target.value,
                      })
                    }
                    disabled={isLoading}
                  />
                </Field>

                <Field>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading
                      ? "Réinitialisation..."
                      : "Réinitialiser le mot de passe"}
                  </Button>
                </Field>

                <FieldDescription className="text-center">
                  Vous n&apos;avez pas reçu le code ?{" "}
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isLoading}
                    className="font-medium text-primary hover:underline"
                  >
                    Renvoyer
                  </button>
                </FieldDescription>

                <FieldDescription className="text-center">
                  <Link href="/auth/login">Retour à la connexion</Link>
                </FieldDescription>
              </FieldGroup>
            </form>

            <div className="bg-gradient relative hidden md:flex md:items-center md:justify-center">
              <span aria-hidden="true"></span>
              <img
                src="/assets/logo/logo_taskforce_tp.png"
                alt="TaskForce Logo"
                className="w-60 h-60 object-contain opacity-40 dark:opacity-30 dark:invert relative z-10"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // État: Demande de reset (par défaut)
  return (
    <div className={cn("flex flex-col gap-6 w-[80%]", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form onSubmit={handleRequestReset} className="p-6 md:p-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Mot de passe oublié ?</h1>
                <p className="text-balance text-muted-foreground">
                  Entrez votre email pour recevoir un code de vérification
                </p>
              </div>

              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@exemple.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </Field>

              <Field>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Envoi..." : "Envoyer le code"}
                </Button>
              </Field>

              <FieldDescription className="text-center">
                <Link href="/auth/login">Retour à la connexion</Link>
              </FieldDescription>
            </FieldGroup>
          </form>

          <div className="bg-gradient relative hidden md:flex md:items-center md:justify-center">
            <span aria-hidden="true"></span>
            <img
              src="/assets/logo/logo_taskforce_tp.png"
              alt="TaskForce Logo"
              className="w-60 h-60 object-contain opacity-40 dark:opacity-30 dark:invert relative z-10"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
