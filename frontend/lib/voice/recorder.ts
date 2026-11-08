import { audioLevel, concatSamples, resample } from "./audio"
import { VoiceStartError, type VoiceNotice } from "./session"

// ---------------------------------------------------------------------------
// Le micro de l'app desktop : le son arrive par morceaux, dans un AudioWorklet qui tourne hors du fil de l'interface, et
// reste en mémoire jusqu'au second clic. Rien n'est écrit sur le disque, et le micro se referme dès la fin de l'écoute.
// ---------------------------------------------------------------------------

/** Fichier du worklet, servi par l'interface : la politique de contenu n'admet que les scripts de l'app. */
const WORKLET = "/voice-capture-worklet.js"

export interface Recorder {
  /** Referme le micro et rend les échantillons, à 16 kHz. */
  stop(): Promise<Float32Array>
  /** Referme le micro et oublie le son. */
  cancel(): void
}

/** La raison, en mots de l'interface, pour laquelle le navigateur a refusé le micro. */
function noticeOf(error: unknown): VoiceNotice {
  const name = (error as { name?: string } | null)?.name
  if (name === "NotAllowedError" || name === "SecurityError") return "denied"
  if (name === "NotFoundError" || name === "OverconstrainedError") return "noDevice"
  if (name === "NotReadableError" || name === "AbortError") return "busy"
  return "engine"
}

export async function openRecorder(onLevel: (level: number) => void): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia) throw new VoiceStartError("noDevice")
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch (error) {
    throw new VoiceStartError(noticeOf(error))
  }

  const closeStream = () => stream.getTracks().forEach((track) => track.stop())
  let context: AudioContext | null = null
  try {
    context = new AudioContext()
    await context.audioWorklet.addModule(WORKLET)
    await context.resume()
    const source = context.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(context, "voice-capture", { numberOfInputs: 1, numberOfOutputs: 0 })
    const chunks: Float32Array[] = []
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      chunks.push(event.data)
      onLevel(audioLevel(event.data))
    }
    source.connect(node)
    const audio = context
    const release = () => {
      node.port.onmessage = null
      source.disconnect()
      closeStream()
      void audio.close()
    }
    return {
      stop: async () => {
        const rate = audio.sampleRate
        release()
        return resample(concatSamples(chunks), rate)
      },
      cancel: release,
    }
  } catch {
    closeStream()
    void context?.close()
    throw new VoiceStartError("engine")
  }
}
