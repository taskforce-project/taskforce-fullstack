"use client";

import { Suspense } from "react";

import { DesktopSignIn } from "@/components/auth/desktop/desktop-sign-in";

/** Connexion de l'app desktop, ouverte par l'app dans le navigateur (cf. `desktop/src/account.ts`). */
export default function DesktopSignInPage() {
  return (
    <Suspense>
      <DesktopSignIn />
    </Suspense>
  );
}
