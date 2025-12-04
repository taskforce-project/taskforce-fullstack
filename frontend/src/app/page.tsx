"use client";

import { useState, useEffect } from "react";

// Files
import { Header } from "./landing/Header";
import { Hero } from "./landing/Hero";
import { Features } from "./landing/Features";
import { HowItWorks } from "./landing/HowItWorks";
import { Pricing } from "./landing/Pricing";
import { Testimonials } from "./landing/Testimonials";
import { Footer } from "./landing/Footer";
import { ScrollToTop } from "@/components/ui/scroll-to-top";

export default function LandingPage() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const isDarkMode = globalThis.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    setIsDark(isDarkMode);
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header isDark={isDark} toggleTheme={toggleTheme} />
      <main className="flex flex-col gap-20 py-10 px-4 md:py-16 md:px-8 lg:py-24 lg:px-16">
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
        <Testimonials />
      </main>
      <Footer />
      <ScrollToTop />
    </div>
  );
}
