import { app } from "electron";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * Dossier des ressources embarquées : Java (`jre`), base (`postgres`), backend (`backend/tf-api.jar`) et interface
 * (`frontend`, serveur Next autonome). Dans l'app installée, celui d'electron-builder ; en développement,
 * `desktop/resources` (assemblé par `npm run resources`) ou `TF_DESKTOP_RESOURCES`.
 */
export function resourcesDir(): string {
  const override = process.env.TF_DESKTOP_RESOURCES;
  if (override) return override;
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), "resources");
}

/** Nom d'un exécutable sur cette plateforme (`java` → `java.exe` sous Windows). */
export function exe(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

export const javaPath = (): string => join(resourcesDir(), "jre", "bin", exe("java"));
export const backendJar = (): string => join(resourcesDir(), "backend", "tf-api.jar");
export const postgresDir = (): string => join(resourcesDir(), "postgres");
export const postgresTool = (tool: string): string => join(postgresDir(), "bin", exe(tool));
export const frontendServer = (): string => join(resourcesDir(), "frontend", "server.js");

/**
 * Dossier de données d'un compte : base, fichiers, journaux. Chaque compte a le sien, un compte ne voit jamais les
 * données d'un autre sur la même machine. Le nom est dérivé de l'identifiant du compte, sans le révéler.
 */
export function accountDataDir(subject: string): string {
  const id = createHash("sha256").update(subject).digest("hex").slice(0, 24);
  return join(app.getPath("userData"), "accounts", id);
}

/** Journaux de l'app elle-même (coque), hors de tout compte. */
export const appLogDir = (): string => join(app.getPath("userData"), "logs");

/**
 * Dossier des données de la version du Microsoft Store, `null` hors d'un paquet du Store. Windows donne à une app
 * empaquetée son dossier, %LOCALAPPDATA%\Packages\<famille du paquet>, effacé à la désinstallation ; l'app écrit dans
 * son LocalState. Dans %APPDATA%, Windows redirigerait les écritures en coulisses vers ce même dossier : l'Explorateur
 * ne verrait ni les journaux ni les sauvegardes, et une base créée par la version du site, si elle est aussi installée,
 * serait à moitié modifiée sur place, à moitié dans la copie privée. La famille du paquet se lit dans le chemin de
 * l'app installée : WindowsApps\<nom>_<version>_<architecture>_<ressource>_<éditeur>.
 */
export function storeDataDir(execPath: string, localAppData: string | undefined): string | null {
  const match = /[\\/]WindowsApps[\\/]([^\\/_]+)_[^\\/_]+_[^\\/_]+_[^\\/_]*_([^\\/_]+)[\\/]/i.exec(execPath);
  if (!match || !localAppData) return null;
  return join(localAppData, "Packages", `${match[1]}_${match[2]}`, "LocalState");
}
