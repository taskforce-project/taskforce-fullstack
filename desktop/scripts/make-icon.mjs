// Icône de l'app desktop : la marque TaskForce (frontend/app/icon.svg) en blanc sur une tuile au bleu de la marque
// (--primary de l'interface), 1024 px. electron-builder en tire l'.ico de Windows et les tailles de Linux.
// Aussi les logos du paquet Microsoft Store (build/appx, cf. electron-builder.yml) : la même tuile là où Windows montre
// l'icône telle quelle (Store, barre des tâches, menu Démarrer de Windows 11), la marque seule en blanc là où il la pose
// sur une plaque à la couleur du paquet (tuiles du menu Démarrer de Windows 10), à chaque échelle d'écran.
// Usage : node scripts/make-icon.mjs  (sharp vient des dépendances du frontend : rien à installer pour l'app)
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(desktop, "..");
const sharp = createRequire(join(repo, "frontend", "package.json"))("sharp");

const SIZE = 1024;
const BLUE = "#2f6bf6";
const mark = readFileSync(join(repo, "frontend", "app", "icon.svg"), "utf8");
const path = /<path[^>]*d="([^"]+)"/.exec(mark)?.[1];
if (!path) throw new Error("frontend/app/icon.svg has no path");

const markSvg = (x, y, side) =>
  `<svg x="${x}" y="${y}" width="${side}" height="${side}" viewBox="180 79 250 250">
    <path fill-rule="evenodd" fill="#ffffff" d="${path}"/>
  </svg>`;

// Tuile aux coins arrondis (22 % du côté, comme les icônes d'app de Windows 11 et de macOS), marque centrée sur 62 %.
const tile = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" rx="${SIZE * 0.22}" fill="${BLUE}"/>
  ${markSvg(SIZE * 0.19, SIZE * 0.19, SIZE * 0.62)}
</svg>`;

/** La marque seule, centrée sur un cadre transparent de `width` x `height`, sur `share` du plus petit côté. */
const glyph = (width, height, share) => {
  const side = Math.min(width, height) * share;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${markSvg((width - side) / 2, (height - side) / 2, side)}
  </svg>`;
};

const out = join(desktop, "build", "icon.png");
mkdirSync(dirname(out), { recursive: true });
await sharp(Buffer.from(tile(SIZE))).png().toFile(out);
console.log(`icon: ${out}`);

// Logos du paquet du Store, aux tailles et noms que Windows attend (échelles 100, 200 et 400 %, tailles cibles de
// l'icône des listes) ; « altform-unplated » : sans plaque, la tuile entière.
const assets = [];
for (const target of [16, 24, 32, 48, 256]) {
  assets.push([`Square44x44Logo.targetsize-${target}_altform-unplated.png`, tile(target)]);
  assets.push([`Square44x44Logo.targetsize-${target}.png`, glyph(target, target, 0.66)]);
}
for (const scale of [100, 200, 400]) {
  const k = scale / 100;
  assets.push([`StoreLogo.scale-${scale}.png`, tile(50 * k)]);
  assets.push([`Square44x44Logo.scale-${scale}.png`, glyph(44 * k, 44 * k, 0.66)]);
  assets.push([`SmallTile.scale-${scale}.png`, glyph(71 * k, 71 * k, 0.5)]);
  assets.push([`Square150x150Logo.scale-${scale}.png`, glyph(150 * k, 150 * k, 0.5)]);
  assets.push([`Wide310x150Logo.scale-${scale}.png`, glyph(310 * k, 150 * k, 0.5)]);
  assets.push([`LargeTile.scale-${scale}.png`, glyph(310 * k, 310 * k, 0.4)]);
}
const appx = join(desktop, "build", "appx");
rmSync(appx, { recursive: true, force: true });
mkdirSync(appx, { recursive: true });
for (const [name, svg] of assets) await sharp(Buffer.from(svg)).png().toFile(join(appx, name));
console.log(`Store logos: ${assets.length} files in ${appx}`);
