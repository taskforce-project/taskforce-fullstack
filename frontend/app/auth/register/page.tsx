"use client";

import { SignupForm } from "@/components/signup-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 w-full max-w-6xl">
      <div className="w-full">
        <SignupForm />
      </div>
    </div>
  );
}
