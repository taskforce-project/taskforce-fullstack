import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { desktopBridge, IS_DESKTOP, type DesktopVoiceError } from "../desktop"
import { isSilent } from "../voice/audio"
import { browserSpeechSupported, openBrowserSpeech } from "../voice/browser-speech"
import { openRecorder } from "../voice/recorder"
import { VoiceStartError, type VoiceCallbacks, type VoiceNotice, type VoiceOutcome, type VoiceSession } from "../voice/session"

// ---------------------------------------------------------------------------
// Le micro du compositeur (R132, R76, R80) : un clic démarre, un clic arrête, Échap annule ; le texte s'écrit dans le
// compositeur et rien ne part sans Entrée ou le bouton d'envoi. Dans l'app desktop, la transcription tourne sur la machine
// (`desktop/src/voice.ts`), le modèle se téléchargeant une fois ; dans la webapp, le service du navigateur, après la phrase
// de R80, retenue par personne. Erreurs avalées : une ligne courte le dit (`notice`), le compositeur continue.
// ---------------------------------------------------------------------------

/** Où passe la voix : sur la machine, par le navigateur, ou nulle part (aucun micro n'apparaît). */
export type VoiceKind = "local" | "browser" | null

export function voiceKind(): VoiceKind {
  if (desktopBridge()?.voice) return "local"
  return !IS_DESKTOP && browserSpeechSupported() ? "browser" : null
}

export type VoicePhase =
  /** Rien en cours. */
  | "idle"
  /** Webapp, premier usage : la phrase de R80 attend une réponse. */
  | "consent"
  /** App desktop : le modèle manque, sa taille est dite. */
  | "offer"
  | "downloading"
  | "starting"
  | "listening"
  | "transcribing"

/** Une écoute ne dure jamais plus longtemps : un micro oublié se referme seul (R80). */
export const MAX_LISTEN_MS = 120_000

/** Ce qui n'est qu'une information s'efface de soi-même. */
const PASSING_NOTICE_MS = 4_000
const PASSING: readonly VoiceNotice[] = ["nothing", "limit", "ready"]

interface VoiceState {
  phase: VoicePhase
  /** Niveau du son pendant l'écoute, de 0 à 1. */
  level: number
  notice: VoiceNotice | null
  /** Taille du modèle et ce qui en est déjà là (app desktop). */
  model: { bytes: number; received: number } | null
  /** Les personnes qui ont accepté la phrase de R80, par identifiant. */
  consents: Record<string, true>

  /** Le geste sur le micro : démarre, arrête, ou referme la question ouverte. */
  press: (person: string | null, onText: (text: string) => void) => Promise<void>
  /** Webapp : la personne active la voix ; l'écoute démarre, le choix est retenu pour elle. */
  acceptConsent: (person: string | null) => Promise<void>
  /** Télécharge le modèle, ou rejoint le téléchargement en cours. Rend vrai s'il est là. */
  startDownload: () => Promise<boolean>
  cancelDownload: () => void
  /** Referme la question posée (« Keep typing », « Not now »). */
  dismiss: () => void
  dismissNotice: () => void
  /** Échap : arrête d'écouter et jette ce qui a été dit. */
  cancel: () => void
}

let session: VoiceSession | null = null
let sink: ((text: string) => void) | null = null
let limitTimer: ReturnType<typeof setTimeout> | null = null
let noticeTimer: ReturnType<typeof setTimeout> | null = null
/** Change à chaque annulation : une réponse d'une écoute annulée n'écrit plus rien. */
let generation = 0

const clearLimit = () => {
  if (limitTimer) clearTimeout(limitTimer)
  limitTimer = null
}

function downloadNotice(error: DesktopVoiceError): VoiceNotice {
  return error === "checksum" || error === "disk" ? error : "network"
}

/** L'écoute de l'app desktop : le micro, puis le moteur local au second clic. */
async function openLocalSession(callbacks: VoiceCallbacks): Promise<VoiceSession> {
  const bridge = desktopBridge()?.voice
  if (!bridge) throw new VoiceStartError("engine")
  const recorder = await openRecorder(callbacks.onLevel)
  // Le modèle se charge pendant que la personne parle : il est prêt au second clic.
  bridge.prepare()
  return {
    finish: async (): Promise<VoiceOutcome> => {
      const samples = await recorder.stop()
      if (isSilent(samples)) return { notice: "nothing" }
      try {
        const result = await bridge.transcribe(samples)
        if (!result.ok) return { notice: result.error === "model" ? "model" : "engine" }
        return result.value.trim() ? { text: result.value } : { notice: "nothing" }
      } catch {
        return { notice: "engine" }
      }
    },
    cancel: () => recorder.cancel(),
  }
}

