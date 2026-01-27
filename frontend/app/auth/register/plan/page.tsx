"use client";

import { RegisterPlanForm } from "@/components/auth/register/plan/plan-form";

export default function RegisterPlanPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 w-full max-w-7xl mx-auto">
      <RegisterPlanForm />
    </div>
  );
}
