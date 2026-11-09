import { Worker } from "node:worker_threads";

/**
 * Lance l'installeur téléchargé, détaché de l'app, depuis un fil à part. Windows peut retenir son lancement le temps de
 * le vérifier (5 à 10 s à chaque mise à jour dans le journal du CEO) : lancé du fil principal, il bloquerait l'écran de
 * la mise à jour, que Windows marquerait « Not Responding ». Le code tient dans cette chaîne, sans fichier : un fil de
 * Node ne charge pas un module depuis l'archive de l'app, et il n'y a rien à charger.
 */
const LAUNCH = `
const { spawn } = require("node:child_process");
const { parentPort, workerData } = require("node:worker_threads");
const child = spawn(workerData.file, workerData.args, { detached: true, stdio: "ignore" });
child.once("error", (error) => parentPort.postMessage({ error: error.message }));
child.once("spawn", () => {
  child.unref();
  parentPort.postMessage({});
});
`;

/** Résolue quand le processus de l'installeur est parti, rejetée s'il n'a pas pu l'être. */
export function launchInstaller(file: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(LAUNCH, { eval: true, workerData: { file, args } });
    worker.once("message", (message: { error?: string }) => {
      void worker.terminate();
      if (message.error) reject(new Error(message.error));
      else resolve();
    });
    worker.once("error", reject);
  });
}

/** Attend qu'une condition devienne vraie, sans dépasser `timeoutMs`. Rend sa dernière valeur. */
export async function waitUntil(condition: () => boolean, timeoutMs: number, everyMs = 100): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
  return true;
}
