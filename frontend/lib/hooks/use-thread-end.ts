"use client"

import { useEffect } from "react"

/** La fin du fil est à l'écran, à ce nombre de pixels près. */
const AT_END_PX = 2

/**
 * Quand la boîte grandit (un message de vingt lignes, la file au-dessus d'elle), la conversation qui la surmonte rétrécit :
 * sa fin reste en vue si elle l'était (R134). Sans mouvement : le fil ne saute pas, sa dernière ligne ne passe pas sous la
 * boîte. Une conversation que la personne a remontée pour relire ne bouge pas.
 */
export function useThreadEnd(): void {
  useEffect(() => {
    const thread = document.querySelector<HTMLElement>(".cortex-thread")
    if (!thread) return
    const atEnd = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight <= AT_END_PX
    let wasAtEnd = atEnd()
    let height = thread.clientHeight
    const onScroll = () => {
      wasAtEnd = atEnd()
    }
    const watcher = new ResizeObserver(() => {
      if (thread.clientHeight < height && wasAtEnd) thread.scrollTop = thread.scrollHeight
      height = thread.clientHeight
    })
    thread.addEventListener("scroll", onScroll, { passive: true })
    watcher.observe(thread)
    return () => {
      watcher.disconnect()
      thread.removeEventListener("scroll", onScroll)
    }
  }, [])
}
