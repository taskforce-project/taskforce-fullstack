import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface AccessibilitySettings {
  fontSize: number; // 100 = default, range 80-150
  letterSpacing: number; // 0 = default, range -0.05 to 0.2
  dyslexicFont: boolean;
  highContrast: boolean;
  daltonismMode: "none" | "protanopia" | "deuteranopia" | "tritanopia";
}

interface AccessibilityContextType {
  settings: AccessibilitySettings;
  updateSettings: (settings: Partial<AccessibilitySettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: AccessibilitySettings = {
  fontSize: 100,
  letterSpacing: 0,
  dyslexicFont: false,
  highContrast: false,
  daltonismMode: "none",
};

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

const ACCESSIBILITY_STORAGE_KEY = "taskforce-accessibility";

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(defaultSettings);

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(ACCESSIBILITY_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as AccessibilitySettings;
        setSettings(parsed);
        applySettings(parsed);
      } catch (e) {
        console.error("Failed to parse accessibility settings:", e);
      }
    }
  }, []);

  const applySettings = (newSettings: AccessibilitySettings) => {
    const root = document.documentElement;

    // Apply font size
    root.style.setProperty("--a11y-font-scale", `${newSettings.fontSize / 100}`);

    // Apply letter spacing
    root.style.setProperty("--a11y-letter-spacing", `${newSettings.letterSpacing}em`);

    // Apply dyslexic font
    if (newSettings.dyslexicFont) {
      root.classList.add("dyslexic-font");
    } else {
      root.classList.remove("dyslexic-font");
    }

    // Apply high contrast
    if (newSettings.highContrast) {
      root.classList.add("high-contrast");
    } else {
      root.classList.remove("high-contrast");
    }

    // Apply daltonism filter
    root.setAttribute("data-daltonism", newSettings.daltonismMode);
  };

  const updateSettings = (partial: Partial<AccessibilitySettings>) => {
    const newSettings = { ...settings, ...partial };
    setSettings(newSettings);
    localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(newSettings));
    applySettings(newSettings);
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    localStorage.removeItem(ACCESSIBILITY_STORAGE_KEY);
    applySettings(defaultSettings);
  };

  return (
    <AccessibilityContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error("useAccessibility must be used within an AccessibilityProvider");
  }
  return context;
}
