"use client";

import { OTPForm } from "@/components/auth/register/verification/verification-form";
import { AuthStepper } from "@/components/auth/auth-stepper";

/** Étape 3 sur 3 - vérification de l'adresse par code à usage unique. */
export default function RegisterVerificationPage() {
  return (
    <div className="w-full max-w-md py-6">
      <AuthStepper current={2} />
      <OTPForm />
    </div>
  );
}
