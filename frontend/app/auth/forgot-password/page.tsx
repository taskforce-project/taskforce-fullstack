"use client";

import { ForgotPasswordForm } from "@/components/auth/forgot-password/forgot-password-form";
import { Suspense } from "react";

function ForgotPasswordContent() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 w-full max-w-5xl mx-auto">
      <ForgotPasswordForm />
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div>Chargement...</div>}>
      <ForgotPasswordContent />
    </Suspense>
  );
}

