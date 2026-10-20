// Vérifie chaque lien et chaque image de dist/<langue>/email.html et email-static.html, une fois le site déployé :
// une image doit répondre 200 avec un type image/*, un lien 200 après redirections. VirusTotal refuse les robots (403),
// ses liens sont seulement listés, comme la feuille de polices. Les balises Brevo ({{ mirror }}, {{ unsubscribe }}) et les mailto: sont ignorés.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
/** VirusTotal refuse les robots ; la feuille Google Fonts est chargée par le client de messagerie, pas cliquée. */
const BOT_BLOCKED = ["www.virustotal.com", "fonts.googleapis.com"];

const urls = new Map();
for (const file of ["fr", "en"].flatMap((lang) => [`dist/${lang}/email.html`, `dist/${lang}/email-static.html`])) {
  const html = readFileSync(join(ROOT, file), "utf8");
  for (const [, kind, raw] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    const url = raw.replaceAll("&amp;", "&");
    if (url.startsWith("{{") || url.startsWith("mailto:") || url === "#") continue;
    urls.set(url, kind === "src" ? "image" : "link");
  }
}

let failed = 0;
for (const [url, kind] of urls) {
  const host = new URL(url).host;
  if (BOT_BLOCKED.includes(host)) {
    console.log(`skip   ${url}  (refuses robots, open it in a browser)`);
    continue;
  }
  let status = "error";
  let type = "";
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 TaskForce email check" } });
    status = res.status;
    type = res.headers.get("content-type") ?? "";
    await res.body?.cancel();
  } catch (error) {
    status = String(error.cause?.code ?? error.message);
  }
  const ok = status === 200 && (kind !== "image" || type.startsWith("image/"));
  if (!ok) failed++;
  console.log(`${ok ? "ok    " : "FAIL  "}${kind.padEnd(5)} ${status} ${kind === "image" ? type.padEnd(11) : ""} ${url}`);
}
console.log(failed ? `${failed} problem(s)` : `all ${urls.size} addresses answer`);
process.exit(failed ? 1 : 0);
