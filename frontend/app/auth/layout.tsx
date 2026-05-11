"use client";

import { usePreferencesStore } from "@/lib/store/preferences-store";
import { Moon, Sun, Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { theme, toggleTheme, language, setLanguage, t } = usePreferencesStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="auth-shell">
        <main className="auth-main">{children}</main>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      {/* Top Bar - Controls */}
      <div className="auth-controls">
        {/* Language Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="auth-control-btn"
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
              🇫🇷 Français
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setLanguage("en")}
              className={language === "en" ? "bg-accent" : ""}
            >
              🇬🇧 English
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme Toggle */}
        <button
          className="auth-control-btn"
          onClick={toggleTheme}
          aria-label={t.accessibility.toggleTheme}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Main Content */}
      <main className="auth-main">
        {children}
      </main>

      {/* Toast Notifications */}
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
