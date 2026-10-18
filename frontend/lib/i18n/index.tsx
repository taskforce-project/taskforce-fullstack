"use client"

import React, { createContext, useCallback, useContext, useMemo } from "react"
import { CONSTANTS_EN } from "@/lib/constants_en"

/**
 * Textes de l'interface. Le produit est monolingue (anglais) : un seul jeu de constantes. Le passage par
 * `t("clé")` reste, pour qu'une traduction puisse s'ajouter sans toucher aux composants.
 */
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
  readonly t: (path: string) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

export function I18nProvider({ children }: { readonly children: React.ReactNode }) {
  const t = useCallback(
    (path: string): string => getNestedValue(CONSTANTS_EN as unknown as Record<string, unknown>, path),
    []
  )

  const contextValue = useMemo(() => ({ t }), [t])

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
