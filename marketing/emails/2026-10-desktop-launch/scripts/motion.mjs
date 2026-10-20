// Animations de l'e-mail, dans la DA du site (peintures, verre dépoli, Geist, cobalt) :
//   hero.gif    l'en-tête : sur la peinture de la page de téléchargement, le curseur clique TaskForce dans la barre
//               des tâches, la fenêtre s'ouvre depuis l'icône et le tableau de bord se remplit, un reflet court sur le
//               verre, puis la fenêtre se ferme et la boucle reprend
//   end.gif     le générique de fin : l'icône de TaskForce se pose sur la peinture de la bande finale du site, ses
//               trois barres entrent avec un flou de mouvement, le nom se dévoile, puis tout repart
// Chaque animation est une page dont l'état est calculé pour chaque instant t (window.frame(t)), rendue image par image
// dans Edge, puis montée en GIF par ffmpeg. Une image fixe de chacune (hero.jpg, end.jpg), l'état complet, sert à
// Outlook sur Windows, qui n'affiche que la première image d'un GIF, et à la version sans animation.
// Aussi : windows.png, le logo Windows en blanc pour les boutons (le tracé du site, landing-page/public/logos/windows.svg).
//
// Sortie : landing-page/public/email/2026-10-desktop-launch/.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { GEIST, LOGO_PATH, LOGO_VIEWBOX, OUT, WORK as WORK_ROOT, capture, clean, painting, url } from "./shared.mjs";

const WORK = join(WORK_ROOT, "motion");
const FPS = 20;

/** Courbes, reprises telles quelles dans chaque page. */
const EASING = `
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, p) => a + (b - a) * p;
  const outCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const inOutCubic = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const outExpo = (x) => { x = clamp(x); return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); };
  const inExpo = (x) => { x = clamp(x); return x === 0 ? 0 : Math.pow(2, 10 * x - 10); };
  const outBack = (x) => { x = clamp(x); return 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2); };
  const $ = (id) => document.getElementById(id);
`;

