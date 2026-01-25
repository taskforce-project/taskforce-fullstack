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
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Badge } from "@/components/ui/badge";

type Step = "info" | "otp" | "organization";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { t } = usePreferencesStore();
  const [currentStep, setCurrentStep] = useState<Step>("info");
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    otp: "",
    organizationName: "",
    role: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNextStep = async () => {
    if (currentStep === "info") {
      // Validation de l'étape 1
      if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
        toast.error(t.common.error, { description: "Veuillez remplir tous les champs" });
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        toast.error(t.common.error, { description: t.auth.errors.passwordsDoNotMatch });
        return;
      }
      if (formData.password.length < 8) {
        toast.error(t.common.error, { description: t.auth.errors.passwordTooShort });
        return;
      }

      setIsLoading(true);
      // Simuler l'envoi d'email OTP
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setIsLoading(false);
      toast.success("Code de vérification envoyé à votre email");
      setCurrentStep("otp");
    } else if (currentStep === "otp") {
      if (formData.otp.length !== 6) {
        toast.error(t.common.error, { description: "Veuillez entrer le code à 6 chiffres" });
        return;
      }
      setIsLoading(true);
      // Simuler la vérification OTP
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setIsLoading(false);
      toast.success("Email vérifié avec succès");
      setCurrentStep("organization");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentStep === "organization") {
      setIsLoading(true);
      try {
        // TODO: Replace with actual API call
        await new Promise((resolve) => setTimeout(resolve, 1500));
        toast.success(t.auth.success.registrationSuccess);
        console.log("Registration successful:", formData);
      } catch (error) {
        toast.error(t.common.error, { description: t.auth.errors.registrationFailed });
        console.error("Registration error:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const renderStepIndicator = () => {
    const steps = [
      { id: "info", label: "Informations", number: 1 },
      { id: "otp", label: "Vérification", number: 2 },
      { id: "organization", label: "Organisation", number: 3 },
    ];

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <Badge
              variant={currentStep === step.id ? "default" : "outline"}
              className={cn(
                "rounded-full w-8 h-8 flex items-center justify-center",
                currentStep === step.id && "ring-2 ring-offset-2 ring-primary"
              )}
            >
              {step.number}
            </Badge>
            {index < steps.length - 1 && (
              <div className="w-12 h-0.5 bg-border mx-2" />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col gap-6 w-full", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-8 md:p-12" onSubmit={handleSubmit}>
            <FieldGroup>
              {currentStep === "info" && (
                <>
                  <div className="flex flex-col items-center gap-4 text-center">
                    <Image
                      src="/assets/logo/logo_taskforce_tp.png"
                      alt="Taskforce Logo"
                      width={100}
                      height={100}
                      priority
                    />
                    <div>
                      <h1 className="text-2xl font-bold">{t.auth.register.title}</h1>
                      <p className="text-muted-foreground text-sm text-balance mt-2">
                        {t.auth.register.subtitle}
                      </p>
                    </div>
                  </div>

                  {renderStepIndicator()}

                  <Field className="grid grid-cols-2 gap-4">
                    <Field>
                      <FieldLabel htmlFor="firstName">
                        {t.auth.register.step1.firstNameLabel}
                      </FieldLabel>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => handleChange("firstName", e.target.value)}
                        placeholder={t.auth.register.step1.firstNamePlaceholder}
                        required
                        disabled={isLoading}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="lastName">
                        {t.auth.register.step1.lastNameLabel}
                      </FieldLabel>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => handleChange("lastName", e.target.value)}
                        placeholder={t.auth.register.step1.lastNamePlaceholder}
                        required
                        disabled={isLoading}
                      />
                    </Field>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="email">{t.auth.register.step1.emailLabel}</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      placeholder={t.auth.register.step1.emailPlaceholder}
                      required
                      disabled={isLoading}
                    />
                  </Field>

                  <Field className="grid grid-cols-2 gap-4">
                    <Field>
                      <FieldLabel htmlFor="password">
                        {t.auth.register.step1.passwordLabel}
                      </FieldLabel>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => handleChange("password", e.target.value)}
                        placeholder={t.auth.register.step1.passwordPlaceholder}
                        required
                        disabled={isLoading}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="confirmPassword">
                        {t.auth.register.step1.confirmPasswordLabel}
                      </FieldLabel>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={formData.confirmPassword}
                        onChange={(e) => handleChange("confirmPassword", e.target.value)}
                        placeholder={t.auth.register.step1.confirmPasswordPlaceholder}
                        required
                        disabled={isLoading}
                      />
                    </Field>
                  </Field>

                  <FieldDescription className="text-xs">
                    Le mot de passe doit contenir au moins 8 caractères.
                  </FieldDescription>

                  <Field>
                    <Button type="button" onClick={handleNextStep} disabled={isLoading}>
                      {isLoading ? t.common.loading : t.common.next}
                    </Button>
                  </Field>
                </>
              )}

              {currentStep === "otp" && (
                <>
                  <div className="flex flex-col items-center gap-4 text-center">
                    <Image
                      src="/assets/logo/logo_taskforce_tp.png"
                      alt="Taskforce Logo"
                      width={80}
                      height={80}
                    />
                    <div>
                      <h1 className="text-2xl font-bold">Vérifiez votre email</h1>
                      <p className="text-muted-foreground text-sm text-balance mt-2">
                        Nous avons envoyé un code à {formData.email}
                      </p>
                    </div>
                  </div>

                  {renderStepIndicator()}

                  <Field>
                    <FieldLabel htmlFor="otp" className="sr-only">
                      Code de vérification
                    </FieldLabel>
                    <InputOTP
                      maxLength={6}
                      id="otp"
                      value={formData.otp}
                      onChange={(value) => handleChange("otp", value)}
                      required
                      containerClassName="gap-4 justify-center"
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                      </InputOTPGroup>
                      <InputOTPSeparator />
                      <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                    <FieldDescription className="text-center mt-4">
                      Entrez le code à 6 chiffres envoyé à votre email.
                    </FieldDescription>
                  </Field>

                  <Field className="grid grid-cols-2 gap-4">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setCurrentStep("info")}
                      disabled={isLoading}
                    >
                      {t.common.back}
                    </Button>
                    <Button type="button" onClick={handleNextStep} disabled={isLoading}>
                      {isLoading ? t.common.loading : "Vérifier"}
                    </Button>
                  </Field>

                  <FieldDescription className="text-center">
                    Vous n&apos;avez pas reçu le code ?{" "}
                    <button type="button" className="underline underline-offset-4">
                      Renvoyer
                    </button>
                  </FieldDescription>
                </>
              )}

              {currentStep === "organization" && (
                <>
                  <div className="flex flex-col items-center gap-4 text-center">
                    <Image
                      src="/assets/logo/logo_taskforce_tp.png"
                      alt="Taskforce Logo"
                      width={80}
                      height={80}
                    />
                    <div>
                      <h1 className="text-2xl font-bold">
                        {t.auth.register.step2.title}
                      </h1>
                      <p className="text-muted-foreground text-sm text-balance mt-2">
                        {t.auth.register.step2.subtitle}
                      </p>
                    </div>
                  </div>

                  {renderStepIndicator()}

                  <Field>
                    <FieldLabel htmlFor="organizationName">
                      {t.auth.register.step2.organizationNameLabel}
                    </FieldLabel>
                    <Input
                      id="organizationName"
                      value={formData.organizationName}
                      onChange={(e) => handleChange("organizationName", e.target.value)}
                      placeholder={t.auth.register.step2.organizationNamePlaceholder}
                      disabled={isLoading}
                    />
                    <FieldDescription>Optionnel</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="role">
                      {t.auth.register.step2.roleLabel}
                    </FieldLabel>
                    <Input
                      id="role"
                      value={formData.role}
                      onChange={(e) => handleChange("role", e.target.value)}
                      placeholder={t.auth.register.step2.rolePlaceholder}
                      disabled={isLoading}
                    />
                    <FieldDescription>Optionnel</FieldDescription>
                  </Field>

                  <Field className="grid grid-cols-2 gap-4">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setCurrentStep("otp")}
                      disabled={isLoading}
                    >
                      {t.common.back}
                    </Button>
                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? t.common.loading : "Créer mon compte"}
                    </Button>
                  </Field>
                </>
              )}

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
                  <span className="sr-only">S&apos;inscrire avec Google</span>
                </Button>
                <Button variant="secondary" type="button">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="sr-only">S&apos;inscrire avec GitHub</span>
                </Button>
              </Field>

              <FieldDescription className="text-center">
                {t.auth.register.alreadyHaveAccount}{" "}
                <Link href="/auth/login" className="underline underline-offset-4">
                  {t.auth.register.signInLink}
                </Link>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="relative hidden md:block overflow-hidden">
            {/* Gradient fluide abstrait */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/20 to-accent/15" />
            <div className="absolute inset-0 bg-gradient-to-tl from-primary/5 via-transparent to-primary/10" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-60 animate-pulse" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-secondary/30 rounded-full blur-3xl opacity-50" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-accent/25 rounded-full blur-2xl opacity-40" />
            
            {/* Contenu */}
            <div className="absolute inset-0 flex items-center justify-center p-12">
              <div className="text-center space-y-6">
                <Image
                  src="/assets/logo/logo_taskforce_tp.png"
                  alt="Taskforce"
                  width={180}
                  height={180}
                  className="mx-auto dark:brightness-[0.9]"
                />
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-foreground/90">Rejoignez Taskforce</h3>
                  <p className="text-muted-foreground text-sm max-w-md">
                    Créez votre compte et commencez à collaborer avec votre équipe dès aujourd&apos;hui
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
