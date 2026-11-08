"use client"

import { X } from "lucide-react"

import { fillText } from "@/lib/delivery/result-card"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useUserStore } from "@/lib/store/user-store"
import { useVoiceStore } from "@/lib/store/voice-store"

const ACTION = "shrink-0 font-medium text-foreground underline-offset-2 transition-colors duration-150 hover:underline motion-reduce:transition-none"

/**
 * La ligne de la voix, dans le compositeur, seulement après un geste (R129) : la phrase de R80 avant le premier usage dans
 * la webapp, la taille du modèle puis son avancement dans l'app desktop, ou ce qui n'a pas marché, en une phrase courte.
 * Le compositeur continue de marcher, quoi qu'elle dise.
 */
export function VoiceLine() {
  const t = usePreferencesStore((s) => s.t.voice)
  const phase = useVoiceStore((s) => s.phase)
  const notice = useVoiceStore((s) => s.notice)
  const model = useVoiceStore((s) => s.model)
  const acceptConsent = useVoiceStore((s) => s.acceptConsent)
  const startDownload = useVoiceStore((s) => s.startDownload)
  const cancelDownload = useVoiceStore((s) => s.cancelDownload)
  const dismiss = useVoiceStore((s) => s.dismiss)
  const dismissNotice = useVoiceStore((s) => s.dismissNotice)
  const me = useUserStore((s) => s.user?.id)
  const person = me === null || me === undefined ? null : String(me)

  const line = "flex min-h-6 items-center gap-3 px-3.5 pt-2 text-xs text-muted-foreground"

  if (phase === "consent") {
    return (
      <div role="status" className={line}>
        <span className="min-w-0 flex-1">{t.consent}</span>
        <button type="button" className={ACTION} onClick={() => void acceptConsent(person)}>{t.turnOn}</button>
        <button type="button" className={ACTION} onClick={dismiss}>{t.keepTyping}</button>
      </div>
    )
  }

  if (phase === "offer" && model) {
    return (
      <div role="status" className={line}>
        <span className="min-w-0 flex-1 truncate">
          {notice ? t.notices[notice] : fillText(t.offer, { size: String(Math.round(model.bytes / 1_000_000)) })}
        </span>
        <button type="button" className={ACTION} onClick={() => void startDownload()}>{notice ? t.retry : t.download}</button>
        <button type="button" className={ACTION} onClick={dismiss}>{t.notNow}</button>
      </div>
    )
  }

  if (phase === "downloading") {
    const percent = model && model.bytes > 0 ? Math.min(100, Math.floor((model.received / model.bytes) * 100)) : 0
    return (
      <div role="status" className={line}>
        <span className="shrink-0 tabular-nums">{fillText(t.downloading, { percent: String(percent) })}</span>
        <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span
            className="block h-full origin-left rounded-full bg-primary transition-transform duration-150 motion-reduce:transition-none"
            style={{ transform: `scaleX(${percent / 100})` }}
          />
        </span>
        <button type="button" className={ACTION} onClick={cancelDownload}>{t.cancel}</button>
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
