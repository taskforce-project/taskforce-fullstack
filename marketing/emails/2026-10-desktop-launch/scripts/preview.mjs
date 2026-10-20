// Captures de l'aperçu (dist/preview/<langue>/email.html) pour relire l'e-mail avant de l'importer dans Brevo :
//   desktop.png  720 px de large, avec Geist (comme Apple Mail, qui charge la police)
//   mobile.png   390 px de large, avec Geist
//   gmail.png    720 px, sans police web (Gmail et Outlook ignorent le lien vers Google Fonts : polices système)
// La feuille Google Fonts est servie depuis le paquet local de Geist, pour un rendu rapide et stable.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "..");
const LANGS = ["fr", "en"];
const GEIST = readFileSync(join(ROOT, "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"));

const browser = await chromium.launch({ channel: "msedge" });
for (const lang of LANGS) for (const [name, width, scale, webFont] of [["desktop", 720, 1, true], ["mobile", 390, 2, true], ["gmail", 720, 1, false]]) {
  const PREVIEW = join(ROOT, "dist/preview", lang);
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: scale });
  await page.route("https://fonts.googleapis.com/**", (route) => webFont
    ? route.fulfill({ contentType: "text/css", body: "@font-face{font-family:Geist;src:url(https://fonts.local/geist.woff2) format('woff2');font-weight:100 900}" })
    : route.abort());
  await page.route("https://fonts.local/**", (route) => route.fulfill({ contentType: "font/woff2", body: GEIST }));
  await page.goto(pathToFileURL(join(PREVIEW, "email.html")).href, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
  });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.screenshot({ path: join(PREVIEW, `${name}.png`), fullPage: true });
  console.log(`${lang}/${name}.png`, overflow ? "HORIZONTAL OVERFLOW" : "no horizontal overflow");
  await page.close();
}
await browser.close();