function page(css, body, script) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Geist; src: url("${GEIST}") format("woff2"); font-weight: 100 900; }
    html, body { margin: 0; background: transparent; }
    body { font-family: Geist, system-ui, sans-serif; color: #191715; }
    .stage { position: relative; overflow: hidden; }
    .paint { position: absolute; left: -24px; top: -24px; width: calc(100% + 48px); height: calc(100% + 48px);
             object-fit: cover; }
    ${css}
  </style></head><body>${body}<script>${EASING}${script}</script></body></html>`;
}

/** Verre dépoli du site : fond blanc translucide, flou de ce qui est derrière, liseré clair, ombre portée. */
const GLASS = `background: rgba(255,255,255,.26); backdrop-filter: blur(16px) saturate(1.5);
  border: 1px solid rgba(255,255,255,.6);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.75), 0 44px 80px -24px rgba(18,24,38,.55), 0 14px 28px -14px rgba(18,24,38,.4);`;

// ---------------------------------------------------------------------------------------------------------------------
// En-tête : l'app s'ouvre depuis la barre des tâches.

const HERO = { width: 640, height: 400, duration: 6.2, still: 4 };
/** Fenêtre : la capture du tableau de bord sur 554 px, dans le verre, qui sort par le bas comme avant. */
const WIN = { left: 34, top: 58, pad: 9, width: 554 };
const K = WIN.width / 1440;
const SCREEN_H = 900 * K;
const BAR = { top: 360, height: 40 };
const SLOT = 30;
const GAP = 6;
const APPS = ["start", "search", "files", "browser", "taskforce", "mail"];
const slotLeft = (i) => (HERO.width - (APPS.length * SLOT + (APPS.length - 1) * GAP)) / 2 + i * (SLOT + GAP);
const TF = APPS.indexOf("taskforce");
const ICON = { x: slotLeft(TF) + SLOT / 2, y: BAR.top + BAR.height / 2 };
/** Blocs de l'interface qui arrivent l'un après l'autre, une fois la fenêtre posée (repère de la capture, px CSS) :
 *  barre latérale, barre du haut, accueil et recherche, les trois cartes, les statistiques. Avant, la fenêtre est une
 *  coquille vide, de la couleur du fond sous chaque bloc (`bg`) : agrandir une coquille unie pèse peu dans le GIF. */
const PARTS = [
  { x: 12, y: 12, w: 232, h: 876, at: 1.3, bg: "#fbf9f7" },
  { x: 264, y: 12, w: 1162, h: 50, at: 1.34 },
  { x: 500, y: 98, w: 690, h: 194, at: 1.4 },
  { x: 285, y: 306, w: 367, h: 321, at: 1.48 },
  { x: 660, y: 306, w: 368, h: 321, at: 1.54 },
  { x: 1036, y: 306, w: 367, h: 321, at: 1.6 },
  { x: 285, y: 640, w: 1118, h: 250, at: 1.68 },
];

/** Icônes de la barre : démarrer (quatre carreaux), recherche, fichiers, navigateur, TaskForce, courrier (Lucide). */
const APP_ICONS = {
  start: `<svg viewBox="0 0 20 20" width="17" height="17"><defs><linearGradient id="gs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3fb6ff"/><stop offset="1" stop-color="#0b63d8"/></linearGradient></defs><g fill="url(#gs)"><rect x="1" y="1" width="8.5" height="8.5" rx="1.2"/><rect x="10.5" y="1" width="8.5" height="8.5" rx="1.2"/><rect x="1" y="10.5" width="8.5" height="8.5" rx="1.2"/><rect x="10.5" y="10.5" width="8.5" height="8.5" rx="1.2"/></g></svg>`,
  search: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#3d3934" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>`,
  files: `<svg viewBox="0 0 24 24" width="20" height="20"><defs><linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd760"/><stop offset="1" stop-color="#f0a417"/></linearGradient></defs><path fill="url(#gf)" d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,
  browser: `<svg viewBox="0 0 24 24" width="19" height="19"><defs><linearGradient id="gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#43d1c6"/><stop offset="1" stop-color="#1769e0"/></linearGradient></defs><circle cx="12" cy="12" r="10" fill="url(#gb)"/><g fill="none" stroke="#fff" stroke-width="1.5" opacity=".9"><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2.5 12h19"/></g></svg>`,
  taskforce: `<div class="tf"><svg viewBox="${LOGO_VIEWBOX}" width="15"><path fill="#191715" fill-rule="evenodd" d="${LOGO_PATH}"/></svg></div>`,
  mail: `<svg viewBox="0 0 24 24" width="20" height="20"><defs><linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5eb0ff"/><stop offset="1" stop-color="#1f6fe0"/></linearGradient></defs><rect x="2" y="4.5" width="20" height="15" rx="2.5" fill="url(#gm)"/><path d="m3 7 8 5.4a1.8 1.8 0 0 0 2 0L21 7" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
/** Flèche de Windows ; la pointe est en (1, 1). */
const CURSOR = `<svg viewBox="0 0 14 22" width="14" height="22"><path d="M1 1v16.5l4-3.7 3 6.7 2.6-1.1-2.9-6.5H13z" fill="#fff" stroke="#111" stroke-width="1.1" stroke-linejoin="round"/></svg>`;

function heroPage() {
  const shot = `<img src="${capture("dashboard")}" style="width:${WIN.width}px;height:${SCREEN_H}px">`;
  const box = ({ x, y, w, h }) => `left:${x * K}px;top:${y * K}px;width:${w * K}px;height:${h * K}px`;
  const masks = PARTS.map((part) => `<div class="mask" style="${box(part)};background:${part.bg ?? "#fff"}"></div>`).join("");
  const parts = PARTS.map((part) => `<div class="part" data-at="${part.at}" style="${box(part)}">
      <img src="${capture("dashboard")}" style="left:${-part.x * K}px;top:${-part.y * K}px;width:${WIN.width}px;height:${SCREEN_H}px">
    </div>`).join("");
  const slots = APPS.map((app, i) => `<div class="slot" style="left:${slotLeft(i)}px">
      ${i === TF ? '<div class="hover" id="hover"></div>' : ""}
      <div class="icon"${i === TF ? ' id="tf"' : ""}>${APP_ICONS[app]}</div>
    </div>`).join("");

  return page(`
    .halo { position: absolute; left: 0; top: 18px; width: ${HERO.width}px; height: 300px; border-radius: 50%;
            background: radial-gradient(closest-side, rgba(255,255,255,.62), rgba(255,255,255,0)); }
    .win { position: absolute; left: ${WIN.left}px; top: ${WIN.top}px; }
    .glass { position: relative; overflow: hidden; border-radius: 18px; padding: ${WIN.pad}px; ${GLASS} }
    .glint { position: absolute; left: 0; top: -40px; width: 120px; height: 460px; opacity: 0;
             background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.95) 50%, rgba(255,255,255,0)); }
    .screen { position: relative; overflow: hidden; width: ${WIN.width}px; height: ${SCREEN_H}px; border-radius: 10px;
              background: #fff; box-shadow: 0 0 0 1px rgba(17,24,39,.10); }
    .screen img { position: absolute; left: 0; top: 0; }
    .mask { position: absolute; }
    .part { position: absolute; overflow: hidden; }
    .bar { position: absolute; left: 0; right: 0; top: ${BAR.top}px; height: ${BAR.height}px;
           background: rgba(246,245,243,.72); backdrop-filter: blur(24px) saturate(1.5);
           border-top: 1px solid rgba(255,255,255,.8); box-shadow: 0 -10px 30px -18px rgba(18,24,38,.35); }
    .slot { position: absolute; top: ${(BAR.height - SLOT) / 2}px; width: ${SLOT}px; height: ${SLOT}px;
            display: flex; align-items: center; justify-content: center; }
    .hover { position: absolute; inset: 0; border-radius: 6px; background: rgba(255,255,255,.85);
             box-shadow: inset 0 0 0 1px rgba(17,24,39,.06); opacity: 0; }
    .icon { position: relative; display: flex; }
    .tf { width: 22px; height: 22px; border-radius: 6px; background: #fff; display: flex; align-items: center;
          justify-content: center; box-shadow: 0 0 0 1px rgba(17,24,39,.14), 0 2px 4px -2px rgba(17,24,39,.3); }
    .run { position: absolute; bottom: 2px; height: 3px; width: 0; border-radius: 2px; background: #2f6bf6;
           transform: translateX(-50%); }
    .ripple { position: absolute; width: 34px; height: 34px; border-radius: 50%; border: 2px solid #2f6bf6;
              box-sizing: border-box; opacity: 0; }
    .cursor { position: absolute; left: 0; top: 0; transform-origin: 1px 1px; opacity: 0; }
  `, `<div class="stage" style="width:${HERO.width}px;height:${HERO.height}px">
    <img class="paint" src="${painting("download")}" style="object-position:50% 62%">
    <div class="halo"></div>
    <div class="win" id="win">
      <div class="glass" id="glass"><div class="glint" id="glint"></div><div class="screen">${shot}${masks}${parts}</div></div>
    </div>
    <div class="bar">${slots}<div class="run" id="run" style="left:${ICON.x}px"></div></div>
    <div class="ripple" id="ripple" style="left:${ICON.x - 17}px;top:${ICON.y - 17}px"></div>
    <div class="cursor" id="cursor">${CURSOR}</div>
  </div>`, `
    const ICON = ${JSON.stringify(ICON)};
    const FROM_ICON = "${ICON.x - WIN.left}px ${ICON.y - WIN.top}px";
    const [win, glass, glint, hover, tf, run, ripple, cursor] =
      ["win", "glass", "glint", "hover", "tf", "run", "ripple", "cursor"].map($);
    const parts = [...document.querySelectorAll(".part")];
    window.frame = (t) => {
      // Le curseur glisse jusqu'à TaskForce, clique à 0,85 s, puis s'efface.
      const glide = inOutCubic(span(t, 0.15, 0.8));
      const x = lerp(560, ICON.x, glide);
      const y = lerp(318, ICON.y, glide);
      const click = t >= 0.85 && t < 0.95;
      cursor.style.opacity = span(t, 0.05, 0.2) * (1 - span(t, 1.5, 1.8));
      cursor.style.transform = "translate(" + (x - 1) + "px," + (y - 1) + "px) scale(" + (click ? 0.88 : 1) + ")";
      hover.style.opacity = span(t, 0.65, 0.8) * (1 - span(t, 1.3, 1.6));
      const press = t < 0.85 ? 1 : t < 0.95 ? lerp(1, 0.84, span(t, 0.85, 0.91)) : lerp(0.84, 1, outBack(span(t, 0.95, 1.25)));
      tf.style.transform = "scale(" + press + ")";
      const wave = span(t, 0.9, 1.45);
      ripple.style.opacity = wave > 0 && wave < 1 ? 0.55 * (1 - wave) : 0;
      ripple.style.transform = "scale(" + (0.6 + 1.2 * outCubic(wave)) + ")";
      // La fenêtre sort de l'icône en moins d'une demi-seconde et se ferme d'un coup à 5,6 s, comme sous Windows ;
      // l'indicateur sous l'icône la suit. Transitions courtes : tout ce qui bouge sur la peinture alourdit le GIF.
      const grow = outExpo(span(t, 0.95, 1.4));
      const open = grow > 0.995 ? 1 : grow;
      const shut = span(t, 5.6, 5.7);
      run.style.width = 16 * outCubic(span(t, 0.98, 1.25)) * (1 - shut) + "px";
      if (t < 5.6) {
        win.style.transformOrigin = FROM_ICON;
        win.style.transform = "perspective(1400px) rotateX(" + 6 * (1 - open) + "deg) scale(" + lerp(0.3, 1, open) + ")";
      } else {
        win.style.transformOrigin = "50% 40%";
        win.style.transform = "scale(" + lerp(1, 0.96, shut) + ")";
      }
      glass.style.opacity = span(t, 0.95, 1.05) * (1 - shut);
      // Le tableau de bord se remplit, bloc après bloc.
      for (const part of parts) {
        const p = outCubic(span(t, Number(part.dataset.at), Number(part.dataset.at) + 0.4));
        part.style.opacity = p;
        part.style.transform = "translateY(" + (1 - p) * 10 + "px)";
      }
      // Un reflet court sur le cadre de verre.
      const g = span(t, 1.9, 2.7);
      glint.style.opacity = g > 0 && g < 1 ? 1 : 0;
      glint.style.transform = "translateX(" + lerp(-160, 720, inOutCubic(g)) + "px) skewX(-20deg)";
    };
  `);
}

