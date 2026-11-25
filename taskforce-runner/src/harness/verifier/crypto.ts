/**
 * Les empreintes et la signature dont le vérificateur a besoin, avec la seule Web Crypto : la même dans Node (20 et
 * plus) et dans un navigateur. Aucun module de Node dans ce dossier : il se partage avec l'app, qui vérifie un dossier
 * avec le même code que `npm run verify` (`npm run share:app`).
 */

/** Des octets dont la mémoire est un `ArrayBuffer`, ce que la Web Crypto lit. */
export type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();

/** Le texte en UTF-8. */
export function utf8(text: string): Bytes {
  return new Uint8Array(encoder.encode(text));
}

/** Le texte UTF-8 d'octets. */
export function text(bytes: Bytes): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/** Les octets d'un texte en base64 ; une exception s'il n'en est pas. */
export function fromBase64(value: string): Bytes {
  const binary = atob(value.replace(/\s/g, ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Le base64 d'octets. */
export function toBase64(bytes: Bytes): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Les octets mis bout à bout. */
export function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** `sha256:` et l'empreinte hexadécimale d'octets, ou d'un texte en UTF-8. */
export async function sha256(data: Bytes | string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", typeof data === "string" ? utf8(data) : data));
  return `sha256:${[...digest].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** La clé publique du premier exemple de la RFC 8032, en SubjectPublicKeyInfo : de quoi savoir si la plateforme sait vérifier. */
const PROBE = "MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=";
let probed: Promise<boolean> | null = null;

/**
 * La Web Crypto de cette plateforme sait-elle lire une clé Ed25519 ? Node 20 et les navigateurs récents oui ; un
 * navigateur plus ancien non, et un sceau ne s'y vérifie pas : il ne faut pas le dire faux pour autant.
 */
export function ed25519Supported(): Promise<boolean> {
  probed ??= crypto.subtle.importKey("spki", fromBase64(PROBE), { name: "Ed25519" }, false, ["verify"]).then(() => true, () => false);
  return probed;
}

/** Une clé publique Ed25519, SubjectPublicKeyInfo en DER ; null si ces octets n'en sont pas une. */
export async function ed25519Key(spki: Bytes): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.importKey("spki", spki, { name: "Ed25519" }, false, ["verify"]);
  } catch {
    return null;
  }
}

/** La signature Ed25519 tient-elle sur ces octets ? */
export async function verifyEd25519(key: CryptoKey, message: Bytes, signature: Bytes): Promise<boolean> {
  try {
    return await crypto.subtle.verify({ name: "Ed25519" }, key, signature, message);
  } catch {
    return false;
  }
}
