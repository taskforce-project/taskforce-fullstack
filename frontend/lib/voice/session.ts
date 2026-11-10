// ---------------------------------------------------------------------------
// Ce que le micro du compositeur (R132) attend d'un moteur de voix, qu'il transcrive sur la machine (app desktop) ou
// passe par le service du navigateur (webapp, R80).
// ---------------------------------------------------------------------------

/** Ce qu'une ligne sous le compositeur peut dire : une phrase courte par cas (`t.voice.notices`). */
export type VoiceNotice =
  | "denied"
  | "noDevice"
  | "busy"
  | "model"
  | "engine"
  | "service"
  | "network"
  | "checksum"
  | "disk"
  | "nothing"
  | "limit"
  | "ready"

/** Ce que rend une écoute : le texte dit, ou la raison de son absence. */
export type VoiceOutcome = { text: string } | { notice: VoiceNotice }

/** Une écoute en cours. */
export interface VoiceSession {
  /** Arrête d'écouter et rend le texte. */
  finish(): Promise<VoiceOutcome>
  /** Arrête d'écouter et jette ce qui a été dit. */
  cancel(): void
}

export interface VoiceCallbacks {
  /** Le niveau du son, de 0 à 1. */
  onLevel(level: number): void
  /** Le moteur s'est arrêté seul (le service du navigateur coupe après un silence). */
  onClosed(outcome: VoiceOutcome): void
}

/** Le micro n'a pas pu s'ouvrir : la raison à dire. */
export class VoiceStartError extends Error {
  constructor(readonly notice: VoiceNotice) {
    super(notice)
    this.name = "VoiceStartError"
  }
}
