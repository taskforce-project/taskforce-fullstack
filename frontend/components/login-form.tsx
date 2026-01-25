"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { t } = usePreferencesStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      toast.error(t.common.error, {
        description: "Veuillez remplir tous les champs",
      });
      return;
    }

    setIsLoading(true);

    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success(t.auth.success.loginSuccess);
      console.log("Login successful:", formData);
    } catch (error) {
      toast.error(t.common.error, {
        description: t.auth.errors.loginFailed,
      });
      console.error("Login error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-8 md:p-12" onSubmit={handleSubmit}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-4 text-center">
                <Image
                  src="/assets/logo/logo_taskforce_tp.png"
                  alt="Taskforce Logo"
                  width={120}
                  height={120}
                  priority
                />
                <div>
                  <h1 className="text-2xl font-bold">{t.auth.login.title}</h1>
                  <p className="text-muted-foreground text-balance mt-2">
                    {t.auth.login.subtitle}
                  </p>
                </div>
              </div>
              <Field>
                <FieldLabel htmlFor="email">
                  {t.auth.login.emailLabel}
                </FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t.auth.login.emailPlaceholder}
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">
                    {t.auth.login.passwordLabel}
                  </FieldLabel>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto text-sm underline-offset-2 hover:underline"
                  >
                    {t.auth.login.forgotPassword}
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder={t.auth.login.passwordPlaceholder}
                  value={formData.password}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                />
              </Field>
              <Field>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? t.common.loading : t.auth.login.signInButton}
                </Button>
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                {t.auth.login.dividerText}
              </FieldSeparator>
              <Field className="grid grid-cols-2 gap-4">
                <Button variant="secondary" type="button">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">
                    {t.auth.login.signInWithGoogle}
                  </span>
                </Button>
                <Button variant="secondary" type="button">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">
                    {t.auth.login.signInWithGithub}
                  </span>
                </Button>
              </Field>
              <FieldDescription className="text-center">
                {t.auth.login.noAccount}{" "}
                <Link
                  href="/auth/register"
                  className="underline underline-offset-4"
                >
                  {t.auth.login.signUpLink}
                </Link>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="relative hidden md:block overflow-hidden">
            {/* Gradient fluide abstrait */}
            <div className="absolute inset-0 bg-linear-to-br from-primary/10 via-secondary/20 to-accent/15" />
            <div className="absolute inset-0 bg-linear-to-tl from-primary/5 via-transparent to-primary/10" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-60 animate-pulse" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-secondary/30 rounded-full blur-3xl opacity-50" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-accent/25 rounded-full blur-2xl opacity-40" />

            {/* Contenu */}
            <div className="absolute inset-0 flex items-center justify-center p-12">
              <div className="text-center space-y-6">
                <Image
                  src="/assets/logo/logo_taskforce_tp.png"
                  alt="Taskforce"
                  width={200}
                  height={200}
                  className="mx-auto dark:brightness-[0.9]"
                />
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-foreground/90">
                    Bienvenue sur Taskforce
                  </h3>
                  <p className="text-muted-foreground text-sm max-w-md">
                    La plateforme de gestion de projets collaborative pour les
                    équipes modernes
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        En continuant, vous acceptez nos{" "}
        <Link href="/legal-notices" className="underline underline-offset-4">
          Conditions d&apos;utilisation
        </Link>{" "}
        et notre{" "}
        <Link href="/privacy-policy" className="underline underline-offset-4">
          Politique de confidentialité
        </Link>
        .
      </FieldDescription>
    </div>
  );
}
