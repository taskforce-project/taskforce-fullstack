// Le panneau de gauche de l'écran de la coque, en images pour l'installeur d'une mise à jour (installer.nsh), qui dessine
// le même écran que l'app. Rendu par l'Electron de l'app (screen-panel.cjs), à chaque échelle d'écran de Windows que
// l'installeur sert telle quelle, puis en JPEG ; l'empreinte des sources du panneau est notée dans installer/panel.json.
// À relancer quand le panneau change (static/panel.js, shell.css, painting.webp, app.webp) : un test compare cette
// empreinte à celle des sources. Le rendu dépend des polices du poste : à lancer sous Windows 11 (Segoe UI Variable).
// Usage : npm run screen-panel  (sharp vient des dépendances du frontend, comme pour `npm run icon`)
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SCALES, sourcesHash } from "./screen-panel-sources.mjs";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(desktop, "..");
const sharp = createRequire(join(repo, "frontend", "package.json"))("sharp");
const electron = createRequire(join(desktop, "package.json"))("electron");

const out = join(desktop, "installer");
mkdirSync(out, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "tf-panel-"));
try {
  for (const scale of SCALES) {
    const png = join(work, `panel-${scale}.png`);
    const run = spawnSync(electron, [join(desktop, "scripts", "screen-panel.cjs"), String(scale / 100), png, join(work, `profile-${scale}`)], {
      stdio: "inherit",
      timeout: 60_000,
    });
    if (run.status !== 0) throw new Error(`the panel at ${scale}% was not rendered`);
    const { width, height } = await sharp(png).metadata();
    const expected = [Math.round(520 * scale / 100), Math.round(640 * scale / 100)];
    if (width !== expected[0] || height !== expected[1]) throw new Error(`panel at ${scale}%: ${width} x ${height}, expected ${expected.join(" x ")}`);
    const jpg = join(out, `panel-${scale}.jpg`);
    await sharp(png).jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true }).toFile(jpg);
    console.log(`panel ${scale}%: ${width} x ${height}, ${readFileSync(jpg).length} bytes`);
  }
} finally {
  // Les processus d'Electron lâchent leur profil un instant après leur sortie.
  rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}
writeFileSync(join(out, "panel.json"), JSON.stringify({ sources: sourcesHash(desktop), scales: SCALES }, null, 2) + "\n");
console.log(`panel images in ${out}`);
