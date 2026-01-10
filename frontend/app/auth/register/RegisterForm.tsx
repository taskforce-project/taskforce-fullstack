"use client";

import { useState } from "react";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RegisterStep1, type Step1Data } from "./RegisterStep1";
import { RegisterStep2, type Step2Data } from "./RegisterStep2";
import { RegisterStep3 } from "./RegisterStep3";

interface RegisterFormProps {
  currentStep: number;
  onNextStep: () => void;
  onPreviousStep: () => void;
}

export function RegisterForm({ currentStep, onNextStep, onPreviousStep }: RegisterFormProps) {
  const { t } = usePreferencesStore();
  const [isLoading, setIsLoading] = useState(false);

  // Step 1 Data
  const [step1Data, setStep1Data] = useState<Step1Data>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
  });
  const [step1Errors, setStep1Errors] = useState<Partial<Record<keyof Step1Data, string>>>({});

  // Step 2 Data
  const [step2Data, setStep2Data] = useState<Step2Data>({
    organizationName: "",
    role: "",
    teamSize: "",
    industry: "",
  });
  const [step2Errors, setStep2Errors] = useState<Partial<Record<keyof Step2Data, string>>>({});

  // Validation Functions
  const validateStep1 = (): boolean => {
    const errors: Partial<Record<keyof Step1Data, string>> = {};

    if (!step1Data.firstName.trim()) {
      errors.firstName = t.auth.errors.firstNameRequired;
    }
    if (!step1Data.lastName.trim()) {
      errors.lastName = t.auth.errors.lastNameRequired;
    }
    if (!step1Data.email.trim()) {
      errors.email = t.auth.errors.emailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step1Data.email)) {
      errors.email = t.auth.errors.invalidEmail;
    }
    if (!step1Data.password) {
      errors.password = t.auth.errors.passwordRequired;
    } else if (step1Data.password.length < 8) {
      errors.password = t.auth.errors.passwordTooShort;
    }
    if (step1Data.password !== step1Data.confirmPassword) {
      errors.confirmPassword = t.auth.errors.passwordsDoNotMatch;
    }
    if (!step1Data.acceptTerms) {
      errors.acceptTerms = t.auth.errors.termsRequired;
    }

    setStep1Errors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const errors: Partial<Record<keyof Step2Data, string>> = {};

    if (!step2Data.organizationName.trim()) {
      errors.organizationName = t.auth.errors.organizationRequired;
    }
    if (!step2Data.role) {
      errors.role = t.auth.errors.roleRequired;
    }

    setStep2Errors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handlers
  const handleStep1Change = (field: keyof Step1Data, value: string | boolean) => {
    setStep1Data((prev) => ({ ...prev, [field]: value }));
    if (step1Errors[field]) {
      setStep1Errors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleStep2Change = (field: keyof Step2Data, value: string) => {
    setStep2Data((prev) => ({ ...prev, [field]: value }));
    if (step2Errors[field]) {
      setStep2Errors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (validateStep1()) {
        onNextStep();
      } else {
        toast.error(t.common.error, {
          description: Object.values(step1Errors)[0],
        });
      }
    } else if (currentStep === 2) {
      if (validateStep2()) {
        onNextStep();
      } else {
        toast.error(t.common.error, {
          description: Object.values(step2Errors)[0],
        });
      }
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);

    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const registrationData = {
        ...step1Data,
        ...step2Data,
      };

      toast.success(t.auth.success.registrationSuccess);
      console.log("Registration successful:", registrationData);
      
      // TODO: Redirect to dashboard or email verification
    } catch (error) {
      toast.error(t.common.error, {
        description: t.auth.errors.registrationFailed,
      });
      console.error("Registration error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step Content */}
      <div className="min-h-[400px]">
        {currentStep === 1 && (
          <RegisterStep1
            data={step1Data}
            errors={step1Errors}
            onChange={handleStep1Change}
            isLoading={isLoading}
          />
        )}
        {currentStep === 2 && (
          <RegisterStep2
            data={step2Data}
            errors={step2Errors}
            onChange={handleStep2Change}
            isLoading={isLoading}
          />
        )}
        {currentStep === 3 && (
          <RegisterStep3 step1Data={step1Data} step2Data={step2Data} />
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t">
        {currentStep > 1 ? (
          <Button
            variant="outline"
            onClick={onPreviousStep}
            disabled={isLoading}
          >
            {t.common.previous}
          </Button>
        ) : (
          <div />
        )}

        {currentStep < 3 ? (
          <Button onClick={handleNext} disabled={isLoading}>
            {t.common.next}
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? t.common.loading : t.auth.register.step3.startTrialButton}
          </Button>
        )}
      </div>
    </div>
  );
}
