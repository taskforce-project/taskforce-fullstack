// Construit l'e-mail à partir de src/ : dist/email.html (démo animée), dist/email-static.html (sans animation),
// dist/email.txt (texte brut) et dist/preview/ (aperçu local : images du dépôt, balises Brevo remplacées par des
// exemples). S'arrête si un jeton reste, si un tiret long ou demi-long s'est glissé, si une balise Brevo inconnue
// apparaît, si une image n'a pas de texte alternatif, ou si le HTML dépasse ce que Gmail affiche sans le couper.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const PREVIEW = join(DIST, "preview");
const LOCAL_ASSETS = resolve(ROOT, "../../../landing-page/public/email/2026-10-desktop-launch");

/** Adresse des images, servies par le site (landing-page/public/email/...). */
export const ASSET = "https://taskforce-project.fr/email/2026-10-desktop-launch";
/** Gmail coupe un message de plus de 102 Ko ; on garde de la marge. */
const MAX_HTML_BYTES = 95_000;
const BREVO_TAGS = new Set(["mirror", "unsubscribe", 'contact.FIRSTNAME|default:"there"']);
/** Tirets demi-long et long (U+2013, U+2014), interdits dans les textes de TaskForce. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const html = readFileSync(join(ROOT, "src/email.html"), "utf8");
const text = readFileSync(join(ROOT, "src/email.txt"), "utf8");

function check(name, content, { isHtml }) {
  const problems = [];
  const left = content.match(/%[A-Z_]+%/g);
  if (left) problems.push(`tokens left: ${[...new Set(left)].join(", ")}`);
  if (DASHES.test(content)) problems.push("en or em dash found");
  for (const [, tag] of content.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
    if (!BREVO_TAGS.has(tag)) problems.push(`unknown Brevo tag: {{ ${tag} }}`);
  }
  if (isHtml) {
    for (const [img] of content.matchAll(/<img\b[^>]*>/g)) {
      if (!/\balt="[^"]+"/.test(img)) problems.push(`image without alt text: ${img.slice(0, 80)}`);
    }
    const bytes = Buffer.byteLength(content);
    if (bytes > MAX_HTML_BYTES) problems.push(`HTML is ${bytes} bytes, over ${MAX_HTML_BYTES}`);
  }
  if (problems.length) {
    console.error(`${name}:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
}

function write(file, content, isHtml) {
  check(relative(ROOT, file), content, { isHtml });
  writeFileSync(file, content);
  console.log(`${relative(ROOT, file)}  ${(Buffer.byteLength(content) / 1024).toFixed(1)} KB`);
}

const variant = (demo, asset = ASSET) => html.replaceAll("%ASSET%", asset).replaceAll("%DEMO%", demo);

mkdirSync(PREVIEW, { recursive: true });
write(join(DIST, "email.html"), variant("demo.gif"), true);
write(join(DIST, "email-static.html"), variant("demo-static.jpg"), true);
write(join(DIST, "email.txt"), text, false);

// Aperçu local : mêmes pages, images lues dans le dépôt, balises Brevo remplacées par ce qu'un contact verrait.
const localAsset = relative(PREVIEW, LOCAL_ASSETS).replaceAll("\\", "/");
const sample = (content) => content
  .replaceAll('{{ contact.FIRSTNAME|default:"there" }}', "Alex")
  .replaceAll("{{ mirror }}", "#")
  .replaceAll("{{ unsubscribe }}", "#");
writeFileSync(join(PREVIEW, "email.html"), sample(variant("demo.gif", localAsset)));
writeFileSync(join(PREVIEW, "email-static.html"), sample(variant("demo-static.jpg", localAsset)));
console.log("preview written to dist/preview/");
