import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/contexts/auth-context";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/providers/error-boundary";
import { CookieConsent } from "@/components/common/cookie-consent";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import { A11yFilters } from "@/components/a11y/a11y-filters";
import { Toaster } from "@/components/ui/sonner";
import { IS_DESKTOP } from "@/lib/desktop";

// Geist et Geist Mono (Vercel, licence SIL Open Font) : polices de la direction artistique 2026.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TaskForce",
  description: "Open-source project management where people and AI agents work together.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Variables de police sur <html> : --font-sans (globals.css, :root) les référence ; posées sur <body>,
    // elles n'existaient pas au niveau racine et la police retombait sur celle du système.
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          <I18nProvider>
            <TooltipProvider>
              <ErrorBoundary>
                <AuthProvider>
                  {/* Conteneur d'app : porte le filtre daltonien (cf. globals.css). Les portails Radix
                      (modals/voile/menus) + le Toaster + la banniere cookie vivent HORS de ce div ->
                      leur `position: fixed` reste ancree au viewport meme en mode daltonien. */}
                  <div id="app-root">{children}</div>
                  {/* Statistiques d'usage : jamais dans l'app desktop, qui n'envoie aucune télémétrie. */}
                  {!IS_DESKTOP && (
                    <>
                      <CookieConsent />
                      <PostHogProvider />
                    </>
                  )}
                </AuthProvider>
              </ErrorBoundary>
              {/* Défs SVG des filtres daltonisme - appliquées à <body> via globals.css (en plus du contraste élevé) */}
              <A11yFilters />
              {/* Toaster UNIQUE, au niveau racine : couvre TOUTES les routes (app, auth, onboarding,
                  paiement, pages d'erreur). Un seul, sinon sonner rend chaque toast en double. */}
              <Toaster position="bottom-right" richColors closeButton />
            </TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
