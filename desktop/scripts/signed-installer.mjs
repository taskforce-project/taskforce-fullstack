/**
 * Après la signature par SignPath (CI, .github/workflows/desktop-release.yml) : remplace l'installeur Windows par sa
 * version signée, puis recalcule ce que le programme de mise à jour vérifie (empreinte sha512 et taille dans
 * latest.yml, carte des blocs pour les mises à jour différentielles).
 *
 * Usage : node scripts/signed-installer.mjs <dossier des paquets> <dossier rendu par SignPath>
 */
import { createHash } from "node:crypto";
import { copyFileSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";

import { updateInfo } from "./update-info.mjs";

const [releaseDir, signedDir] = process.argv.slice(2);
if (!releaseDir || !signedDir) throw new Error("usage: signed-installer.mjs <release dir> <signed dir>");

const signed = readdirSync(signedDir, { recursive: true }).map(String).find((f) => /TaskForce-Setup-.*\.exe$/.test(f));
if (!signed) throw new Error(`no signed installer in ${signedDir}`);
const name = basename(signed);
const target = join(releaseDir, name);
copyFileSync(join(signedDir, signed), target);

const sha512 = createHash("sha512").update(readFileSync(target)).digest("base64");
const size = statSync(target).size;
const latest = join(releaseDir, "latest.yml");
writeFileSync(latest, updateInfo(readFileSync(latest, "utf8"), name, { sha512, size }));

// Carte des blocs refaite avec l'outil d'electron-builder ; sans elle, les mises à jour téléchargent l'installeur entier.
const blockmap = `${target}.blockmap`;
try {
  const { buildBlockMap } = createRequire(import.meta.url)("app-builder-lib/out/targets/blockmap/blockmap");
  await buildBlockMap(target, "gzip", blockmap);
} catch (error) {
  rmSync(blockmap, { force: true });
  console.warn(`Block map not rebuilt (${error.message}): updates will download the whole installer.`);
}
console.log(`${name}: signed installer in place, ${size} bytes`);
