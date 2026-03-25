"use client";

import { SignupForm } from "@/components/auth/register/register-info-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 w-full max-w-6xl mx-auto">
      <SignupForm />
    </div>
  );
}
