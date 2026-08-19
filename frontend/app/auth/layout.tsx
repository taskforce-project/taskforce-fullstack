"use client";

import { usePreferencesStore } from "@/lib/store/preferences-store";
import { Moon, Sun, Languages, ArrowLeft } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppFooter } from "@/components/layout/app-footer";

/**
 * Coquille des pages d'authentification.
 *
 * Trois bandes en grille : barre supérieure, contenu centré, footer. La hauteur est verrouillée à
 * 100svh et le débordement masqué — ces pages sont un passage, elles ne doivent pas défiler.
 *
 * **Regroupement à gauche** : la marque et le retour au site forment un seul bloc, plutôt que d'être
 * jetés aux deux extrémités d'une barre par ailleurs vide. La droite ne porte que les réglages et
 * **l'action opposée à la page courante** — proposer « Créer un compte » sur la page de connexion,
 * et « Se connecter » sur les pages d'inscription. C'est la convention des applications qui font
 * cet écran correctement : la barre cesse d'être décorative et devient un raccourci utile.
 *
 * Le footer est **celui de l'application** (`AppFooter`), sans marges négatives : ces pages en font
 * techniquement partie, il n'y a aucune raison d'en entretenir un second.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { theme, toggleTheme, language, setLanguage, t } = usePreferencesStore();
  const pathname = usePathname();

  // Les préférences viennent du stockage local : rendues côté serveur, elles produiraient un écart
  // d'hydratation (mauvais thème, mauvaise langue pendant une frame). On attend donc le client.
  //
  // `useSyncExternalStore` plutôt qu'un `useState` + `useEffect` : c'est le motif prévu pour cette
  // question précise — l'instantané serveur vaut `false`, l'instantané client `true`, sans appeler
  // `setState` depuis un effet, ce que le linter du projet signale à juste titre.
  const mounted = useSyncExternalStore(
    () => () => { },
    () => true,
    () => false
  );

  // Sur la connexion on propose l'inscription, partout ailleurs on propose la connexion.
  const onLoginPage = pathname?.startsWith("/auth/login") ?? false;
  const opposite = onLoginPage
    ? { href: "/auth/register", label: t.auth.ui.createAccount }
    : { href: "/auth/login", label: t.auth.ui.signIn };

  // « Le site » n'est PAS la racine de cette application : le site vitrine est un projet Astro
  // distinct, servi sur une autre origine — `www.example.com` face à `app.example.com` en
  // production, un autre port en développement. Pointer `/` renvoyait donc au tableau de bord.
  //
  // Conséquence directe : ce sont des `<a>` et non des `<Link>`. `Link` sert la navigation interne
  // de Next ; l'employer pour une autre origine déclenche une tentative de navigation côté client
  // sur une route qui n'existe pas ici.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4321";

  return (
    <div className="auth-shell">
      <header className="auth-topbar">
        <div className="auth-topbar-left">
          {/* Le logo seul, sans le mot « TaskForce » à côté : la marque est dans le dessin, la
              répéter en texte n'apprend rien et bridait la taille du signe. Le nom reste porté par
              l'`aria-label` du lien — les lecteurs d'écran annoncent toujours « TaskForce ».
              Dimensionné par la HAUTEUR : le fichier est plus large que haut (rapport ~3:2), fixer
              la largeur revenait à laisser la hauteur décider seule. */}
          <a href={siteUrl} className="auth-brand" aria-label="TaskForce, retour au site">
            <Image
              src="/assets/logo/logo_taskforce_tp.png"
              alt=""
              width={120}
              height={80}
              priority
              className="h-20 w-auto dark:invert"
            />
          </a>

          <a href={siteUrl} className="auth-back-link">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t.auth.ui.backToSite}
          </a>
        </div>

        <div className="auth-actions">
          {mounted && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="auth-icon-btn"
                    aria-label={t.accessibility.changeLanguage}
                  >
                    <Languages className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => setLanguage("fr")}
                    className={language === "fr" ? "bg-accent" : ""}
                  >
                    Français
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setLanguage("en")}
                    className={language === "en" ? "bg-accent" : ""}
                  >
                    English
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                className="auth-icon-btn"
                onClick={toggleTheme}
                aria-label={t.accessibility.toggleTheme}
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            </>
          )}

          <Link href={opposite.href} className="auth-cta-btn">
            {opposite.label}
          </Link>
        </div>
      </header>

      <main className="auth-main">{children}</main>

      <AppFooter bleed={false} />

      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
