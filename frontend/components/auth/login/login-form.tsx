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
import { useAuth } from "@/lib/contexts/auth-context";
import {
  validateEmail,
  sanitizeInput,
  globalRateLimiter,
} from "@/lib/utils/validation";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = usePreferencesStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation des champs vides
    if (!formData.email || !formData.password) {
      toast.error(t.common.error, {
        description: "Veuillez remplir tous les champs",
      });
      return;
    }

    // Rate limiting - 5 tentatives par 15 minutes
    if (!globalRateLimiter.isAllowed("login", 5, 15 * 60 * 1000)) {
      const timeLeft = globalRateLimiter.getTimeUntilReset("login", 15 * 60 * 1000);
      toast.error(t.common.error, {
        description: `Trop de tentatives. Réessayez dans ${timeLeft} secondes`,
      });
      return;
    }

    // Validation format email
    if (!validateEmail(formData.email)) {
      toast.error(t.common.error, {
        description: "Format d'email invalide",
      });
      return;
    }

    // Sanitization des inputs
    const sanitizedEmail = sanitizeInput(formData.email);
    const sanitizedPassword = sanitizeInput(formData.password);

    setIsLoading(true);

    try {
      await login({
        email: sanitizedEmail,
        password: sanitizedPassword,
      });
      
      // Réinitialiser le rate limiter en cas de succès
      globalRateLimiter.reset("login");
      
      toast.success(t.auth.success.loginSuccess);

      // Redirection vers dashboard après login
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(t.common.error, {
        description: error.message || t.auth.errors.loginFailed,
      });
      console.error("Login error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6 w-[80%]", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form onSubmit={handleSubmit} className="p-6 md:p-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Connexion</h1>
                <p className="text-muted-foreground text-balance">
                  Connectez-vous à votre compte TaskForce
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@exemple.com"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  disabled={isLoading}
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto text-sm underline-offset-2 hover:underline"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
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
              </Field>
              <Field>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Connexion..." : "Se connecter"}
                </Button>
              </Field>
              <FieldDescription className="text-center">
                Vous n&apos;avez pas de compte ?{" "}
                <Link href="/auth/register">Créer un compte</Link>
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
      <FieldDescription className="text-center">
        En continuant, vous acceptez nos{" "}
        <Link href="/legal-notices">Conditions d&apos;utilisation</Link> et{" "}
        <Link href="/privacy-policy">Politique de confidentialité</Link>.
      </FieldDescription>
    </div>
  );
}
