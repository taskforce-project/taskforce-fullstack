import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/contexts/auth-context";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/providers/error-boundary";
import { CookieBanner } from "@/components/common/cookie-banner";
import { A11yFilters } from "@/components/a11y/a11y-filters";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TaskForce",
  description: "AI-native operations platform for service companies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          <I18nProvider>
            <TooltipProvider>
              <ErrorBoundary>
                <AuthProvider>
                  {children}
                  <CookieBanner />
                </AuthProvider>
              </ErrorBoundary>
              {/* Défs SVG des filtres daltonisme — appliquées à <body> via globals.css (en plus du contraste élevé) */}
              <A11yFilters />
            </TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
