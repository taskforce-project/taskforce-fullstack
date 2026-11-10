"use client"

import { X } from "lucide-react"

import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useUserStore } from "@/lib/store/user-store"
import { useVoiceStore } from "@/lib/store/voice-store"

const ACTION = "shrink-0 font-medium text-foreground underline-offset-2 transition-colors duration-150 hover:underline motion-reduce:transition-none"

/**
 * La ligne de la voix, dans le compositeur, seulement après un geste (R129) : la phrase de R80 avant le premier usage dans
 * la webapp, ou ce qui n'a pas marché, en une phrase courte. Le compositeur continue de marcher, quoi qu'elle dise. La
 * préparation du modèle, dans l'app desktop, se lit sur l'icône du micro (R143) : il n'y a rien à valider.
 */
export function VoiceLine() {
  const t = usePreferencesStore((s) => s.t.voice)
  const phase = useVoiceStore((s) => s.phase)
  const notice = useVoiceStore((s) => s.notice)
  const acceptConsent = useVoiceStore((s) => s.acceptConsent)
  const dismiss = useVoiceStore((s) => s.dismiss)
  const dismissNotice = useVoiceStore((s) => s.dismissNotice)
  const me = useUserStore((s) => s.user?.id)
  const person = me === null || me === undefined ? null : String(me)

  const line = "flex min-h-7 items-center gap-3 px-3.5 pt-2 text-xs text-muted-foreground"

  if (phase === "consent") {
    return (
      <div role="status" className={line}>
        <span className="min-w-0 flex-1">{t.consent}</span>
        <button type="button" className={ACTION} onClick={() => void acceptConsent(person)}>{t.turnOn}</button>
        <button type="button" className={ACTION} onClick={dismiss}>{t.keepTyping}</button>
      </div>
    )
  }

  if (!notice) return null
  return (
    <div role="status" className={line}>
      <span className="min-w-0 flex-1 truncate">{t.notices[notice]}</span>
      <button
        type="button"
        onClick={dismissNotice}
        aria-label={t.dismiss}
        title={t.dismiss}
        className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
