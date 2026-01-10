"use client";

import { usePreferencesStore } from "@/lib/store/preferences-store";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { theme, toggleTheme, language, setLanguage, t } = usePreferencesStore();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar - Controls */}
      <div className="fixed top-0 right-0 z-50 p-4 flex items-center gap-2">
        {/* Language Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full bg-background/80 backdrop-blur-sm border-border/50 hover:bg-accent"
              aria-label={t.accessibility.changeLanguage}
            >
              <Languages className="h-4 w-4" />
            </Button>
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
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTheme}
          className="rounded-full bg-background/80 backdrop-blur-sm border-border/50 hover:bg-accent"
          aria-label={t.accessibility.toggleTheme}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        {children}
      </main>

      {/* Toast Notifications */}
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
