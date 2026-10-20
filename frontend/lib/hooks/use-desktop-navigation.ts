"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { desktopBridge } from "@/lib/desktop"

/**
 * App desktop : ouvre la page que la coque demande, après un clic sur une notification du système. Une page de l'app
 * seulement (un chemin qui commence par une seule barre oblique). Sans effet sur la webapp.
 */
export function useDesktopNavigation(): void {
  const router = useRouter()
  useEffect(() => {
    const stop = desktopBridge()?.onNavigate?.((path) => {
      if (path.startsWith("/") && !path.startsWith("//")) router.push(path)
    })
    return () => stop?.()
  }, [router])
}
