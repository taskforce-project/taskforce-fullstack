import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { CONSTANTS_EN } from "../constants_en";
import { CONSTANTS_FR } from "../constants_fr";

export type Language = "en" | "fr";
export type Theme = "light" | "dark";

interface PreferencesState {
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  // Language
  language: Language;
  setLanguage: (language: Language) => void;
  t: typeof CONSTANTS_EN; // Translations object

  // Accessibility
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  
  fontSize: "normal" | "large" | "x-large";
  setFontSize: (size: "normal" | "large" | "x-large") => void;

  highContrast: boolean;
  setHighContrast: (value: boolean) => void;

  // Utility function to get translations
  getTranslations: () => typeof CONSTANTS_EN;
}

const getTranslations = (language: Language) => {
  return language === "en" ? CONSTANTS_EN : CONSTANTS_FR;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      // Theme
      theme: "light",
      setTheme: (theme) => {
        set({ theme });
        // Apply theme to document
        if (typeof window !== "undefined") {
          document.documentElement.classList.remove("light", "dark");
          document.documentElement.classList.add(theme);
        }
      },
      toggleTheme: () => {
        const newTheme = get().theme === "light" ? "dark" : "light";
        get().setTheme(newTheme);
      },

      // Language
      language: "fr",
      setLanguage: (language) => {
        set({ 
          language,
          t: getTranslations(language),
        });
      },
      t: CONSTANTS_FR, // Default to French

      // Accessibility
      reducedMotion: false,
      setReducedMotion: (value) => {
        set({ reducedMotion: value });
        if (typeof window !== "undefined") {
          if (value) {
            document.documentElement.classList.add("reduce-motion");
          } else {
            document.documentElement.classList.remove("reduce-motion");
          }
        }
      },

      fontSize: "normal",
      setFontSize: (size) => {
        set({ fontSize: size });
        if (typeof window !== "undefined") {
          document.documentElement.classList.remove("font-normal", "font-large", "font-x-large");
          document.documentElement.classList.add(`font-${size}`);
        }
      },

      highContrast: false,
      setHighContrast: (value) => {
        set({ highContrast: value });
        if (typeof window !== "undefined") {
          if (value) {
            document.documentElement.classList.add("high-contrast");
          } else {
            document.documentElement.classList.remove("high-contrast");
          }
        }
      },

      // Utility
      getTranslations: () => getTranslations(get().language),
    }),
    {
      name: "taskforce-preferences",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        reducedMotion: state.reducedMotion,
        fontSize: state.fontSize,
        highContrast: state.highContrast,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Apply saved preferences on load
          if (typeof window !== "undefined") {
            document.documentElement.classList.add(state.theme);
            if (state.reducedMotion) {
              document.documentElement.classList.add("reduce-motion");
            }
            if (state.fontSize !== "normal") {
              document.documentElement.classList.add(`font-${state.fontSize}`);
            }
            if (state.highContrast) {
              document.documentElement.classList.add("high-contrast");
            }
          }
          // Set translations based on saved language
          state.t = getTranslations(state.language);
        }
      },
    }
  )
);

// Initialize theme on first load
if (typeof window !== "undefined") {
  const checkSystemTheme = () => {
    const stored = localStorage.getItem("taskforce-preferences");
    if (!stored) {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initialTheme = prefersDark ? "dark" : "light";
      document.documentElement.classList.add(initialTheme);
      usePreferencesStore.setState({ theme: initialTheme });
    }
  };
  
  checkSystemTheme();
}
