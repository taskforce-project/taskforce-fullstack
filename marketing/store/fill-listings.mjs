// Remplit l'export des fiches du Partner Center (Store listings, Export listings) avec listing.en.md et listing.fr.md,
// et prépare le dossier à réimporter (Import listings, Upload folder) : le .csv rempli et les captures.
// Usage : node marketing/store/fill-listings.mjs <listingData-....csv exporté> <dossier de sortie>
//
// Les colonnes Field, ID et Type de l'export ne bougent pas (le Partner Center les exige telles quelles) ; le français
// s'ajoute en colonne fr-fr s'il n'y est pas. Le texte des fiches est replié à 120 colonnes : chaque paragraphe est
// recollé, sauf les lignes de liste et les lignes qui finissent une phrase avant une majuscule.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const HERE = resolve(import.meta.dirname);
const [exported, outDir] = process.argv.slice(2);
if (!exported || !outDir) {
  console.error("usage: node marketing/store/fill-listings.mjs <exported listingData .csv> <output folder>");
  process.exit(1);
}
const root = basename(resolve(outDir));
const LANGS = { "en-us": "listing.en.md", "fr-fr": "listing.fr.md" };

/** Sections « ## Titre » d'une fiche, avec leurs lignes. */
function sections(markdown) {
  const out = {};
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    const title = /^## (.+)$/.exec(line);
    if (title) out[(current = title[1].trim())] = [];
    else if (current) out[current].push(line);
  }
  return out;
}

/** Texte d'une section, paragraphes recollés, lignes de liste gardées. */
function prose(lines) {
  const blocks = lines.join("\n").trim().split(/\n\s*\n/);
  return blocks.map((block) => {
    const out = [];
    for (const line of block.split("\n").map((it) => it.trim())) {
      const previous = out.at(-1);
      const newLine = !previous || line.startsWith("- ") || (/[.!?]$/.test(previous) && /^\p{Lu}/u.test(line));
      if (newLine) out.push(line);
      else out[out.length - 1] = `${previous} ${line}`;
    }
    return out.join("\n");
  }).join("\n\n");
}

const items = (lines) => lines.map((it) => it.trim()).filter((it) => it.startsWith("- ")).map((it) => it.slice(2));

/** Les valeurs d'une langue, par nom de champ du Partner Center. */
function values(file) {
  const s = sections(readFileSync(join(HERE, file), "utf8"));
  const fields = {
    Title: prose(s["Product name"]),
    Description: prose(s["Description"]),
    ReleaseNotes: prose(s["What's new in this version"]),
    ShortDescription: prose(s["Short description"]),
    DevStudio: prose(s["Developed by"]),
    CopyrightTrademarkInformation: prose(s["Copyright and trademark info"]),
    AdditionalLicenseTerms: prose(s["Additional license terms"]),
  };
  items(s["Product features"]).forEach((feature, i) => (fields[`Feature${i + 1}`] = feature));
  prose(s["Search terms"]).split(",").map((it) => it.trim()).forEach((term, i) => (fields[`SearchTerm${i + 1}`] = term));
  const shots = s["Screenshots"].map((line) => /^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|$/.exec(line)).filter(Boolean);
  shots.forEach(([, image, caption], i) => {
    fields[`DesktopScreenshot${i + 1}`] = `${root}/${image}`;
    fields[`DesktopScreenshotCaption${i + 1}`] = caption;
  });
  return { fields, images: shots.map(([, image]) => image) };
}

/** Lecture d'un CSV (champs entre guillemets, guillemets doublés, retours à la ligne dans un champ). */
function parseCsv(text) {
  const rows = [[]];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") rows.at(-1).push(field), (field = "");
    else if (c === "\n") rows.at(-1).push(field.replace(/\r$/, "")), rows.push([]), (field = "");
    else field += c;
  }
  if (field || rows.at(-1).length) rows.at(-1).push(field);
  else rows.pop();
  return rows;
}

const cell = (value) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

const rows = parseCsv(readFileSync(exported, "utf8").replace(/^﻿/, ""));
const header = rows[0];
const images = new Set();
for (const [lang, file] of Object.entries(LANGS)) {
  if (!header.includes(lang)) header.push(lang);
  const column = header.indexOf(lang);
  const { fields, images: shots } = values(file);
  shots.forEach((it) => images.add(it));
  for (const row of rows.slice(1)) {
    while (row.length < header.length) row.push("");
    if (row[0] in fields) row[column] = fields[row[0]];
    // Un champ oui ou non (OverrideLogosForWin10) ne reste pas vide : il reprend la valeur de la première langue.
    else if (row[2] === "True/False" && !row[column]) row[column] = row[header.indexOf("default") + 1];
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "listings.csv"), `﻿${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`);
for (const image of images) copyFileSync(join(HERE, "screenshots", image), join(outDir, image));
console.log(`${join(outDir, "listings.csv")}: ${Object.keys(LANGS).join(", ")}, ${images.size} screenshots`);
