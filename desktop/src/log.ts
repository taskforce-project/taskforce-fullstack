import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

let logFile: string | null = null;

/** Journal de la coque : `logs/desktop.log` dans le dossier de l'app, et la console en développement. */
export function initLog(dir: string): void {
  mkdirSync(dir, { recursive: true });
  logFile = join(dir, "desktop.log");
}

function write(level: string, message: string): void {
  const line = `${new Date().toISOString()} ${level} ${message}`;
  if (logFile) {
    try {
      appendFileSync(logFile, line + "\n");
    } catch {
      // Un journal illisible ne doit jamais arrêter l'app.
    }
  }
  if (level === "ERROR") console.error(line);
  else console.log(line);
}

export const log = {
  info: (message: string) => write("INFO", message),
  warn: (message: string) => write("WARN", message),
  error: (message: string) => write("ERROR", message),
};
