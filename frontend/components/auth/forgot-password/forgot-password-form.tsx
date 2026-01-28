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
import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type FormState = "request" | "email-sent" | "reset-password";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = usePreferencesStore();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [formState, setFormState] = useState<FormState>("request");
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    // Si token présent dans URL, on est en mode reset password
    const token = searchParams.get("token");
    if (token) {
      setFormState("reset-password");
    }
  }, [searchParams]);

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
      // TODO: Appel API pour envoyer le lien de réinitialisation
      // const response = await fetch('/api/auth/forgot-password', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email })
      // });

      await new Promise((resolve) => setTimeout(resolve, 1500));

      setFormState("email-sent");
      toast.success("Email envoyé", {
        description: "Vérifiez votre boîte de réception",
      });
    } catch (error) {
      toast.error(t.common.error, {
        description: "Erreur lors de l'envoi de l'email",
      });
      console.error("Forgot password error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.password || !formData.confirmPassword) {
      toast.error(t.common.error, {
        description: "Veuillez remplir tous les champs",
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
      // TODO: Appel API pour réinitialiser le mot de passe avec le token
      // const token = searchParams.get('token');
      // const response = await fetch('/api/auth/reset-password', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ token, password: formData.password })
      // });

      await new Promise((resolve) => setTimeout(resolve, 1500));

      toast.success("Mot de passe réinitialisé", {
        description:
          "Vous pouvez maintenant vous connecter avec votre nouveau mot de passe",
      });

      router.push("/auth/login");
    } catch (error) {
      toast.error(t.common.error, {
        description: "Erreur lors de la réinitialisation du mot de passe",
      });
      console.error("Reset password error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // État: Email envoyé
  if (formState === "email-sent") {
    return (
      <div className={cn("flex flex-col gap-6 w-[80%]", className)} {...props}>
        <Card className="overflow-hidden p-0">
          <CardContent className="grid p-0 md:grid-cols-2">
            <div className="p-6 md:p-8">
              <div className="flex flex-col gap-6 items-center text-center">
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

                <div>
                  <h1 className="text-2xl font-bold">Email envoyé !</h1>
                  <p className="text-balance text-muted-foreground mt-2">
                    Un lien de réinitialisation a été envoyé à
                  </p>
                  <p className="font-medium mt-1">{email}</p>
                </div>

                <p className="text-sm text-muted-foreground">
                  Cliquez sur le lien dans l&apos;email pour réinitialiser votre
                  mot de passe. Le lien expirera dans 1 heure.
                </p>

                <div className="flex flex-col gap-2 w-full">
                  <Button
                    onClick={() => router.push("/auth/login")}
                    className="w-full"
                  >
                    Retour à la connexion
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setFormState("request")}
                    className="w-full"
                  >
                    Renvoyer l&apos;email
                  </Button>
                </div>
              </div>
            </div>

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

  // État: Reset password
  if (formState === "reset-password") {
    return (
      <div className={cn("flex flex-col gap-6 w-[80%]", className)} {...props}>
        <Card className="overflow-hidden p-0">
          <CardContent className="grid p-0 md:grid-cols-2">
            <form onSubmit={handleResetPassword} className="p-6 md:p-8">
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
                  <p className="text-balance text-muted-foreground">
                    Choisissez un nouveau mot de passe sécurisé
                  </p>
                </div>

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
                  Entrez votre email pour recevoir un lien de réinitialisation
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
                  {isLoading ? "Envoi..." : "Envoyer le lien"}
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
