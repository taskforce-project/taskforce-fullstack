// Calcule la VERSION PRODUIT affichée au footer de l'app, à partir des deux tags du monorepo.
//
// Règle (décidée par le CEO) : la version produit doit représenter le travail COMPLET, front + back.
// On garde major = 0 (pas encore de v1 : produit en beta) et on ADDITIONNE les composantes des deux
// tags :  produit = 0.(minor_front + minor_back).(patch_front + patch_back).
//   frontend/package.json  (0.1.0)  +  backend/tf-api/pom.xml (0.0.1)  ->  0.1.1
//
// Pourquoi un script (et pas next.config qui lirait les deux fichiers au build) : l'image Docker du
// frontend est construite avec le SEUL dossier frontend/ comme contexte - le pom backend n'y est pas.
// On calcule donc ICI (là où les deux fichiers existent : repo complet, local ou CI) et on écrit le
// résultat dans frontend/product-version.json, committé et lu au build par next.config.
//
// À relancer quand on bumpe un tag (front ou back) :  node scripts/product-version.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Découpe un semver en [major, minor, patch] entiers, en ignorant tout suffixe (-SNAPSHOT, -rc…). */
function parts(version) {
  const [maj = "0", min = "0", pat = "0"] = version.split(".");
  const int = (s) => parseInt(String(s).replace(/[^0-9].*$/, ""), 10) || 0;
  return [int(maj), int(min), int(pat)];
}

// Tag frontend : champ "version" de package.json.
const frontend = JSON.parse(
  readFileSync(join(repoRoot, "frontend", "package.json"), "utf8")
).version;

// Tag backend : la version PROJET du pom (le <version> qui suit <artifactId>tf-api</artifactId>,
// pas celle du parent Spring ni des dépendances).
const pom = readFileSync(join(repoRoot, "backend", "tf-api", "pom.xml"), "utf8");
const backendMatch = pom.match(
  /<artifactId>\s*tf-api\s*<\/artifactId>\s*<version>\s*([^<]+?)\s*<\/version>/
);
if (!backendMatch) {
  throw new Error("Version projet backend introuvable dans backend/tf-api/pom.xml");
}
const backend = backendMatch[1];

const [, fMinor, fPatch] = parts(frontend);
const [, bMinor, bPatch] = parts(backend);
// major épinglé à 0 tant qu'on n'est pas passé en v1 (décision produit).
const productVersion = `0.${fMinor + bMinor}.${fPatch + bPatch}`;

const out = { version: productVersion, frontend, backend };
writeFileSync(
  join(repoRoot, "frontend", "product-version.json"),
  JSON.stringify(out, null, 2) + "\n"
);

console.log(
  `Version produit = ${productVersion}  (front ${frontend} + back ${backend}) ` +
  `-> frontend/product-version.json`
);
