"use client";

import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 w-full max-w-5xl">
      <div className="w-full">
        <LoginForm />
      </div>
    </div>
  );
}
