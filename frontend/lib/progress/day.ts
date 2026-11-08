import { parseServerDate } from "@/lib/utils/server-date"

/**
 * Le jour d'une date de l'API, comme le volet « Progress » l'écrit (« 2 Nov »). Une date sans heure (`2026-11-02`, un
 * `LocalDate`) est un jour du calendrier : elle s'écrit telle quelle, quel que soit le fuseau. Une date-heure (un
 * `LocalDateTime` en UTC, sans fuseau) se lit avec `parseServerDate` et s'écrit à l'heure de la personne.
 */
export function dayOf(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
  }
  return parseServerDate(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

/** L'instant d'une date-heure de l'API, en millisecondes : l'axe du temps d'une courbe. */
export const timeOf = (value: string): number => parseServerDate(value).getTime()
