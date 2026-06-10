"use client";

import { ForgotPasswordForm } from "@/components/auth/forgot-password/forgot-password-form";
import { Suspense } from "react";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
