"use client"

import { SettingsPanels } from "@/app/(protected)/[workspace]/settings/page"

/**
 * Compte TaskForce, hors de tout espace de travail : adresse, mot de passe, double authentification, passkeys et
 * ordinateurs connectés à l'app desktop. L'app desktop ouvre cette page (« Manage your account ») : un compte créé
 * depuis l'app n'a pas d'espace de travail en ligne, et n'a pas à passer par l'onboarding de la webapp pour la voir.
 */
export default function AccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Your TaskForce account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The same account in the web app and in the desktop app.
        </p>
      </div>
      <SettingsPanels active="account" />
      <SettingsPanels active="security" />
    </div>
  )
}
