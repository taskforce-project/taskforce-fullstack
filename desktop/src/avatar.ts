import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { API_URL } from "./account";
import { log } from "./log";

/**
 * Photo de profil du compte en ligne, reprise une fois par poste comme ses réglages : la coque la télécharge dans le
 * dossier du compte, où le backend la prend au démarrage s'il n'a pas encore de photo, puis l'efface et note la reprise
 * (cf. DesktopAccountBootstrap). L'interface ne peut pas afficher l'adresse d'origine : la politique de contenu de la
 * fenêtre n'admet que les images servies par l'app.
 */

/** Fichier déposé pour le backend (DesktopAccountBootstrap.AVATAR_FILE). */
export const AVATAR_FILE = "account-avatar";

/** Note du backend (DesktopAccountBootstrap.AVATAR_TAKEN_MARKER) : photo reprise sur ce poste, ou celle de l'app gardée. */
export const AVATAR_TAKEN_MARKER = "account-avatar-taken";

/** Plus grande photo téléchargée (DesktopAccountBootstrap.MAX_AVATAR_BYTES). */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const IMAGE = /^image\/(jpeg|png|gif|webp)$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Adresse d'où télécharger la photo : un chemin de l'API (`/api/files/avatars/7`, photo envoyée) se lit depuis l'adresse
 * de l'API, une adresse complète (GitHub, Google) telle quelle. HTTPS seulement, sauf vers l'API locale en développement.
 */
export function avatarSource(avatarUrl: string | null | undefined, apiUrl: string = API_URL): URL | null {
  if (!avatarUrl) return null;
  let url: URL;
  try {
    url = new URL(avatarUrl, `${apiUrl}/`);
  } catch {
    return null;
  }
  return url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) ? url : null;
}

/**
 * Télécharge la photo du compte en ligne dans le dossier du compte, si ce poste ne l'a pas encore reprise. Rend le
 * chemin du fichier déposé, ou `null` : pas de photo, déjà reprise, hors ligne, ou pas une image. Ne lève jamais : l'app
 * démarre de toute façon, avec l'avatar qu'elle génère.
 */
export async function downloadAccountAvatar(
  avatarUrl: string | null | undefined,
  dataDir: string,
  { apiUrl = API_URL, fetchImpl = fetch }: { apiUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  const source = avatarSource(avatarUrl, apiUrl);
  if (!source || existsSync(join(dataDir, AVATAR_TAKEN_MARKER))) return null;
  try {
    const response = await fetchImpl(source, { signal: AbortSignal.timeout(10_000) });
    const type = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    const length = Number(response.headers.get("content-length") ?? "0");
    if (!response.ok || !IMAGE.test(type) || length > MAX_AVATAR_BYTES) {
      log.warn(`Account photo not taken: ${response.status} ${type || "without a type"}`);
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) return null;
    await mkdir(dataDir, { recursive: true });
    const file = join(dataDir, AVATAR_FILE);
    await writeFile(file, bytes);
    return file;
  } catch (error) {
    log.warn(`Account photo not downloaded: ${(error as Error).message}`);
    return null;
  }
}
