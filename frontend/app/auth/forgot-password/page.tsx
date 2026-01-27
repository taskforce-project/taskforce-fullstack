"use client";

import { ForgotPasswordForm } from "@/components/auth/forgot-password/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 w-full max-w-5xl mx-auto">
      <ForgotPasswordForm />
    </div>
  );
}

