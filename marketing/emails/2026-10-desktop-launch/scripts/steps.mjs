// Animation des trois étapes d'installation (télécharger, installer, se connecter), dans la DA du site : pastilles
// empilées, reliées par une ligne qui se remplit en cobalt ; l'étape en cours s'active avec une onde, puis se coche.
// Verticale et étroite (300 px), elle reste lisible à sa taille réelle sur un téléphone. Rendue image par image dans
// Edge (état calculé pour chaque instant t), puis montée en GIF par ffmpeg. La première image montre les trois étapes
// lisibles et la première active (Outlook n'affiche qu'elle) ; la version fixe montre les trois étapes actives.
//
// Sortie (landing-page/public/email/2026-10-desktop-launch/) : steps-<langue>.gif et steps-<langue>.png.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "../../../landing-page/public/email/2026-10-desktop-launch");
const WORK = join(ROOT, ".work", "steps");
const GEIST = pathToFileURL(join(ROOT, "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2")).href;

const WIDTH = 300;
const HEIGHT = 206;
/** Haut de chaque rangée ; pastilles de 36 px, à 22 px du bord gauche. */
const ROWS = [22, 85, 148];
const NODE = 36;
const LEFT = 22;
const FPS = 15;
const LOOP = 6.4;

/** Icônes Lucide, celles du site et de l'app (download, package, log-in, check). */
const ICONS = {
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
  login: '<path d="m10 17 5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};

const STEPS = {
  fr: [
    { icon: "download", title: "Télécharger", sub: "TaskForce-Setup-1.2.1.exe", mono: true },
    { icon: "package", title: "Installer", sub: "Sans droits d'administrateur" },
    { icon: "login", title: "Se connecter", sub: "Avec votre compte TaskForce" },
  ],
  en: [
    { icon: "download", title: "Download", sub: "TaskForce-Setup-1.2.1.exe", mono: true },
    { icon: "package", title: "Install", sub: "No administrator rights" },
    { icon: "login", title: "Sign in", sub: "With your TaskForce account" },
  ],
};

const svg = (name, color) =>
  `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

function page(steps) {
  const center = LEFT + NODE / 2;
  const rows = steps.map((step, i) => `
    <div class="row" style="top:${ROWS[i]}px">
      <div class="node" id="node${i}">
        <div class="ring" id="ring${i}"></div>
        <div class="face idle">${svg(step.icon, "#57534d")}</div>
        <div class="face active" id="active${i}">${svg(step.icon, "#ffffff")}</div>
        <div class="face done" id="done${i}">${svg("check", "#2f6bf6")}</div>
      </div>
      <div class="text">
        <div class="title"><span class="num">${i + 1}</span>${step.title}</div>
        <div class="sub${step.mono ? " mono" : ""}">${step.sub}</div>
      </div>
    </div>`).join("");
  const links = [0, 1].map((i) => {
    const top = ROWS[i] + NODE + 5;
    const height = ROWS[i + 1] - 5 - top;
    return `<div class="track" style="left:${center - 1}px;top:${top}px;height:${height}px"></div>
      <div class="fill" id="fill${i}" style="left:${center - 1}px;top:${top}px;height:0" data-span="${height}"></div>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Geist; src: url("${GEIST}") format("woff2"); font-weight: 100 900; }
    html, body { margin: 0; background: #ffffff; }
    .stage { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #ffffff;
             font-family: Geist, system-ui, sans-serif; }
    .panel { position: absolute; inset: 0; border-radius: 16px; background: #faf9f7; border: 1px solid #e9e7e3; }
    .track, .fill { position: absolute; width: 2px; border-radius: 2px; }
    .track { background: #e9e7e3; }
    .fill { background: #2f6bf6; }
    .row { position: absolute; left: ${LEFT}px; right: 16px; height: ${NODE}px; display: flex; align-items: center; gap: 14px; }
    .node { position: relative; flex: none; width: ${NODE}px; height: ${NODE}px; }
    .ring { position: absolute; inset: 0; border-radius: 50%; background: rgba(47,107,246,.2); opacity: 0; }
    .face { position: absolute; inset: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .idle { background: #ffffff; box-shadow: inset 0 0 0 1px #dcdad5; }
    .active { background: #2f6bf6; box-shadow: 0 6px 14px -6px rgba(47,107,246,.6); opacity: 0; }
    .done { background: #eef3ff; box-shadow: inset 0 0 0 1px #c9d8fd; opacity: 0; }
    .title { font-size: 15px; line-height: 19px; font-weight: 600; letter-spacing: -0.2px; color: #191715; }
    .num { display: inline-block; min-width: 14px; margin-right: 6px; color: #2f6bf6; font-weight: 600; }
    .sub { margin-top: 2px; padding-left: 20px; font-size: 13px; line-height: 17px; color: #57534d; }
    .mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; color: #191715; }
  </style></head><body><div class="stage">
    <div class="panel"></div>
    ${links}
    ${rows}
  </div>
  <script>
    const clamp = (x) => Math.max(0, Math.min(1, x));
    const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
    // Étape i : active de 1,5 i s à 1,5 (i + 1) s, cochée ensuite (la dernière à 4,5 s) ; tout revient au départ, la
    // première étape active, pendant les 0,4 dernières secondes : la boucle repart sans saut.
    window.frame = (t, still) => {
      const reset = still ? 0 : clamp((t - ${LOOP - 0.4}) / 0.4);
      for (let i = 0; i < 3; i++) {
        const start = i * 1.5;
        const end = i < 2 ? start + 1.5 : 4.5;
        const on = still || i === 0 ? 1 : ease((t - start) / 0.2);
        const done = still ? 0 : ease((t - end) / 0.2);
        const keep = 1 - reset;
        document.getElementById("active" + i).style.opacity = Math.max(0, on - done) * keep + (i === 0 ? reset : 0);
        document.getElementById("done" + i).style.opacity = done * keep;
        const pulsing = !still && t >= start && t < end;
        const phase = pulsing ? ((t - start) % 0.75) / 0.75 : 0;
        const ring = document.getElementById("ring" + i);
        ring.style.opacity = pulsing ? (1 - phase) * 0.9 : 0;
        ring.style.transform = "scale(" + (1 + phase * 0.6) + ")";
        const pop = pulsing && i > 0 && t - start < 0.25 ? 0.9 + 0.1 * ease((t - start) / 0.25) : 1;
        document.getElementById("node" + i).style.transform = "scale(" + pop + ")";
      }
      for (let i = 0; i < 2; i++) {
        const fill = document.getElementById("fill" + i);
        const grow = still ? 1 : ease((t - (i * 1.5 + 0.6)) / 0.8) * (1 - reset);
        fill.style.height = grow * Number(fill.dataset.span) + "px";
      }
    };
  </script></body></html>`;
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });

for (const [lang, steps] of Object.entries(STEPS)) {
  const file = join(WORK, `steps-${lang}.html`);
  writeFileSync(file, page(steps));
  const tab = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
  await tab.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await tab.evaluate(() => document.fonts.ready);

  const frames = join(WORK, lang);
  mkdirSync(frames, { recursive: true });
  const count = Math.round(LOOP * FPS);
  for (let n = 0; n < count; n++) {
    await tab.evaluate((t) => window.frame(t, false), n / FPS);
    await tab.locator(".stage").screenshot({ path: join(frames, `${String(n).padStart(3, "0")}.png`) });
  }
  await tab.evaluate(() => window.frame(0, true));
  await tab.locator(".stage").screenshot({ path: join(OUT, `steps-${lang}.png`) });
  await tab.close();

  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%03d.png"),
    "-filter_complex", "split[x][y];[x]palettegen=max_colors=128:stats_mode=diff[p];[y][p]paletteuse=dither=none:diff_mode=rectangle",
    "-loop", "0", join(OUT, `steps-${lang}.gif`),
  ]);
  console.log(`steps-${lang}.gif and steps-${lang}.png written`);
}
await browser.close();
