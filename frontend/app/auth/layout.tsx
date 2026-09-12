"use client";

import { usePreferencesStore } from "@/lib/store/preferences-store";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppFooter } from "@/components/layout/app-footer";
import { SITE_URL } from "@/lib/config/urls";

/**
 * Coquille des pages d'authentification - **ecran scinde**.
 *
 * A GAUCHE (>= 1024px) un panneau de marque : fond sombre, grain recree en interne (feTurbulence, aucune
 * dependance), titre produit et une **capture reelle de l'app**. A DROITE le formulaire, sur fond de
 * theme, en trois bandes (barre · contenu centre · mention legale). Sous 1024px le panneau cede la place
 * et le formulaire prend toute la largeur (la marque revient alors dans la barre). Hauteur 100svh, sans
 * defilement : ces pages restent un passage.
 *
 * Le panneau gauche est un decor de marque volontairement sombre dans les deux themes ; seule la colonne
 * formulaire suit le theme clair/sombre.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { theme, toggleTheme, t } = usePreferencesStore();
  const pathname = usePathname();

  // Preferences = stockage local : rendues cote serveur elles produiraient un ecart d'hydratation.
  // `useSyncExternalStore` (instantane serveur=false, client=true) evite un setState dans un effet.
  const mounted = useSyncExternalStore(
    () => () => { },
    () => true,
    () => false
  );

  // Sur la connexion on propose l'inscription, partout ailleurs la connexion.
  const onLoginPage = pathname?.startsWith("/auth/login") ?? false;
  const opposite = onLoginPage
    ? { href: "/auth/register", label: t.auth.ui.createAccount }
    : { href: "/auth/login", label: t.auth.ui.signIn };

  // « Le site » est un projet Astro sur une autre origine (www vs app) -> `<a>`, pas `<Link>`.
  const siteUrl = SITE_URL;

  return (
    <div className="auth-shell">
      {/* ── Panneau de marque (gauche, desktop) : grain interne + capture reelle de l'app ── */}
      <aside className="auth-aside">
        <div className="auth-aside-noise" />
        <div className="auth-aside-content">
          <a href={siteUrl} className="auth-aside-brand" aria-label="TaskForce, retour au site">
            <Image
              src="/assets/logo/logo_taskforce_tp.png"
              alt="TaskForce"
              width={150}
              height={100}
              priority
              className="h-16 w-auto"
            />
          </a>

          <div className="auth-aside-copy">
            <h2 className="auth-aside-title">{t.auth.ui.panelTitle}</h2>
            <p className="auth-aside-subtitle">{t.auth.ui.panelSubtitle}</p>
          </div>

          <div className="auth-aside-shot">
            <Image
              src="/screens/dashboard.webp"
              alt=""
              width={1600}
              height={862}
              priority
              className="auth-aside-shot-img"
            />
          </div>
        </div>
      </aside>

      {/* ── Colonne formulaire (droite) : barre · contenu · footer ── */}
      <div className="auth-formcol">
        <header className="auth-topbar">
          <a href={siteUrl} className="auth-brand-mobile" aria-label="TaskForce, retour au site">
            <Image
              src="/assets/logo/logo_taskforce_tp.png"
              alt=""
              width={96}
              height={64}
              priority
              className="h-9 w-auto dark:invert"
            />
          </a>

          <div className="auth-actions">
            {mounted && (
              <button
                type="button"
                className="auth-icon-btn"
                onClick={toggleTheme}
                aria-label={t.accessibility.toggleTheme}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}

            <Link href={opposite.href} className="auth-cta-btn">
              {opposite.label}
            </Link>
          </div>
        </header>

        <main className="auth-main">{children}</main>

        <AppFooter bleed={false} />
      </div>
    </div>
  );
}
