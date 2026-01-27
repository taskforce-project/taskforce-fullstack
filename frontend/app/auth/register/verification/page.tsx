"use client";

import { OTPForm } from "@/components/auth/register/verification/verification-form";

export default function RegisterVerificationPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 w-full max-w-5xl mx-auto">
      <OTPForm />
    </div>
  );
}
