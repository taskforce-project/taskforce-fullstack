/**
 * Titres révélés au scroll (façon Relevance, validé CEO le 24/09) : les mots des titres de section
 * (`h2.t-h2`) passent du gris au noir à mesure que le titre remonte dans l'écran.
 *
 * Mécanique : chaque mot devient un `<span class="rw" style="--i:N">`, le titre porte `--n` (nombre
 * de mots) et `--p` (0 → 1, sa progression). Le CSS (`.reveal-words .rw`, global.css) en déduit
 * l'opacité de chaque mot. Une seule variable écrite par titre et par frame : aucun reflow.
 *
 * Amélioration progressive : sans JS, `--p` est absent et vaut 1 (tout est noir). Rien ne se passe
 * si l'utilisateur a demandé moins d'animations, ni sur les pages légales (on les lit, on ne les
 * parcourt pas), ni sous un `[data-no-reveal]`. Le texte reste le même pour les lecteurs d'écran :
 * on n'ajoute que des spans en ligne.
 */

/** Le titre commence à se révéler quand son haut passe sous 92 % de la hauteur d'écran… */
const START = 0.92;
/** … et il est entièrement noir quand son haut atteint 38 %. */
const END = 0.38;

function textNodes(heading: HTMLElement): Text[] {
  const texts: Text[] = [];
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  return texts;
}

function countWords(texts: Text[]): number {
  return texts.reduce((sum, t) => sum + (t.data.match(/\S+/g)?.length ?? 0), 0);
}

/** Remplace chaque mot par un `<span class="rw" style="--i:N">`, en gardant les éléments en place
 *  (`<br>`, `<span class="text-primary">`…) et les espaces tels quels. */
function wrapWords(texts: Text[]) {
  let index = 0;
  for (const text of texts) {
    if (!text.data.trim()) continue;
    const fragment = document.createDocumentFragment();
    for (const part of text.data.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        fragment.append(part);
        continue;
      }
      const word = document.createElement("span");
      word.className = "rw";
      word.style.setProperty("--i", String(index++));
      word.textContent = part;
      fragment.append(word);
    }
    text.replaceWith(fragment);
  }
}

function progress(heading: HTMLElement): number {
  const vh = window.innerHeight;
  const p = (vh * START - heading.getBoundingClientRect().top) / (vh * (START - END));
  return Math.min(1, Math.max(0, p));
}

/** En bas de page, un titre peut ne jamais remonter jusqu'à END : on le finit. */
function atPageEnd(): boolean {
  return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
}

function init() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (location.pathname.startsWith("/legal/")) return;

  const headings = [...document.querySelectorAll<HTMLElement>("h2.t-h2")].filter(
    (h) => !h.closest("[data-no-reveal]") && h.dataset.reveal === undefined,
  );
  if (!headings.length) return;

  for (const h of headings) {
    h.dataset.reveal = "";
    const texts = textNodes(h);
    const n = countWords(texts);
    if (!n) continue;
    // Ordre voulu : variables et classe AVANT de découper. Les mots naissent ainsi directement à la
    // bonne opacité ; découper d'abord les faisait naître à 1 puis transitionner (flash au chargement).
    h.style.setProperty("--n", String(n));
    // Page trop courte pour défiler (ou chargée tout en bas) : aucun scroll ne viendra, on révèle.
    h.style.setProperty("--p", atPageEnd() ? "1" : progress(h).toFixed(3));
    h.classList.add("reveal-words");
    wrapWords(texts);
  }

  // Seuls les titres à l'écran sont recalculés au scroll.
  const visible = new Set<HTMLElement>();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const h = e.target as HTMLElement;
      if (e.isIntersecting) visible.add(h);
      else visible.delete(h);
    }
  });
  headings.forEach((h) => io.observe(h));

  let frame = 0;
  const update = () => {
    frame = 0;
    const end = atPageEnd();
    for (const h of visible) h.style.setProperty("--p", end ? "1" : progress(h).toFixed(3));
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
}

init();
