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
  t: typeof CONSTANTS_EN | typeof CONSTANTS_FR; // Translations object (FR/EN — formes structurellement identiques)

  // Accessibility
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  
  fontSize: "normal" | "large" | "x-large";
  setFontSize: (size: "normal" | "large" | "x-large") => void;

  highContrast: boolean;
  setHighContrast: (value: boolean) => void;

  // Confort de lecture (dyslexie) — police lisible + espacements accrus.
  dyslexiaFont: boolean;
  setDyslexiaFont: (value: boolean) => void;

  // Mode daltonien (option, en plus du contraste élevé) — filtre de correction appliqué au contenu.
  colorblindMode: "none" | "protanopia" | "deuteranopia" | "tritanopia";
  setColorblindMode: (mode: "none" | "protanopia" | "deuteranopia" | "tritanopia") => void;

  // Utility function to get translations
  getTranslations: () => typeof CONSTANTS_EN | typeof CONSTANTS_FR;
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
      language: "en",
      setLanguage: (language) => {
        set({ 
          language,
          t: getTranslations(language),
        });
      },
      t: CONSTANTS_EN, // Default to English

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

      dyslexiaFont: false,
      setDyslexiaFont: (value) => {
        set({ dyslexiaFont: value });
        if (typeof window !== "undefined") {
          document.documentElement.classList.toggle("a11y-dyslexia", value);
        }
      },

      colorblindMode: "none",
      setColorblindMode: (mode) => {
        set({ colorblindMode: mode });
        if (typeof window !== "undefined") {
          const el = document.documentElement;
          el.classList.remove("cb-protanopia", "cb-deuteranopia", "cb-tritanopia");
          if (mode !== "none") el.classList.add(`cb-${mode}`);
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
        dyslexiaFont: state.dyslexiaFont,
        colorblindMode: state.colorblindMode,
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
            if (state.dyslexiaFont) {
              document.documentElement.classList.add("a11y-dyslexia");
            }
            if (state.colorblindMode && state.colorblindMode !== "none") {
              document.documentElement.classList.add(`cb-${state.colorblindMode}`);
            }
          }
          // App verrouillée en anglais (v1 = produit monolingue). On IGNORE délibérément la langue
          // persistée : un navigateur ayant stocké "fr" via l'ancien sélecteur (retiré) afficherait
          // sinon une UI à moitié traduite — auth + footer en français, le reste en anglais. Les
          // constantes FR restent dans l'arbre pour une future passe i18n.
          state.language = "en";
          state.t = CONSTANTS_EN;
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
