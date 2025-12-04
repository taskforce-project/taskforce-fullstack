"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

// Files
import { Moon, Sun, Menu, X } from "lucide-react";

// Components
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";

interface HeaderProps {
  isDark: boolean;
  toggleTheme: () => void;
}

export function Header({ isDark, toggleTheme }: Readonly<HeaderProps>) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setMobileMenuOpen(false);
    }
  };

  const navItems = [
    { label: "Fonctionnalités", id: "features" },
    { label: "Tarifs", id: "pricing" },
    { label: "À propos", id: "about" },
    { label: "Contact", id: "contact" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <nav className="container mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Image
            src="/favicon.ico"
            alt="TaskForce AI Logo"
            width={40}
            height={40}
            className="w-10 h-10 rounded-md"
          />
          <span className="text-foreground text-lg font-semibold">TaskForce AI</span>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-2">
          {navItems.map((item) => (
            <Button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              variant="link"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.label}
            </Button>
          ))}
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="rounded-full"
          >
            {isDark ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/authentication#login")}
            >
              Connexion
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => router.push("/authentication#register")}
            >
              S&apos;inscrire
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background border-b border-border overflow-hidden"
          >
            <div className="container mx-auto px-4 py-4 flex flex-col gap-4">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className="text-left text-muted-foreground hover:text-foreground transition-colors py-2"
                >
                  {item.label}
                </button>
              ))}
              <div className="flex flex-col gap-2 pt-4 border-t border-border">
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    router.push("/authentication#login");
                    setMobileMenuOpen(false);
                  }}
                >
                  Connexion
                </Button>
                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => {
                    router.push("/authentication#register");
                    setMobileMenuOpen(false);
                  }}
                >
                  S&apos;inscrire
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
