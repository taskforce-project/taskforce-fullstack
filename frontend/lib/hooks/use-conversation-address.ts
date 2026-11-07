"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { useCortexStore } from "@/lib/store/cortex-store"
import { conversationOf, hrefWith } from "@/lib/window/address"

/**
 * La conversation a son adresse (R120 : chaque état de la fenêtre a la sienne) : `?c=<id>` ouvre cette conversation dans
 * la fenêtre, avec le volet que dit le chemin. Les deux se suivent :
 * - l'adresse change (un lien, le bouton retour ou avant) : elle ouvre sa conversation ; une entrée de l'historique sans
 *   `c` est une conversation neuve, mais un lien sans `c` garde celle de la fenêtre, et l'adresse la reprend ;
 * - la conversation change dans la fenêtre : l'adresse la suit. Une conversation neuve prend son id à sa première
 *   réponse, à la même entrée de l'historique ; en choisir une autre, ou en commencer une, en ajoute une.
 */
export function useConversationAddress(slug: string): void {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const c = search?.get("c") ?? null
  const conversationId = useCortexStore((s) => s.conversationId)
  const openConversation = useCortexStore((s) => s.openConversation)
  const newConversation = useCortexStore((s) => s.newConversation)
  // Le bouton retour (ou avant) vient de changer l'adresse : elle dit alors aussi l'absence de conversation.
  const popped = useRef(false)
  const last = useRef<{ c: string | null; id: number | null } | null>(null)

  useEffect(() => {
    const onPop = () => { popped.current = true }
    globalThis.addEventListener("popstate", onPop)
    return () => globalThis.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    if (!slug) return
    const previous = last.current
    last.current = { c, id: conversationId }
    const fromHistory = popped.current
    popped.current = false
    const wanted = conversationOf(search)
    const address = (id: number | null) => hrefWith(pathname ?? "", search, { c: id === null ? null : String(id) })

    if (previous === null || previous.c !== c) {
      if (wanted !== null) {
        if (wanted === conversationId) return
        void openConversation(slug, wanted).then((ok) => {
          // Une conversation supprimée, ou d'un autre compte : l'adresse reprend celle de la fenêtre.
          if (!ok) router.replace(address(useCortexStore.getState().conversationId), { scroll: false })
        })
      } else if (fromHistory) {
        if (conversationId !== null) newConversation()
      } else if (conversationId !== null) {
        router.replace(address(conversationId), { scroll: false })
      }
      return
    }
    if (previous.id === conversationId || conversationId === wanted) return
    // La première réponse donne son id à la conversation : la même entrée de l'historique. Le reste en ajoute une.
    if (previous.id === null) router.replace(address(conversationId), { scroll: false })
    else router.push(address(conversationId), { scroll: false })
  }, [slug, c, conversationId, pathname, search, router, openConversation, newConversation])
}
