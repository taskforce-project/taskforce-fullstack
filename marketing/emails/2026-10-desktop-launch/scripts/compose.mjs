// Visuels de l'e-mail, composés à partir des vraies captures de l'interface desktop (captures/*.webp) et des peintures du
// site (landing-page/public/images) : une page HTML par visuel, rendue par Edge sans interface, puis figée en image,
// parce que les clients de messagerie ne savent ni flouter ni superposer. Le GIF est monté par ffmpeg.
// L'en-tête et le générique de fin sont animés à part (scripts/motion.mjs).
//
// Sortie : landing-page/public/email/2026-10-desktop-launch/ (servi par le site sur taskforce-project.fr/email/...).
//   logo.png          logo officiel et nom, pour l'en-tête et le pied
//   demo.gif          board, délégation à Claude Code, note du Brain OS, en fondu (la 1re image suffit sans animation)
//   demo-static.jpg   la scène de délégation, pour la version sans animation
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { GEIST, LOGO_PATH, LOGO_VIEWBOX, OUT, WORK, capture, clean, painting, url } from "./shared.mjs";

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

clean(WORK);
mkdirSync(OUT, { recursive: true });

// Logo : pictogramme et nom, comme l'en-tête du site (nom en Geist semi-gras, approche -0,03 em).
await render("logo", `<div class="stage" style="display:inline-flex;align-items:center;gap:10px;padding:2px 1px;color:#191715">
    <svg viewBox="${LOGO_VIEWBOX}" style="height:17px;width:auto" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="${LOGO_PATH}"/></svg>
    <span style="font-size:17px;font-weight:600;letter-spacing:-0.03em;line-height:1">TaskForce</span>
  </div>`, { width: 200, height: 40, scale: 3, transparent: true });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(WORK, "logo.png"), join(OUT, "logo.png")]);

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
