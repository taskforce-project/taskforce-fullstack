// Visuels de l'e-mail, composés à partir des vraies captures de l'interface desktop (captures/*.webp) et des peintures du
// site (landing-page/public/images) : une page HTML par visuel, rendue par Edge sans interface, puis figée en image,
// parce que les clients de messagerie ne savent ni flouter ni superposer. Le GIF est monté par ffmpeg.
//
// Sortie : landing-page/public/email/2026-10-desktop-launch/ (servi par le site sur taskforce-project.fr/email/...).
//   logo.png          logo officiel et nom, pour l'en-tête
//   hero.jpg          tableau de bord dans une fenêtre de verre, sur la peinture de la page de téléchargement
//   demo.gif          board, délégation à Claude Code, note du Brain OS, en fondu (la 1re image suffit sans animation)
//   demo-static.jpg   la scène de délégation, pour la version sans animation
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "..");
const REPO = resolve(ROOT, "../../..");
const CAPTURES = join(ROOT, "captures");
const PAINTINGS = join(REPO, "landing-page/public/images");
const OUT = join(REPO, "landing-page/public/email/2026-10-desktop-launch");
const WORK = join(ROOT, ".work");

const url = (file) => pathToFileURL(file).href;
const capture = (name) => url(join(CAPTURES, `${name}.webp`));
const painting = (name) => url(join(PAINTINGS, `bg-${name}-1920.webp`));
/** Geist, la police du site (paquet @fontsource-variable/geist, licence SIL OFL), chargée en local : rendu stable. */
const GEIST = url(join(ROOT, "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"));

/** Tracé du logo, le même que landing-page/src/components/site/Logo.astro. */
const LOGO_PATH =
  "M 295.302 130.180 C 288.367 131.232, 281.321 133.995, 275.687 137.871 C 270.921 141.151, 235.210 178.670, 233.593 182.096 C 231.969 185.539, 233.936 185.455, 240.778 181.788 C 244.475 179.807, 250.650 177.160, 254.500 175.906 C 261.252 173.706, 263.165 173.603, 308.500 173.007 C 358.807 172.345, 357.172 172.511, 368.097 166.959 C 373.525 164.200, 404 134.371, 404 131.817 C 404 130.817, 403.663 129.927, 403.250 129.837 C 400.447 129.230, 299.451 129.550, 295.302 130.180 M 268.500 185.116 C 260.296 186.308, 251.710 189.336, 245.826 193.111 C 240.552 196.496, 208 229.691, 208 231.685 C 208 234.229, 210.489 233.990, 224.753 230.080 C 232.864 227.857, 242.650 225.589, 246.500 225.039 C 250.350 224.489, 272.077 224.031, 294.782 224.020 C 348.983 223.994, 345.904 224.948, 368.630 201.140 C 375.433 194.012, 381 187.513, 381 186.697 C 381 185.881, 380.288 184.941, 379.418 184.607 C 376.966 183.666, 275.264 184.133, 268.500 185.116 M 245.798 237.923 C 242.661 238.930, 238.088 240.930, 235.635 242.368 C 231.238 244.945, 209.192 267.489, 205.744 272.935 C 202.511 278.042, 203.673 278.223, 236.710 277.771 C 269.622 277.321, 270.882 277.112, 280.500 270.516 C 286.603 266.331, 310.500 240.602, 310.500 238.216 C 310.500 236.638, 308.128 236.484, 281 236.296 C 254.795 236.115, 250.863 236.297, 245.798 237.923";

