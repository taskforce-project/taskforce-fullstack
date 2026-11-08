"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react"

import { useUserStore } from "@/lib/store/user-store"
import { useVoiceStore, voiceKind, type VoiceKind, type VoicePhase } from "@/lib/store/voice-store"

const NEVER_CHANGES = () => () => undefined
const NO_VOICE_ON_SERVER = (): VoiceKind => null

/**
 * Le micro du compositeur, branché sur la fenêtre (R132) : le geste, Échap qui annule tant que l'écoute n'est pas finie,
 * et le micro refermé quand le compositeur s'en va. `kind` reste nul au rendu serveur : le micro n'apparaît qu'une fois la
 * page dans le navigateur, où l'on sait ce qui existe.
 */
export function useVoiceInput(onText: (text: string) => void): { kind: VoiceKind; phase: VoicePhase; press: () => void } {
  const kind = useSyncExternalStore(NEVER_CHANGES, voiceKind, NO_VOICE_ON_SERVER)
  const phase = useVoiceStore((s) => s.phase)
  const me = useUserStore((s) => s.user?.id)
  const person = me === null || me === undefined ? null : String(me)

  // Le dernier `onText` : la transcription peut finir après plusieurs rendus du compositeur.
  const latest = useRef(onText)
  useLayoutEffect(() => {
    latest.current = onText
  })

  const press = useCallback(() => {
    void useVoiceStore.getState().press(person, (text) => latest.current(text))
  }, [person])

  const active = phase === "starting" || phase === "listening" || phase === "transcribing"
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      // Échap annule l'écoute, et rien d'autre : ni la liste, ni la conversation.
      event.preventDefault()
      event.stopPropagation()
      useVoiceStore.getState().cancel()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [active])

  useEffect(() => () => useVoiceStore.getState().cancel(), [])

  return { kind, phase, press }
}
