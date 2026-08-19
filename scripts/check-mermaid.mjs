/**
 * Contrôle de rendu des diagrammes Mermaid du corpus documentaire.
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * Un bloc ```mermaid syntaxiquement invalide ne lève aucune erreur : Obsidian et GitHub affichent
 * un cadre vide ou le code brut. Le document paraît donc complet alors qu'il ne montre rien, et
 * personne ne s'en aperçoit tant qu'un lecteur — un jury, par exemple — n'ouvre pas la page.
 * C'est exactement le mode de défaillance silencieuse que la règle « code-as-docs » cherche à
 * éliminer : une affirmation invérifiable devient une affirmation fausse avec le temps.
 *
 * DÉPENDANCES
 * -----------
 * Les autres scripts de ce dossier n'utilisent que des modules Node natifs, à dessein. Celui-ci ne
 * peut pas : parser du Mermaid exige la bibliothèque Mermaid elle-même, qui exige un DOM. Plutôt
 * que d'introduire un package.json et un node_modules dans le dépôt, les deux dépendances sont
 * résolues à l'exécution et installées à la demande, sans être enregistrées :
 *
 *     npm i --no-save mermaid jsdom
 *
 * USAGE
 * -----
 *     node scripts/check-mermaid.mjs                  # tout le corpus taskforce-docs/v1
 *     node scripts/check-mermaid.mjs chemin/f.md ...  # fichiers précis
 *
 * Sortie 0 si tous les diagrammes sont parsables, 1 sinon (utilisable en CI), 2 si les
 * dépendances manquent.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(ICI, "../../taskforce-docs/v1");

/* --------------------------------------------------------------------------------------------
 * Dépendances : présentes ou non, on le dit clairement plutôt que d'échouer sur un import raté.
 * ------------------------------------------------------------------------------------------ */
let JSDOM, mermaid;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  console.error("Dépendances absentes. Installer sans les enregistrer :\n");
  console.error("    npm i --no-save mermaid jsdom\n");
  process.exit(2);
}

// Mermaid s'attend à tourner dans un navigateur. Un DOM synthétique suffit pour le seul parsing.
const dom = new JSDOM("<!DOCTYPE html><body></body>", { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
global.DOMParser = dom.window.DOMParser;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
// Node 24 : `navigator` est un accesseur en lecture seule sur globalThis, l'affectation directe jette.
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });

try {
  mermaid = (await import("mermaid")).default;
} catch {
  console.error("Dépendances absentes. Installer sans les enregistrer :\n");
  console.error("    npm i --no-save mermaid jsdom\n");
  process.exit(2);
}
mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });

/* --------------------------------------------------------------------------------------------
 * Collecte des fichiers
 * ------------------------------------------------------------------------------------------ */
function markdownsDe(racine) {
  const trouves = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...markdownsDe(chemin));
    else if (entree.endsWith(".md")) trouves.push(chemin);
  }
  return trouves;
}

const args = process.argv.slice(2);
let fichiers;
if (args.length > 0) {
  fichiers = args;
} else {
  if (!existsSync(CORPUS)) {
    console.error(`Corpus introuvable : ${CORPUS}`);
    console.error("Ce script attend taskforce-docs à côté de taskforce-fullstack.");
    process.exit(2);
  }
  fichiers = markdownsDe(CORPUS);
}

/* --------------------------------------------------------------------------------------------
 * Parsing
 * ------------------------------------------------------------------------------------------ */
const FENCE = /```mermaid\n([\s\S]*?)```/g;
const echecs = [];
let total = 0;
let fichiersAvecDiagramme = 0;

for (const fichier of fichiers) {
  const src = readFileSync(fichier, "utf8");
  const blocs = [...src.matchAll(FENCE)];
  if (blocs.length === 0) continue;
  fichiersAvecDiagramme++;

  for (const [i, m] of blocs.entries()) {
    total++;
    // Numéro de ligne du bloc, pour pointer directement l'erreur dans l'éditeur.
    const ligne = src.slice(0, m.index).split("\n").length;
    const repere = `${basename(fichier)}:${ligne} (bloc ${i + 1})`;
    try {
      await mermaid.parse(m[1]);
    } catch (e) {
      echecs.push({ repere, message: String(e.message).split("\n")[0] });
    }
  }
}

if (echecs.length > 0) {
  console.error(`\n${echecs.length} diagramme(s) NON parsable(s) :\n`);
  for (const { repere, message } of echecs) console.error(`  ✗ ${repere} — ${message}`);
  console.error(`\n${total - echecs.length}/${total} parsables sur ${fichiersAvecDiagramme} fichier(s).`);
  process.exit(1);
}

console.log(`${total}/${total} diagrammes parsables (${fichiersAvecDiagramme} fichiers).`);
