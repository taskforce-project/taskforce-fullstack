/* global window, document, requestAnimationFrame, cancelAnimationFrame, IntersectionObserver, NodeFilter */
/**
 * Mouvement du site, en JavaScript simple (le Vite du conteneur Docker de dev lit les scripts sans TypeScript) :
 *
 * - [data-words] : le titre se lève mot par mot quand il entre à l'écran ; [data-words="load"] dès le chargement.
 * - [data-parallax="0.1"] : la couche défile moins vite que la page (fonds peints), d'au plus `0.1` x sa hauteur.
 * - [data-tilt] : la fenêtre de l'app se redresse en arrivant au milieu de l'écran (variable --tilt de 0 à 1).
 * - [data-fill] : le texte s'éclaire mot après mot pendant qu'on le lit en faisant défiler la page.
 *
 * Une seule boucle de défilement (requestAnimationFrame), qui ne touche que ce qui est à l'écran, et seulement des
 * transform et des opacités. Relancé à chaque page de la navigation sans rechargement. Si l'utilisateur réduit les
 * animations, tout est posé dans son état final.
 */

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Enveloppe chaque mot d'un élément (en gardant ses sous-éléments, comme l'accent bleu) pour l'animer seul. Les mots
 * découpés sont cachés aux lecteurs d'écran, qui lisent à la place une copie du texte entier masquée à l'écran : un
 * aria-label ne vaudrait pas pour un paragraphe ([data-fill]).
 */
function splitWords(el) {
  if (el.dataset.split === "1") return;
  el.dataset.split = "1";
  // innerText garde l'espace entre deux lignes en bloc (« agents. Keep »), que textContent colle.
  const text = (el.innerText || el.textContent).replace(/\s+/g, " ").trim();
  let i = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const node of texts) {
    const parts = node.textContent.split(/(\s+)/);
    if (parts.every((p) => !p.trim())) continue;
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (!part) continue;
      if (!part.trim()) {
        frag.append(document.createTextNode(part));
        continue;
      }
      const outer = document.createElement("span");
      outer.className = "mw";
      outer.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span");
      inner.className = "mwi";
      inner.style.setProperty("--i", String(i++));
      inner.textContent = part;
      outer.append(inner);
      frag.append(outer);
    }
    node.replaceWith(frag);
  }
  const copy = document.createElement("span");
  copy.className = "sr-only";
  copy.textContent = text;
  el.prepend(copy);
  el.style.setProperty("--words", String(i));
}

let cleanup = () => {};

function init() {
  cleanup();
  const root = document.documentElement;
  const still = reduced();

  // Titres mot par mot.
  const wordEls = [...document.querySelectorAll("[data-words]")];
  wordEls.forEach(splitWords);
  const fillEls = [...document.querySelectorAll("[data-fill]")];
  fillEls.forEach(splitWords);

  if (still) {
    wordEls.forEach((el) => el.classList.add("is-in"));
    fillEls.forEach((el) => el.querySelectorAll(".mwi").forEach((w) => (w.style.opacity = "1")));
    return;
  }

  const revealObs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          revealObs.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -12% 0px" },
  );
  for (const el of wordEls) {
    if (el.dataset.words === "load") requestAnimationFrame(() => el.classList.add("is-in"));
    else revealObs.observe(el);
  }

  // Scènes liées au défilement : ne calculer que celles qui sont à l'écran.
  const scenes = [
    ...[...document.querySelectorAll("[data-parallax]")].map((el) => ({ el, kind: "parallax", k: parseFloat(el.dataset.parallax) || 0.1 })),
    ...[...document.querySelectorAll("[data-tilt]")].map((el) => ({ el, kind: "tilt" })),
    ...fillEls.map((el) => ({ el, kind: "fill", words: [...el.querySelectorAll(".mwi")] })),
  ];
  const visible = new Set();
  const sceneObs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const scene = scenes.find((s) => s.el === e.target);
        if (!scene) continue;
        if (e.isIntersecting) visible.add(scene);
        else visible.delete(scene);
      }
      schedule();
    },
    { rootMargin: "120px 0px 120px 0px" },
  );
  scenes.forEach((s) => sceneObs.observe(s.el));

  let frame = 0;
  function update() {
    frame = 0;
    const vh = window.innerHeight;
    for (const s of visible) {
      const r = s.el.getBoundingClientRect();
      if (s.kind === "parallax") {
        // Décalage proportionnel à la distance entre le centre de la zone et celui de l'écran, borné.
        const host = s.el.parentElement.getBoundingClientRect();
        const center = host.top + host.height / 2 - vh / 2;
        const max = host.height * s.k;
        const y = Math.max(-max, Math.min(max, -center * s.k));
        s.el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      } else if (s.kind === "tilt") {
        // 0 quand le haut de la fenêtre touche le bas de l'écran, 1 quand il atteint le tiers haut.
        const p = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.62)));
        s.el.style.setProperty("--tilt", p.toFixed(3));
      } else if (s.kind === "fill") {
        // Les mots s'éclairent de 0,2 à 1 entre l'entrée du bloc par le bas et son passage au tiers haut.
        const p = Math.max(0, Math.min(1, (vh * 0.92 - r.top) / (vh * 0.55)));
        const lit = p * s.words.length;
        s.words.forEach((w, i) => (w.style.opacity = String(0.2 + 0.8 * Math.max(0, Math.min(1, lit - i)))));
      }
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  root.classList.add("motion-on");
  schedule();

  cleanup = () => {
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    if (frame) cancelAnimationFrame(frame);
    revealObs.disconnect();
    sceneObs.disconnect();
  };
}

// Au premier chargement, sans attendre astro:page-load, qui ne vient qu'une fois les images (les peintures)
// chargées : les titres du haut de page resteraient cachés plusieurs secondes sur un réseau lent. Relancer init à
// astro:page-load est sans effet sur ce qui est déjà découpé.
init();
document.addEventListener("astro:page-load", init);
document.addEventListener("astro:before-swap", () => cleanup());
