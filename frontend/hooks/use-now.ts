import { useEffect, useState } from "react"

/** L'heure, relue toutes les `intervalMs` : de quoi faire avancer une durée affichée (une mission au travail). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
