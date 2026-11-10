import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * La mise à jour lancée en quittant, notée sur le disque. L'installeur tourne sans fenêtre (`/S`, cf. updater.ts) : s'il
 * échoue, il ne peut rien dire. Le lancement suivant compare la version qui tourne à celle attendue, et le dit.
 */
export interface PendingUpdate {
  /** La version qui devait s'installer. */
  readonly version: string;
  /** La version qui tournait quand l'installation est partie. */
  readonly from: string;
}

/** Le fichier de la note, dans le dossier de l'app (à côté de ses réglages). */
export const PENDING_FILE = "update-pending.json";

export function savePending(dir: string, pending: PendingUpdate): void {
  writeFileSync(join(dir, PENDING_FILE), JSON.stringify(pending));
}

/** Lit la note et l'efface : elle ne se dit qu'une fois. `null` sans note, ou si elle est illisible. */
export function takePending(dir: string): PendingUpdate | null {
  const file = join(dir, PENDING_FILE);
  if (!existsSync(file)) return null;
  try {
    const { version, from } = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    return typeof version === "string" && typeof from === "string" ? { version, from } : null;
  } catch {
    return null;
  } finally {
    try {
      rmSync(file, { force: true });
    } catch {
      // Une note qui reste se relit au lancement suivant : rien ne casse.
    }
  }
}

/**
 * La passation de l'écran de la mise à jour (cf. desktop/installer.nsh) : ce fichier, posé par l'installeur dans le
 * dossier de l'app, existe tant que sa fenêtre est à l'écran. L'ancienne app attend qu'il apparaisse pour quitter, la
 * nouvelle l'efface en montrant sa première fenêtre. Ainsi, du clic sur « Restart now » à la nouvelle fenêtre, il y a
 * toujours une fenêtre de TaskForce à l'écran.
 */
export const SCREEN_FILE = "update-screen";

export function updateScreenIsUp(dir: string): boolean {
  return existsSync(join(dir, SCREEN_FILE));
}

/** Dit à l'installeur que sa fenêtre peut partir. Un fichier qui reste fait attendre son délai à la fenêtre, rien de plus. */
export function releaseUpdateScreen(dir: string): void {
  try {
    rmSync(join(dir, SCREEN_FILE), { force: true });
  } catch {
    // La fenêtre de l'installeur partira à la fin de son délai.
  }
}

/**
 * Ce que le lancement suivant en conclut : `installed` (la nouvelle version tourne), `not-installed` (l'app tourne encore
 * sur la version d'avant : l'installeur a échoué, ou n'est pas parti), ou `null` (rien à dire, l'app a changé autrement).
 */
export function pendingOutcome(pending: PendingUpdate | null, running: string): "installed" | "not-installed" | null {
  if (!pending) return null;
  if (running === pending.version) return "installed";
  return running === pending.from ? "not-installed" : null;
}
