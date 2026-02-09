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
import { Progress } from "@/components/ui/progress";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setRegisterData } from "@/lib/auth/register-storage";
import { authService } from "@/lib/api";
import {
  validateEmail,
  validateName,
  validatePassword,
  sanitizeInput,
  isDisposableEmail,
  calculatePasswordStrength,
} from "@/lib/utils/validation";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation des champs vides
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password || !formData.confirmPassword) {
      toast.error(t.common.error, { 
        description: "Veuillez remplir tous les champs" 
      });
      return;
    }

    // Validation des noms
    if (!validateName(formData.firstName)) {
      toast.error(t.common.error, {
        description: "Le prénom n'est pas valide (2-50 caractères, lettres uniquement)",
      });
      return;
    }

    if (!validateName(formData.lastName)) {
      toast.error(t.common.error, {
        description: "Le nom n'est pas valide (2-50 caractères, lettres uniquement)",
      });
      return;
    }

    // Validation email
    if (!validateEmail(formData.email)) {
      toast.error(t.common.error, {
        description: "Format d'email invalide",
      });
      return;
    }

    // Vérifier les emails jetables
    if (isDisposableEmail(formData.email)) {
      toast.error(t.common.error, {
        description: "Les adresses email temporaires ne sont pas autorisées",
      });
      return;
    }

    // Validation confirmation mot de passe
    if (formData.password !== formData.confirmPassword) {
      toast.error(t.common.error, { 
        description: t.auth.errors.passwordsDoNotMatch 
      });
      return;
    }

    // Validation renforcée du mot de passe
    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.isValid) {
      toast.error(t.common.error, {
        description: passwordValidation.errors[0], // Afficher la première erreur
      });
      return;
    }

    // Vérifier la force du mot de passe
    const strength = calculatePasswordStrength(formData.password);
    if (strength < 50) {
      toast.error(t.common.error, {
        description: "Le mot de passe est trop faible. Utilisez un mot de passe plus complexe.",
      });
      return;
    }

    // Sanitization des inputs
    const sanitizedData = {
      firstName: sanitizeInput(formData.firstName),
      lastName: sanitizeInput(formData.lastName),
      email: sanitizeInput(formData.email),
      password: formData.password,
    };

    setIsLoading(true);

    try {
      // Stocker les données dans sessionStorage pour les étapes suivantes
      // L'API sera appelée à l'étape 3 avec toutes les données
      setRegisterData({
        firstName: sanitizedData.firstName,
        lastName: sanitizedData.lastName,
        email: sanitizedData.email,
        password: sanitizedData.password,
      });

      toast.success("Informations enregistrées", {
        description: "Passez à l'étape suivante pour choisir votre plan",
      });
      
      // Redirection vers choix du plan
      router.push('/auth/register/plan');
    } catch (error: any) {
      toast.error(t.common.error, { 
        description: error.message || t.auth.errors.registrationFailed 
      });
      console.error("Registration error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6 w-[80%]", className)} {...props}>
      {/* Progress indicator */}
      <div className="w-full space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Étape 1 sur 3</span>
          <span>33%</span>
        </div>
        <Progress value={33} />
      </div>

      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form onSubmit={handleSubmit} className="p-6 md:p-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Créer un compte</h1>
                <p className="text-muted-foreground text-sm text-balance">
                  Entrez vos informations pour créer votre compte
                </p>
              </div>
              <Field className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="firstName">Prénom</FieldLabel>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    required
                    value={formData.firstName}
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                    disabled={isLoading}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="lastName">Nom</FieldLabel>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    required
                    value={formData.lastName}
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                    disabled={isLoading}
                  />
                </Field>
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="john.doe@exemple.com"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  disabled={isLoading}
                />
              </Field>
              <Field>
                <Field className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
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
                    <FieldLabel htmlFor="confirm-password">
                      Confirmer
                    </FieldLabel>
                    <Input
                      id="confirm-password"
                      type="password"
                      required
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        setFormData({ ...formData, confirmPassword: e.target.value })
                      }
                      disabled={isLoading}
                    />
                  </Field>
                </Field>
                <FieldDescription>
                  Au moins 8 caractères.
                </FieldDescription>
              </Field>
              <Field>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Création..." : "Continuer"}
                </Button>
              </Field>
              <FieldDescription className="text-center">
                Vous avez déjà un compte ?{" "}
                <Link href="/auth/login">Se connecter</Link>
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