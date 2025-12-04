"use client";

import { Suspense } from "react";
import { GlobalLoader } from "@/components/ui/global-loader";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <GlobalLoader />
      </Suspense>
      {children}
      <Toaster position="top-right" richColors />
    </>
  );
}