// ---------------------------------------------------------------------------------------------------------------------
// Générique de fin : l'icône de TaskForce sur la peinture de la bande finale du site. Le GIF commence à 2,6 s, sur
// l'icône complète : c'est ce que montre un client qui n'anime pas, et la boucle reste la même.

const END = { width: 640, height: 260, duration: 6.4, still: 3, start: 2.6 };
const TILE = 92;
/** Les trois barres du logo, une par sous-tracé, de haut en bas. */
const BARS = LOGO_PATH.split(/ (?=M )/);
/** Course des barres, en unités du tracé (210 unités pour 48 px). */
const TRAVEL = 300;

function endPage() {
  const bars = BARS.map((d, i) => `<filter id="blur${i}" x="-100%" y="-20%" width="300%" height="140%">
      <feGaussianBlur id="dev${i}" stdDeviation="0 0"/></filter>
    <path id="bar${i}" fill="#191715" d="${d}" filter="url(#blur${i})"/>`).join("");
  return page(`
    .veil { position: absolute; left: 50%; top: -10px; width: 600px; height: 250px; transform: translateX(-50%);
            border-radius: 50%; background: radial-gradient(closest-side, rgba(255,255,255,.6), rgba(255,255,255,0)); }
    .tile { position: absolute; left: ${(END.width - TILE) / 2}px; top: 30px; width: ${TILE}px; height: ${TILE}px;
            border-radius: 24px; overflow: hidden; opacity: 0;
            background: rgba(255,255,255,.5); backdrop-filter: blur(14px) saturate(1.4); border: 1px solid rgba(255,255,255,.8);
            box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 26px 44px -18px rgba(44,48,80,.5), 0 8px 16px -8px rgba(44,48,80,.35); }
    .mark { position: absolute; left: 50%; top: 50%; width: 48px; transform: translate(-50%, -50%); overflow: visible; }
    .glint { position: absolute; top: -30px; height: 160px; width: 34px; left: 0; opacity: 0;
             background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.95), rgba(255,255,255,0)); }
    .label { position: absolute; left: 0; right: 0; top: 140px; text-align: center; font-size: 26px; line-height: 32px;
             font-weight: 600; letter-spacing: -0.03em; color: #191715; opacity: 0; }
  `, `<div class="stage" style="width:${END.width}px;height:${END.height}px">
    <img class="paint" src="${painting("end")}" style="object-position:50% 4%">
    <div class="veil"></div>
    <div class="tile" id="tile">
      <svg class="mark" viewBox="${LOGO_VIEWBOX}" aria-hidden="true">${bars}</svg>
      <div class="glint" id="glint"></div>
    </div>
    <div class="label" id="label">TaskForce</div>
  </div>`, `
    const bars = [0, 1, 2].map((i) => $("bar" + i));
    const devs = [0, 1, 2].map((i) => $("dev" + i));
    const [tile, glint, label] = ["tile", "glint", "label"].map($);
    // Position d'une barre : entre par la gauche (0,32 s, décalées de 0,09 s), sort par la droite (5,35 s).
    const offset = (t, i) =>
      -${TRAVEL} * (1 - outExpo(span(t, 0.32 + 0.09 * i, 0.92 + 0.09 * i))) +
      ${TRAVEL} * inExpo(span(t, 5.35 + 0.06 * i, 5.7 + 0.06 * i));
    window.frame = (t) => {
      const leave = outCubic(span(t, 5.6, 5.95));
      tile.style.opacity = span(t, 0, 0.3) * (1 - leave);
      tile.style.transform = "translateY(" + (1 - outCubic(span(t, 0, 0.55))) * 12 + "px) scale(" +
        lerp(0.9, 1, outBack(span(t, 0, 0.55))) * lerp(1, 0.94, leave) + ")";
      bars.forEach((bar, i) => {
        const dx = offset(t, i);
        // Flou de mouvement : proportionnel au chemin parcouru depuis l'image précédente.
        const blur = Math.min(60, Math.abs(dx - offset(t - 1 / ${FPS}, i)) * 0.45);
        bar.setAttribute("transform", "translate(" + dx + " 0)");
        devs[i].setAttribute("stdDeviation", blur + " 0");
      });
      const name = outCubic(span(t, 0.85, 1.4));
      label.style.opacity = name * (1 - outCubic(span(t, 5.5, 5.8)));
      label.style.clipPath = "inset(-10px " + (1 - name) * 100 + "% -10px 0)";
      label.style.transform = "translateY(" + (1 - name) * 6 + "px)";
      const g = span(t, 1.8, 2.5);
      glint.style.opacity = g > 0 && g < 1 ? 0.8 : 0;
      glint.style.transform = "translateX(" + lerp(-60, 130, inOutCubic(g)) + "px) skewX(-20deg)";
    };
  `);
}

