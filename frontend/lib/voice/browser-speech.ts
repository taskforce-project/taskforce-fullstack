import { VoiceStartError, type VoiceCallbacks, type VoiceNotice, type VoiceOutcome, type VoiceSession } from "./session"

// ---------------------------------------------------------------------------
// La voix de la webapp (R80) : le service de reconnaissance du navigateur, là où il existe. Le navigateur envoie la voix
// à son service, TaskForce n'en reçoit que le texte, comme quand on tape : la phrase de R80 le dit avant le premier usage.
// ---------------------------------------------------------------------------

interface RecognitionAlternative {
  transcript: string
}

interface RecognitionResult {
  isFinal: boolean
  0: RecognitionAlternative
}

interface RecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}

interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onsoundstart: (() => void) | null
  onsoundend: (() => void) | null
  onresult: ((event: RecognitionResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionConstructor = new () => Recognition

function recognitionConstructor(): RecognitionConstructor | null {
  if (globalThis.window === undefined) return null
  const w = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Le navigateur a un service de reconnaissance ; sinon, aucun micro n'apparaît. */
export function browserSpeechSupported(): boolean {
  return recognitionConstructor() !== null
}

function noticeOf(code: string): VoiceNotice {
  if (code === "not-allowed" || code === "service-not-allowed") return "denied"
  if (code === "audio-capture") return "noDevice"
  if (code === "no-speech") return "nothing"
  return "service"
}

/** Le service ne donne pas le niveau du son : la petite barre dit seulement si du son arrive. */
const SOUND_LEVEL = 0.6

export function openBrowserSpeech(callbacks: VoiceCallbacks, lang: string = navigator.language): Promise<VoiceSession> {
  const Constructor = recognitionConstructor()
  if (!Constructor) return Promise.reject(new VoiceStartError("service"))
  const recognition = new Constructor()
  recognition.continuous = true
  recognition.interimResults = false
  recognition.lang = lang

  return new Promise<VoiceSession>((resolve, reject) => {
    const said: string[] = []
    let started = false
    let failure: VoiceNotice | null = null
    let finished: ((outcome: VoiceOutcome) => void) | null = null

    const session: VoiceSession = {
      finish: () =>
        new Promise<VoiceOutcome>((done) => {
          finished = done
          recognition.stop()
        }),
      cancel: () => {
        recognition.onend = null
        recognition.onresult = null
        recognition.onerror = null
        recognition.abort()
      },
    }

    recognition.onstart = () => {
      started = true
      resolve(session)
    }
    recognition.onsoundstart = () => callbacks.onLevel(SOUND_LEVEL)
    recognition.onsoundend = () => callbacks.onLevel(0)
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result?.isFinal) said.push(result[0].transcript.trim())
      }
    }
    recognition.onerror = (event) => {
      if (event.error === "aborted") return
      failure = noticeOf(event.error)
      if (!started) reject(new VoiceStartError(failure))
    }
    recognition.onend = () => {
      if (!started) {
        reject(new VoiceStartError(failure ?? "service"))
        return
      }
      const text = said.filter(Boolean).join(" ")
      const outcome: VoiceOutcome = text ? { text } : { notice: failure ?? "nothing" }
      if (finished) finished(outcome)
      else callbacks.onClosed(outcome)
    }

    try {
      recognition.start()
    } catch {
      reject(new VoiceStartError("service"))
    }
  })
}
