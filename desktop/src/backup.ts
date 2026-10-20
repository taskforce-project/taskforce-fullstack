import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { log } from "./log";

/**
 * Copie de la base avant une migration. Une mise à jour de l'app peut faire évoluer la base au démarrage du backend
 * (Flyway) : quand la version de l'app change, la coque copie d'abord la base dans `<dossier du compte>/backups`, au
 * format de pg_dump (restaurable avec pg_restore), et garde les {@link KEEP} copies les plus récentes. La version de
 * l'app qui a ouvert la base en dernier est notée dans {@link VERSION_FILE}.
 */

export const BACKUPS = "backups";
export const VERSION_FILE = "app-version";
export const KEEP = 3;

/** Ce que la copie demande à la base embarquée. */
export interface Dumpable {
  dump(file: string): Promise<void>;
}

/** Version de l'app qui a ouvert la base en dernier, ou `null` (base toute neuve, ou ouverte avant la version 1.1.0). */
export function lastVersion(dataDir: string): string | null {
  try {
    return readFileSync(join(dataDir, VERSION_FILE), "utf8").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Notification du premier lancement d'une nouvelle version, sur une base qu'une version précédente avait ouverte : la
 * personne voit que la mise à jour est faite, et depuis quelle version. Rien pour une première installation.
 */
export function updateNotice(previous: string | null, version: string, fresh: boolean): { title: string; body: string } | null {
  if (fresh || !previous || previous === version) return null;
  return { title: `TaskForce ${version} is installed`, body: `Updated from version ${previous}.` };
}

/** Garde les `keep` copies les plus récentes : leur nom commence par leur date, l'ordre alphabétique est le bon. */
export function prune(dir: string, keep: number = KEEP): string[] {
  if (!existsSync(dir)) return [];
  const copies = readdirSync(dir).filter((name) => name.endsWith(".dump")).sort();
  const removed = copies.slice(0, Math.max(0, copies.length - keep));
  for (const name of removed) rmSync(join(dir, name), { force: true });
  return removed;
}

/**
 * Copie la base si cette version de l'app ne l'a pas encore ouverte. Rend le fichier de la copie, ou `null` : même
 * version, base toute neuve (`fresh`), ou copie impossible. Une copie impossible n'empêche pas l'app de démarrer, mais la
 * version n'est pas notée : la copie sera retentée au lancement suivant.
 */
export async function backupBeforeMigration(
  database: Dumpable,
  dataDir: string,
  version: string,
  fresh: boolean,
  now: Date = new Date(),
): Promise<string | null> {
  const previous = lastVersion(dataDir);
  if (previous === version) return null;
  let file: string | null = null;
  if (!fresh) {
    const stamp = now.toISOString().slice(0, 19).replace(/:/g, "-");
    file = join(dataDir, BACKUPS, `${stamp}-before-${version}.dump`);
    try {
      await database.dump(file);
    } catch (error) {
      log.error(`Database not copied before the update to ${version}: ${(error as Error).message}`);
      rmSync(file, { force: true });
      return null;
    }
    prune(join(dataDir, BACKUPS));
    log.info(`Database copied before the update from ${previous ?? "an earlier version"} to ${version}: ${basename(file)}`);
  }
  writeFileSync(join(dataDir, VERSION_FILE), version);
  return file;
}