// ---------------------------------------------------------------------------------------------------------------------

const browser = await chromium.launch({ channel: "msedge" });

async function open(file, { width, height }, scale) {
  const tab = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  // Prête quand la police et les images le sont ; trois essais, le chargement local échoue parfois.
  for (let attempt = 1; ; attempt++) {
    try {
      await tab.goto(url(file), { waitUntil: "load", timeout: 60_000 });
      await tab.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
      });
      return tab;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

/** Rend l'animation image par image à 1x (le GIF, qui commence à `start` dans la boucle), son état complet à 2x (la
 *  version fixe), puis monte le GIF. */
async function animate(name, html, size) {
  const file = join(WORK, `${name}.html`);
  writeFileSync(file, html);
  const frames = join(WORK, name);
  mkdirSync(frames, { recursive: true });

  const tab = await open(file, size, 1);
  const count = Math.round(size.duration * FPS);
  for (let n = 0; n < count; n++) {
    await tab.evaluate((t) => window.frame(t), ((size.start ?? 0) + n / FPS) % size.duration);
    await tab.locator(".stage").screenshot({ path: join(frames, `${String(n).padStart(4, "0")}.png`) });
  }
  await tab.close();

  const still = await open(file, size, 2);
  await still.evaluate((t) => window.frame(t), size.still);
  await still.locator(".stage").screenshot({ path: join(OUT, `${name}.jpg`), type: "jpeg", quality: 84 });
  await still.close();

  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%04d.png"),
    "-filter_complex",
    "split[x][y];[x]palettegen=max_colors=256:stats_mode=full[p];[y][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    "-loop", "0", join(OUT, `${name}.gif`),
  ]);
  console.log(`${name}.gif (${count} images) and ${name}.jpg written`);
}

clean(WORK);

await animate("hero", heroPage(), HERO);
await animate("end", endPage(), END);

// Logo Windows des boutons : blanc, fond transparent, 16 px affichés (48 px pour les écrans denses).
const windowsFile = join(WORK, "windows.html");
writeFileSync(windowsFile, page("", `<div class="stage" style="width:16px;height:16px">
    <svg viewBox="0 0 88 88" width="16" height="16" style="display:block"><path fill="#ffffff" d="m0 12.402 35.687-4.86.016 34.423-35.67.203zm35.67 33.529.028 34.453L.028 75.48.026 45.7zm4.326-39.025L87.314 0v41.527l-47.318.376zm47.329 39.349-.011 41.34-47.318-6.678-.066-34.739z"/></svg>
  </div>`, "window.frame = () => {};"));
const windows = await open(windowsFile, { width: 16, height: 16 }, 3);
await windows.locator(".stage").screenshot({ path: join(OUT, "windows.png"), omitBackground: true });
await windows.close();
console.log("windows.png written");

await browser.close();
