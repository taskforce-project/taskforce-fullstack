/**
 * Date-heure renvoyée par l'API. Le backend tourne en UTC et sérialise ses `LocalDateTime` sans fuseau
 * (« 2026-10-18T21:41:00 ») : `new Date()` les lirait en heure locale, avec une à deux heures d'écart en France.
 * Une valeur qui porte déjà son fuseau (`Z`, `+02:00`) est lue telle quelle.
 */
export function parseServerDate(value: string): Date {
  return new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`)
}

/** Un moment de l'API, dit depuis maintenant : « just now », « 5 min ago », « 3h ago », « Yesterday », « 9 days ago ». */
export function relativeTime(value: string): string {
  const seconds = Math.floor((Date.now() - parseServerDate(value).getTime()) / 1000)
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 172800) return "Yesterday"
  return `${Math.floor(seconds / 86400)} days ago`
}
