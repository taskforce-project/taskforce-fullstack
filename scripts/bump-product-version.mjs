#!/usr/bin/env node
// Bump la version PRODUIT unique de TaskForce, affichée dans les DEUX footers (app + landing).
//
// La valeur est dupliquee dans deux contextes de build isoles (l'image Docker frontend n'a que
// frontend/, la landing que landing-page/) : on garde donc en sync
//   - frontend/product-version.json      (lu par next.config -> footer app)
//   - landing-page/src/product-version.ts (lu par le footer landing)
// Source de verite = frontend/product-version.json.
//
// Usage : node scripts/bump-product-version.mjs <major|minor|patch>
// A lancer au release (= le plus fort bump parmi les services touches). La CI tague ensuite
// taskforce-v<version>.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const bump = (process.argv[2] || "").toLowerCase();
if (!["major", "minor", "patch"].includes(bump)) {
  console.error("Usage: node scripts/bump-product-version.mjs <major|minor|patch>");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRONT_JSON = join(root, "frontend", "product-version.json");
const LANDING_TS = join(root, "landing-page", "src", "product-version.ts");

const json = JSON.parse(readFileSync(FRONT_JSON, "utf8"));
const m = String(json.version).match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!m) {
  console.error(`Version invalide dans ${FRONT_JSON} : ${json.version}`);
  process.exit(1);
}

let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
if (bump === "major") { major += 1; minor = 0; patch = 0; }
else if (bump === "minor") { minor += 1; patch = 0; }
else { patch += 1; }
const next = `${major}.${minor}.${patch}`;

writeFileSync(FRONT_JSON, JSON.stringify({ version: next }, null, 2) + "\n");
const ts = readFileSync(LANDING_TS, "utf8");
writeFileSync(LANDING_TS, ts.replace(/(PRODUCT_VERSION\s*=\s*)"\d+\.\d+\.\d+"/, `$1"${next}"`));

console.log(`Version produit : ${json.version} -> ${next} (${bump}) [frontend + landing sync]`);
