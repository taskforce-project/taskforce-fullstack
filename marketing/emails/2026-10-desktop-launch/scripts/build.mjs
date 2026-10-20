// Construit l'e-mail dans chaque langue à partir du gabarit (src/email.html) et des textes (src/strings/<langue>.json) :
// dist/<langue>/email.html (animations), email-static.html (images fixes), email.txt (texte brut, src/email.<langue>.txt),
// et dist/preview/<langue>/ (aperçu local : images du dépôt, balises Brevo remplacées par des exemples).
// S'arrête si une clé de texte manque ou ne sert pas, si un jeton reste, si un tiret long ou demi-long s'est glissé, si
// une balise Brevo inconnue apparaît, si une image n'a pas de texte alternatif, ou si Gmail couperait le message.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const LOCAL_ASSETS = resolve(ROOT, "../../../landing-page/public/email/2026-10-desktop-launch");
export const LANGS = ["fr", "en"];

/** Adresse des images, servies par le site (landing-page/public/email/...). */
export const ASSET = "https://taskforce-project.fr/email/2026-10-desktop-launch";
/** Gmail coupe un message de plus de 102 Ko ; on garde de la marge. */
const MAX_HTML_BYTES = 95_000;
const BREVO_TAGS = new Set(["mirror", "unsubscribe", 'contact.FIRSTNAME|default:"there"', 'contact.FIRSTNAME|default:"à vous"']);
/** Tirets demi-long et long (U+2013, U+2014), interdits dans les textes de TaskForce. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const SITE = "https://taskforce-project.fr";
const REPO = "https://github.com/taskforce-project/taskforce-fullstack";
/** Étiquettes des liens dans le rapport de Brevo (le site n'a pas de mesure d'audience). */
const utm = (path, content) =>
  `${SITE}${path}${path.includes("?") ? "&" : "?"}utm_source=brevo&utm_medium=email&utm_campaign=desktop-launch-2026-10&utm_content=${content}`;
const mail = (subject) => `mailto:contact@taskforce-project.fr?subject=${encodeURIComponent(subject)}`;

/** Toutes les adresses de l'e-mail, en un seul endroit. Le lien VirusTotal suit la version de l'installeur. */
function urls(strings) {
  return {
    URL_HERO: utm("/download", "hero-download"),
    URL_END: utm("/download", "end-download"),
    URL_GUIDE: `${utm("/download", "install-guide")}#install`,
    URL_VIRUSTOTAL: "https://www.virustotal.com/gui/file/fbde7957158d715ba9b626e6056cd466da49f00af149d4b72f0a33e3a46a79c0",
    URL_HELP: mail(strings.help_subject),
    URL_FEEDBACK: mail("TaskForce Desktop"),
    URL_MIGRATE: utm("/migrate", "migrate-guide"),
    URL_SITE: utm("/", "footer-site"),
    URL_GH_EXPLORE: `${REPO}#readme`,
    URL_GH_STAR: REPO,
    URL_GH_ISSUE: `${REPO}/issues/new/choose`,
    URL_GH_END: `${REPO}?tab=readme-ov-file`,
    URL_GH_ISSUES: `${REPO}/issues`,
    URL_GH_ORG: "https://github.com/taskforce-project",
    LINK: "color:#1e4fc4;text-decoration:underline;",
  };
}

const template = readFileSync(join(ROOT, "src/email.html"), "utf8");
const KEYS = new Set([...template.matchAll(/\[\[([a-z0-9_]+)\]\]/g)].map(([, key]) => key));

function fail(name, problems) {
  console.error(`${name}:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

function check(name, content, isHtml) {
  const problems = [];
  const left = content.match(/%[A-Z_]+%|\[\[[a-z0-9_]+\]\]/g);
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
  if (problems.length) fail(name, problems);
}

function render(lang, strings, { asset, demo, steps }) {
  const missing = [...KEYS].filter((key) => !(key in strings));
  const unused = Object.keys(strings).filter((key) => !KEYS.has(key) && key !== "help_subject");
  if (missing.length || unused.length) {
    fail(`src/strings/${lang}.json`, [...missing.map((k) => `missing: ${k}`), ...unused.map((k) => `unused: ${k}`)]);
  }
  let html = template.replace(/\[\[([a-z0-9_]+)\]\]/g, (_, key) => strings[key]);
  for (const [token, value] of Object.entries(urls(strings))) html = html.replaceAll(`%${token}%`, value.replaceAll("&", "&amp;"));
  return html.replaceAll("%ASSET%", asset).replaceAll("%DEMO%", demo).replaceAll("%STEPS%", steps);
}

function write(file, content, isHtml) {
  check(relative(ROOT, file), content, isHtml);
  writeFileSync(file, content);
  console.log(`${relative(ROOT, file)}  ${(Buffer.byteLength(content) / 1024).toFixed(1)} KB`);
}

/** Ce qu'un contact verrait : prénom d'exemple, liens Brevo neutralisés. */
const sample = (content) => content
  .replace(/\{\{ contact\.FIRSTNAME\|default:"[^"]*" \}\}/g, "Alex")
  .replaceAll("{{ mirror }}", "#")
  .replaceAll("{{ unsubscribe }}", "#");

for (const lang of LANGS) {
  const strings = JSON.parse(readFileSync(join(ROOT, `src/strings/${lang}.json`), "utf8"));
  const out = join(DIST, lang);
  const preview = join(DIST, "preview", lang);
  mkdirSync(out, { recursive: true });
  mkdirSync(preview, { recursive: true });
  const animated = { demo: "demo.gif", steps: `steps-${lang}.gif` };
  const still = { demo: "demo-static.jpg", steps: `steps-${lang}.png` };
  write(join(out, "email.html"), render(lang, strings, { asset: ASSET, ...animated }), true);
  write(join(out, "email-static.html"), render(lang, strings, { asset: ASSET, ...still }), true);
  write(join(out, "email.txt"), readFileSync(join(ROOT, `src/email.${lang}.txt`), "utf8"), false);

  const local = relative(preview, LOCAL_ASSETS).replaceAll("\\", "/");
  writeFileSync(join(preview, "email.html"), sample(render(lang, strings, { asset: local, ...animated })));
  writeFileSync(join(preview, "email-static.html"), sample(render(lang, strings, { asset: local, ...still })));
}
console.log("previews written to dist/preview/<lang>/");
