"use client"

import { useReducedMotion } from "framer-motion"
import { Loader2, Mic, Square } from "lucide-react"

import { fillText } from "@/lib/delivery/result-card"
import { useVoiceInput } from "@/lib/hooks/use-voice-input"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useVoiceStore } from "@/lib/store/voice-store"

/** Au-dessus de ce niveau, du son arrive : c'est tout ce que montre la barre quand le système demande moins de mouvement. */
const SOUND_THRESHOLD = 0.15

/** L'anneau autour du micro : le modèle se prépare, et où il en est. */
function PreparingRing({ percent }: Readonly<{ percent: number }>) {
  const circumference = 2 * Math.PI * 14
  return (
    <svg className="absolute inset-0 size-8 -rotate-90" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" strokeWidth="2" className="stroke-muted" />
      <circle
        cx="16"
        cy="16"
        r="14"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent / 100)}
        className="stroke-primary transition-[stroke-dashoffset] duration-150 ease-out motion-reduce:transition-none"
      />
    </svg>
  )
}

/** La petite barre : le son arrive. Elle seule suit le niveau, le compositeur ne se redessine pas à chaque morceau de son. */
function VoiceLevel() {
  const level = useVoiceStore((s) => s.level)
  const reduceMotion = useReducedMotion()
  const scale = reduceMotion ? (level > SOUND_THRESHOLD ? 1 : 0) : level
  return (
    <span className="h-1 w-8 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <span
        className="block h-full origin-left rounded-full bg-primary transition-transform duration-75 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${scale})` }}
      />
    </span>
  )
}

/**
 * Le micro du compositeur (R132) : une icône de 16 px, à gauche de l'envoi. Un clic démarre, un clic arrête ; pendant
 * l'écoute, elle devient un carré d'arrêt et la petite barre dit que le son arrive. Rien ne s'envoie d'ici : le texte
 * s'écrit dans le compositeur (`onText`). Là où aucune voix n'existe, il n'y a pas de micro du tout. Pendant que le modèle
 * se prépare (R143), un clic fait paraître son avancement autour de l'icône, sans rien à valider.
 */
export function VoiceButton({ onText }: Readonly<{ onText: (text: string) => void }>) {
  const t = usePreferencesStore((s) => s.t.voice)
  const { kind, phase, press } = useVoiceInput(onText)
  const model = useVoiceStore((s) => s.model)
  if (kind === null) return null

  const listening = phase === "listening"
  const working = phase === "starting" || phase === "transcribing"
  const preparing = phase === "downloading"
  const percent = model && model.bytes > 0 ? Math.min(100, Math.floor((model.received / model.bytes) * 100)) : 0
  const preparingLabel = fillText(t.preparing, { percent: String(percent) })
  const label = preparing ? preparingLabel : listening ? t.stop : working ? t.writing : t.start
  const title = preparing ? preparingLabel : listening ? t.stop : working ? t.writing : kind === "local" ? t.onDevice : t.inBrowser

  return (
    <>
      {listening && <VoiceLevel />}
      <button
        type="button"
        onClick={press}
        aria-label={label}
        aria-pressed={listening}
        title={title}
        className={`relative flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 motion-reduce:transition-none ${
          listening ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {preparing && <PreparingRing percent={percent} />}
        {working ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        ) : listening ? (
          <Square className="size-4 fill-current" />
        ) : (
          <Mic className="size-4" />
        )}
      </button>
    </>
  )
}
