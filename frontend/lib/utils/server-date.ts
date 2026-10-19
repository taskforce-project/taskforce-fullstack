/**
 * Date-heure renvoyée par l'API. Le backend tourne en UTC et sérialise ses `LocalDateTime` sans fuseau
 * (« 2026-10-18T21:41:00 ») : `new Date()` les lirait en heure locale, avec une à deux heures d'écart en France.
 * Une valeur qui porte déjà son fuseau (`Z`, `+02:00`) est lue telle quelle.
 */
export function parseServerDate(value: string): Date {
  return new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`)
}
