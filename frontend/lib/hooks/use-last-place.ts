"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { useUserStore } from "@/lib/store/user-store"
import { placeKey, useWindowStore } from "@/lib/store/window-store"
import { addressOf, placeOf, placeToRestore } from "@/lib/window/last-place"
import { homePath } from "@/lib/window/pane"

/**
 * La fenêtre s'ouvre là où la personne l'a laissée (R123, séance n°18) : au démarrage, sur l'accueil nu de l'espace, la
 * dernière conversation et son volet, pour cette personne et cet espace ; ensuite, chaque adresse de la fenêtre se
 * retient, comme la pleine largeur (`useWindowStore`, `persist`). Un lien qui ouvre la fenêtre ailleurs (une issue, un
 * écran) l'emporte : seul l'accueil nu se rouvre sur l'endroit retenu.
 */
export function useLastPlace(slug: string): void {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const me = useUserStore((s) => s.user?.id)
  const rememberPlace = useWindowStore((s) => s.rememberPlace)
  const person = me === null || me === undefined ? null : String(me)
  // L'espace dont le démarrage est fait, et l'endroit vers lequel il vient de partir, pas encore atteint.
  const started = useRef<string | null>(null)
  const restoring = useRef<string | null>(null)
  const query = search?.toString() ?? ""

  useEffect(() => {
    if (!slug || person === null || started.current === slug) return
    started.current = slug
    const place = placeToRestore(pathname, query, slug, useWindowStore.getState().places[placeKey(person, slug)])
    if (place === null) return
    restoring.current = place
    router.replace(place, { scroll: false })
  }, [slug, person, pathname, query, router])

  useEffect(() => {
    if (!slug || person === null || started.current !== slug) return
    const here = placeOf(pathname, query, slug)
    // L'accueil nu, le temps que l'endroit retenu s'ouvre : il ne remplace pas ce qui va se rouvrir.
    if (restoring.current !== null && addressOf(pathname ?? "", query) !== restoring.current && here === homePath(slug)) return
    restoring.current = null
    if (here !== null) rememberPlace(person, slug, here)
  }, [slug, person, pathname, query, rememberPlace])
}