const HEAD = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @font-face { font-family: Geist; src: url("${GEIST}") format("woff2"); font-weight: 100 900; font-style: normal; }
  html, body { margin: 0; background: transparent; }
  body { font-family: Geist, system-ui, sans-serif; color: #191715; }
  .stage { position: relative; overflow: hidden; }
  .paint { position: absolute; inset: -24px; background-size: cover; background-repeat: no-repeat; }
  .halo { position: absolute; left: 50%; transform: translateX(-50%); border-radius: 50%;
          background: radial-gradient(closest-side, rgba(255,255,255,.62), rgba(255,255,255,0)); }
  .glass { position: absolute; border-radius: 18px; background: rgba(255,255,255,.26);
           backdrop-filter: blur(16px) saturate(1.5); border: 1px solid rgba(255,255,255,.6);
           box-shadow: inset 0 1px 0 rgba(255,255,255,.75), 0 44px 80px -24px rgba(18,24,38,.55),
                       0 14px 28px -14px rgba(18,24,38,.4); }
  .shot { display: block; border-radius: 10px; box-shadow: 0 0 0 1px rgba(17,24,39,.10); }
  .viewport { position: relative; overflow: hidden; border-radius: 10px; background: #fff;
              box-shadow: 0 0 0 1px rgba(17,24,39,.10); }
  .viewport img { position: absolute; transform-origin: 0 0; }
</style></head><body>`;

const browser = await chromium.launch({ channel: "msedge" });

/** Rend `body` dans une page de `width` x `height` (px CSS) et l'enregistre ; `element` limite la capture. */
async function render(name, body, { width, height, scale, element = ".stage", type = "png", quality, transparent }) {
  const file = join(WORK, `${name}.html`);
  writeFileSync(file, `${HEAD}${body}</body></html>`);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  // Prêt quand la police et les images le sont (attendre que le réseau se taise échouait une fois sur deux).
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url(file), { waitUntil: "load", timeout: 60_000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
      });
      break;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
  await page.waitForTimeout(300);
  const path = join(type === "jpeg" ? OUT : WORK, `${name}.${type === "jpeg" ? "jpg" : "png"}`);
  await page.locator(element).screenshot({ path, type, quality, omitBackground: transparent });
  await page.close();
  return path;
}

/** Fenêtre de verre sur une peinture : `inner` est la capture, entière ou recadrée. */
function scene({ width, height, paint, position, glass, inner, halo }) {
  return `<div class="stage" style="width:${width}px;height:${height}px">
    <div class="paint" style="background-image:url('${painting(paint)}');background-position:${position}"></div>
    <div class="halo" style="top:${halo.top}px;width:${halo.width}px;height:${halo.height}px"></div>
    <div class="glass" style="left:${glass.left}px;top:${glass.top}px;padding:${glass.padding}px">${inner}</div>
  </div>`;
}

/** Partie d'une capture (repère de l'interface, 1440 x 900 px CSS), agrandie de `zoom`, dans une vue de w x h. */
function crop(name, { x, y, w, h, zoom = 1 }) {
  return `<div class="viewport" style="width:${w}px;height:${h}px">
    <img src="${capture(name)}" style="width:1440px;height:900px;left:${-x * zoom}px;top:${-y * zoom}px;transform:scale(${zoom})">
  </div>`;
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

// Logo : pictogramme et nom, comme l'en-tête du site (nom en Geist semi-gras, approche -0,03 em).
await render("logo", `<div class="stage" style="display:inline-flex;align-items:center;gap:10px;padding:2px 1px;color:#191715">
    <svg viewBox="200 124 210 160" style="height:17px;width:auto" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${LOGO_PATH}"/></svg>
    <span style="font-size:17px;font-weight:600;letter-spacing:-0.03em;line-height:1">TaskForce</span>
  </div>`, { width: 200, height: 40, scale: 3, transparent: true });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(WORK, "logo.png"), join(OUT, "logo.png")]);

// Visuel principal : le tableau de bord, fenêtre entière, qui sort par le bas du cadre.
await render("hero", scene({
  width: 640, height: 400, paint: "download", position: "50% 62%",
  halo: { top: 18, width: 640, height: 300 },
  glass: { left: 34, top: 58, padding: 9 },
  inner: `<img class="shot" src="${capture("dashboard")}" style="width:554px">`,
}), { width: 640, height: 400, scale: 2, type: "jpeg", quality: 84 });

// Démo : trois scènes à la taille réelle de l'interface, pour qu'elle reste lisible.
const SCENES = [
  { name: "board", view: { x: 248, y: 92, w: 536, h: 330, zoom: 0.85 } },
  { name: "delegate", view: { x: 1062, y: 64, w: 536, h: 330, zoom: 1.34 } },
  { name: "brain-note", view: { x: 598, y: 228, w: 536, h: 330, zoom: 0.78 } },
];
const demo = (name, view) => scene({
  width: 600, height: 352, paint: "agents", position: "50% 45%",
  halo: { top: 6, width: 600, height: 280 },
  glass: { left: 24, top: 26, padding: 8 },
  inner: crop(name, view),
});
for (const { name, view } of SCENES) {
  await render(`demo-${name}`, demo(name, view), { width: 600, height: 352, scale: 1 });
}
await render("demo-static", demo("delegate", SCENES[1].view), { width: 600, height: 352, scale: 2, type: "jpeg", quality: 84 });

await browser.close();

// GIF : chaque scène 2,6 s, fondus de 0,5 s, retour à la première pour boucler sans saut.
const frames = SCENES.map(({ name }) => join(WORK, `demo-${name}.png`));
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-loop", "1", "-t", "3.1", "-i", frames[0],
  "-loop", "1", "-t", "3.1", "-i", frames[1],
  "-loop", "1", "-t", "3.1", "-i", frames[2],
  "-loop", "1", "-t", "0.5", "-i", frames[0],
  "-filter_complex",
  "[0][1]xfade=transition=fade:duration=0.5:offset=2.6[a];" +
  "[a][2]xfade=transition=fade:duration=0.5:offset=5.2[b];" +
  "[b][3]xfade=transition=fade:duration=0.5:offset=7.8,fps=12,split[x][y];" +
  "[x]palettegen=max_colors=256:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
  "-loop", "0", join(OUT, "demo.gif"),
]);
console.log("visuals written to", OUT);
