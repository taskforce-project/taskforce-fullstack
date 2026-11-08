// ---------------------------------------------------------------------------
// Le son du micro, en calcul pur : mettre bout à bout les morceaux reçus, ramener au taux que le modèle attend, dire à
// quel niveau le son arrive et s'il y a eu quelque chose à entendre.
// ---------------------------------------------------------------------------

/** Le taux des échantillons que le modèle de transcription attend (desktop/src/voice-worker.ts). */
export const TARGET_RATE = 16_000

/** Demi-largeur du filtre, en passages par zéro, et finesse de sa table. */
const ZERO_CROSSINGS = 8
const TABLE_RESOLUTION = 512

/** Le filtre passe-bas : sinus cardinal fenêtré (Hann), de 0 au bord, lu dans une table pour rester rapide. */
const KERNEL = (() => {
  const size = ZERO_CROSSINGS * TABLE_RESOLUTION + 1
  const table = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const x = i / TABLE_RESOLUTION
    const sinc = i === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
    table[i] = sinc * 0.5 * (1 + Math.cos((Math.PI * x) / ZERO_CROSSINGS))
  }
  return table
})()

/** Met bout à bout les morceaux du micro. */
export function concatSamples(chunks: readonly Float32Array[]): Float32Array {
  const output = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

/**
 * Change le taux d'échantillonnage, avec un filtre qui retire d'abord ce que le taux d'arrivée ne peut plus porter : une
 * simple interpolation replierait les aigus dans la voix et coûterait des mots au modèle.
 */
export function resample(input: Float32Array, from: number, to: number = TARGET_RATE): Float32Array {
  if (from === to || input.length === 0) return input
  const ratio = from / to
  const output = new Float32Array(Math.floor(input.length / ratio))
  const cutoff = Math.min(1, to / from)
  const halfWidth = ZERO_CROSSINGS / cutoff
  for (let i = 0; i < output.length; i++) {
    const center = i * ratio
    const start = Math.max(0, Math.ceil(center - halfWidth))
    const end = Math.min(input.length - 1, Math.floor(center + halfWidth))
    let sum = 0
    let weight = 0
    for (let j = start; j <= end; j++) {
      const w = KERNEL[Math.round(Math.abs(j - center) * cutoff * TABLE_RESOLUTION)] ?? 0
      sum += (input[j] ?? 0) * w
      weight += w
    }
    output[i] = weight === 0 ? 0 : sum / weight
  }
  return output
}

/** Niveau du son, de 0 à 1 : l'échelle est en décibels, de -60 dB (rien) à -12 dB (une voix proche). */
export function audioLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const sample of samples) sum += sample * sample
  const rms = Math.sqrt(sum / samples.length)
  if (rms <= 0) return 0
  const decibels = 20 * Math.log10(rms)
  return Math.max(0, Math.min(1, (decibels + 60) / 48))
}

/** Sous ce niveau (-50 dB environ), la plus forte fenêtre ne porte aucune voix. */
const SILENCE_RMS = 0.003
const WINDOW = 480

/** Vrai si rien, dans l'enregistrement, ne ressemble à du son : inutile de réveiller le modèle. */
export function isSilent(samples: Float32Array): boolean {
  for (let start = 0; start < samples.length; start += WINDOW) {
    const end = Math.min(samples.length, start + WINDOW)
    let sum = 0
    for (let i = start; i < end; i++) sum += (samples[i] ?? 0) * (samples[i] ?? 0)
    if (Math.sqrt(sum / (end - start)) >= SILENCE_RMS) return false
  }
  return true
}
