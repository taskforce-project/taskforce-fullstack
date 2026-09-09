#!/usr/bin/env node
// Bump la version PRODUIT (source de verite du footer landing) : le plus fort bump parmi les services
// touches dans la release. Usage :
//   node scripts/bump-product-version.mjs <major|minor|patch>
// A lancer au moment d'une release produit (sur dev/v2, avant la promotion vers main), pour que le
// footer reflete la nouvelle version. La CI tague ensuite taskforce-v<version> a partir du fichier.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const bump = (process.argv[2] || "").toLowerCase();
if (!["major", "minor", "patch"].includes(bump)) {
  console.error("Usage: node scripts/bump-product-version.mjs <major|minor|patch>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "..", "landing-page", "src", "product-version.ts");

const src = readFileSync(FILE, "utf8");
const m = src.match(/PRODUCT_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!m) {
  console.error(`PRODUCT_VERSION introuvable dans ${FILE}`);
  process.exit(1);
}

let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
if (bump === "major") { major += 1; minor = 0; patch = 0; }
else if (bump === "minor") { minor += 1; patch = 0; }
else { patch += 1; }

const next = `${major}.${minor}.${patch}`;
writeFileSync(FILE, src.replace(/(PRODUCT_VERSION\s*=\s*)"\d+\.\d+\.\d+"/, `$1"${next}"`), "utf8");
console.log(`Version produit : ${m[1]}.${m[2]}.${m[3]} -> ${next} (${bump})`);
