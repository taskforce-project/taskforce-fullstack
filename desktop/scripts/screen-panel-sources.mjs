// Ce que sont les images du panneau de l'installeur (installer/panel-*.jpg) : leurs échelles et les sources dont elles
// sont tirées. Partagé par make-screen-panel.mjs, qui les dessine, et par le test qui vérifie qu'elles sont à jour.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Les échelles servies telles quelles ; entre deux, l'installeur réduit l'image de l'échelle au-dessus. */
export const SCALES = [100, 125, 150, 175, 200];

/** Les sources du panneau, dont l'empreinte dit si les images sont à jour. */
export const SOURCES = ["static/panel.js", "static/shell.css", "static/painting.webp", "static/app.webp"];

/** L'empreinte des sources, depuis le dossier desktop, aux fins de ligne près (git les change selon le poste). */
export function sourcesHash(desktop) {
  const hash = createHash("sha256");
  for (const source of SOURCES) {
    const bytes = readFileSync(join(desktop, source));
    hash.update(source).update(/\.(js|css)$/.test(source) ? bytes.toString("utf8").replace(/\r\n/g, "\n") : bytes);
  }
  return hash.digest("hex");
}
