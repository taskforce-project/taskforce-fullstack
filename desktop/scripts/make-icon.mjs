// Icône de l'app desktop : la marque TaskForce (frontend/app/icon.svg) en blanc sur une tuile au bleu de la marque
// (--primary de l'interface), 1024 px. electron-builder en tire l'.ico de Windows et les tailles de Linux.
// Usage : node scripts/make-icon.mjs  (sharp vient des dépendances du frontend : rien à installer pour l'app)
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
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

// Tuile aux coins arrondis (22 % du côté, comme les icônes d'app de Windows 11 et de macOS), marque centrée sur 62 %.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" rx="${SIZE * 0.22}" fill="${BLUE}"/>
  <svg x="${SIZE * 0.19}" y="${SIZE * 0.19}" width="${SIZE * 0.62}" height="${SIZE * 0.62}" viewBox="180 79 250 250">
    <path fill-rule="evenodd" fill="#ffffff" d="${path}"/>
  </svg>
</svg>`;

const out = join(desktop, "build", "icon.png");
mkdirSync(dirname(out), { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(out);
console.log(`icon: ${out}`);