export const useVoiceStore = create<VoiceState>()(
  persist(
    (set, get) => {
      const say = (notice: VoiceNotice | null) => {
        if (noticeTimer) clearTimeout(noticeTimer)
        noticeTimer = null
        set({ notice })
        if (notice && PASSING.includes(notice)) {
          noticeTimer = setTimeout(() => set({ notice: null }), PASSING_NOTICE_MS)
        }
      }

      const deliver = (outcome: VoiceOutcome, ended?: VoiceNotice) => {
        set({ phase: "idle", level: 0 })
        if ("notice" in outcome) {
          say(outcome.notice)
          return
        }
        sink?.(outcome.text)
        say(ended ?? null)
      }

      /** Arrête d'écouter ; `ended` : une raison à dire, le temps écoulé par exemple. */
      const finish = async (ended?: VoiceNotice) => {
        clearLimit()
        const current = session
        session = null
        if (!current) return
        const mine = generation
        set({ phase: "transcribing", level: 0 })
        const outcome = await current.finish().catch((): VoiceOutcome => ({ notice: "engine" }))
        if (mine === generation) deliver(outcome, ended)
      }

      const listen = async () => {
        const mine = ++generation
        set({ phase: "starting", level: 0 })
        say(null)
        const callbacks: VoiceCallbacks = {
          onLevel: (level) => {
            if (get().phase === "listening") set({ level })
          },
          onClosed: (outcome) => {
            if (mine !== generation) return
            clearLimit()
            session = null
            deliver(outcome)
          },
        }
        try {
          const opened = voiceKind() === "local" ? await openLocalSession(callbacks) : await openBrowserSpeech(callbacks)
          // Échap, ou le compositeur parti, pendant que le micro s'ouvrait.
          if (mine !== generation) {
            opened.cancel()
            return
          }
          session = opened
          set({ phase: "listening" })
          limitTimer = setTimeout(() => void finish("limit"), MAX_LISTEN_MS)
        } catch (error) {
          if (mine !== generation) return
          set({ phase: "idle", level: 0 })
          say(error instanceof VoiceStartError ? error.notice : "engine")
        }
      }

      return {
        phase: "idle",
        level: 0,
        notice: null,
        model: null,
        consents: {},

        press: async (person, onText) => {
          const { phase } = get()
          if (phase === "listening") return finish()
          if (phase === "starting" || phase === "transcribing" || phase === "downloading") return
          if (phase === "consent" || phase === "offer") return get().dismiss()
          sink = onText
          say(null)
          const kind = voiceKind()
          if (kind === null) return
          if (kind === "browser") {
            if (person !== null && get().consents[person]) return listen()
            set({ phase: "consent" })
            return
          }
          const bridge = desktopBridge()?.voice
          try {
            const status = await bridge?.status()
            if (status?.state === "ready") return listen()
            if (status?.state === "downloading") {
              await get().startDownload()
              return
            }
            if (status) set({ phase: "offer", model: { bytes: status.bytes, received: status.received } })
          } catch {
            say("engine")
          }
        },

        acceptConsent: async (person) => {
          if (person !== null) set((state) => ({ consents: { ...state.consents, [person]: true } }))
          await listen()
        },

        startDownload: async () => {
          const bridge = desktopBridge()?.voice
          if (!bridge) return false
          set({ phase: "downloading" })
          say(null)
          const stop = bridge.onStatus((status) => {
            if (status.state === "downloading") set({ model: { bytes: status.bytes, received: status.received } })
          })
          try {
            const result = await bridge.download()
            if (result.ok) {
              set({ phase: "idle", model: null })
              say("ready")
              return true
            }
            if (result.error === "cancelled") {
              set({ phase: "idle", model: null })
              return false
            }
            set({ phase: "offer" })
            say(downloadNotice(result.error))
            return false
          } catch {
            set({ phase: "offer" })
            say("network")
            return false
          } finally {
            stop()
          }
        },

        cancelDownload: () => {
          void desktopBridge()?.voice?.cancelDownload()
        },

        dismiss: () => {
          set({ phase: "idle", notice: null })
        },

        dismissNotice: () => say(null),

        cancel: () => {
          generation++
          clearLimit()
          session?.cancel()
          session = null
          const { phase } = get()
          if (phase === "starting" || phase === "listening" || phase === "transcribing") set({ phase: "idle", level: 0 })
        },
      }
    },
    {
      name: "taskforce-voice",
      storage: createJSONStorage(() => localStorage),
      // La mémoire de la phrase de R80 seulement : l'état du micro ne survit jamais à la fenêtre.
      partialize: (state) => ({ consents: state.consents }),
    },
  ),
)
