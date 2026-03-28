"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { CONSTANTS_EN } from "@/lib/constants_en"
import { CONSTANTS_FR } from "@/lib/constants_fr"
import type { TranslationKeys } from "@/lib/constants_en"

export type Locale = "en" | "fr"

const LOCALE_STORAGE_KEY = "tf-locale"
const SUPPORTED_LOCALES = new Set<Locale>(["en", "fr"])

const translations: Record<Locale, TranslationKeys> = {
  en: CONSTANTS_EN,
  fr: CONSTANTS_FR,
}

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const result = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
  return typeof result === "string" ? result : path
}

interface I18nContextType {
  readonly locale: Locale
  readonly setLocale: (locale: Locale) => void
  readonly t: (path: string) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

export function I18nProvider({ children }: { readonly children: React.ReactNode }) {
  // Lazy initializer reads from localStorage on the client without needing an effect
  const [locale, setLocale] = useState<Locale>(() => {
    if (globalThis.window === undefined) return "en"
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (saved && SUPPORTED_LOCALES.has(saved as Locale)) return saved as Locale
    return "en"
  })

  const updateLocale = useCallback((newLocale: Locale) => {
    setLocale(newLocale)
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale)
  }, [])

  const t = useCallback(
    (path: string): string =>
      getNestedValue(
        translations[locale] as unknown as Record<string, unknown>,
        path
      ),
    [locale]
  )

  const contextValue = useMemo(
    () => ({ locale, setLocale: updateLocale, t }),
    [locale, updateLocale, t]
  )

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider")
  }
  return context
}
