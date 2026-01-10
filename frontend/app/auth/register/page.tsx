"use client";

import { useState } from "react";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { RegisterForm } from "./RegisterForm";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function RegisterPage() {
  const { t } = usePreferencesStore();
  const [currentStep, setCurrentStep] = useState(1);

  const steps = [
    {
      number: 1,
      label: t.auth.register.progress.step1,
      title: t.auth.register.step1.title,
      subtitle: t.auth.register.step1.subtitle,
    },
    {
      number: 2,
      label: t.auth.register.progress.step2,
      title: t.auth.register.step2.title,
      subtitle: t.auth.register.step2.subtitle,
    },
    {
      number: 3,
      label: t.auth.register.progress.step3,
      title: t.auth.register.step3.title,
      subtitle: t.auth.register.step3.subtitle,
    },
  ];

  const handleNextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-8">
      {/* Logo & Header */}
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-2xl font-bold text-primary-foreground">TF</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {t.common.appName}
          </h1>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center justify-between relative">
        {/* Progress Line */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-border">
          <div
            className="h-full bg-primary transition-all duration-300 ease-in-out"
            style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
          />
        </div>

        {/* Steps */}
        {steps.map((step) => (
          <div
            key={step.number}
            className="flex flex-col items-center gap-2 relative z-10"
          >
            <div
              className={cn(
                "w-10 h-10 rounded-full border-2 flex items-center justify-center font-semibold transition-all duration-300",
                currentStep === step.number
                  ? "bg-primary border-primary text-primary-foreground"
                  : currentStep > step.number
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-background border-border text-muted-foreground"
              )}
            >
              {step.number}
            </div>
            <span
              className={cn(
                "text-xs font-medium transition-colors",
                currentStep >= step.number
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Current Step Info */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">
          {steps[currentStep - 1].title}
        </h2>
        <p className="text-muted-foreground">
          {steps[currentStep - 1].subtitle}
        </p>
      </div>

      {/* Registration Card */}
      <Card className="p-8 shadow-lg border-border/50">
        <RegisterForm
          currentStep={currentStep}
          onNextStep={handleNextStep}
          onPreviousStep={handlePreviousStep}
        />
      </Card>

      {/* Sign In Link */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          {t.auth.register.alreadyHaveAccount}{" "}
          <Link
            href="/auth/login"
            className="font-medium text-primary hover:underline"
          >
            {t.auth.register.signInLink}
          </Link>
        </p>
      </div>

      {/* Footer Links */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <Link href="/legal-notices" className="hover:text-foreground transition-colors">
          {t.auth.register.step1.termsLink}
        </Link>
        <span>•</span>
        <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
          {t.auth.register.step1.privacyLink}
        </Link>
      </div>
    </div>
  );
}
