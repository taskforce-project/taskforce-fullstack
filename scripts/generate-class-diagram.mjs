/**
 * Génère le diagramme de classes UML depuis les entités JPA RÉELLES.
 *
 * Pourquoi ce script existe
 * -------------------------
 * `Diagramme_Classes_UML.md` annonçait « 38 entités, 4 héritages, 60 associations » et disait
 * avoir été produit « par parsing de core/model/* ». Le comptage du 23/07/2026 donne **48 entités
 * et 13 héritages**, et trois entités vivent hors de `core/model`. Le document était juste au
 * 05/07, il ne l'est plus : un artefact dérivé du code doit être régénérable, sinon il devient faux
 * au commit suivant.
 *
 * Piège de comptage à connaître : `@EntityListeners` contient la chaîne `@Entity`. Un `grep`
 * naïf compte donc `AuditableEntity`, qui est un `@MappedSuperclass` et non une entité. C'est
 * l'origine du « 49 » qui a circulé quelques heures.
 *
 * Usage : node scripts/generate-class-diagram.mjs [--check]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMAINES, domaineDeTable } from "./lib/domaines.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(ICI, "../backend/tf-api/src/main/java/com/taskforce/tf_api");
const CIBLE = resolve(ICI, "../../taskforce-docs/v1/03-architecture/Diagramme_Classes_UML.md");
const CHECK = process.argv.includes("--check");

// ---------------------------------------------------------------------------
// Lecture des sources
// ---------------------------------------------------------------------------

function fichiersJava(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? fichiersJava(p) : p.endsWith(".java") ? [p] : [];
  });
}

/** Retire commentaires et chaînes : évite qu'une annotation citée en Javadoc soit comptée. */
function decommente(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const CARDINALITES = {
  ManyToOne: { mermaid: '"*" --> "1"', uml: "plusieurs vers un" },
  OneToMany: { mermaid: '"1" --> "*"', uml: "un vers plusieurs" },
  OneToOne: { mermaid: '"1" --> "1"', uml: "un vers un" },
  ManyToMany: { mermaid: '"*" --> "*"', uml: "plusieurs vers plusieurs" },
};

const entites = [];

for (const chemin of fichiersJava(SRC)) {
  const brut = readFileSync(chemin, "utf8");
  const src = decommente(brut);
  if (!/^\s*@Entity\b/m.test(src)) continue;

  const nom = src.match(/public\s+(?:abstract\s+)?class\s+(\w+)/)?.[1] ?? basename(chemin, ".java");
  const table = src.match(/@Table\s*\(\s*name\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const herite = /extends\s+AuditableEntity\b/.test(src);

  // Associations JPA : l'annotation, puis le type du champ qu'elle décore.
  const associations = [];
  // Deux pièges rencontrés à l'écriture de ce script, tous deux silencieux :
  //  1. Le champ porte souvent un initialiseur (`= new LinkedHashSet<>()`). L'omettre faisait
  //     manquer TOUTES les associations `@OneToMany` : 6 trouvées sur 9 pour la seule Issue.
  //  2. L'écart entre l'annotation et le champ peut être long (`@JoinTable` sur plusieurs lignes,
  //     `@Builder.Default`). Une limite en nombre de caractères est arbitraire et coupe au mauvais
  //     endroit. On interdit plutôt au motif de franchir un `;` : il ne peut alors structurellement
  //     pas sauter par-dessus un autre champ, quelle que soit la longueur du bloc d'annotations.
  const reAssoc = new RegExp(
    String.raw`@(ManyToOne|OneToMany|OneToOne|ManyToMany)\b[^;]*?private\s+(?:List|Set)?\s*<?\s*(\w+)\s*>?\s+(\w+)\s*(?:=[^;]*)?;`,
    "g",
  );
  for (const m of src.matchAll(reAssoc)) {
    associations.push({ type: m[1], cible: m[2], champ: m[3] });
  }

  // Références « hybrides » : clé étrangère portée par un identifiant nu plutôt que par une
  // association JPA. Choix documenté du projet, il doit apparaître comme tel.
  const hybrides = [...src.matchAll(/private\s+(?:Long|UUID)\s+(\w+Id)\s*;/g)]
    .map((m) => m[1])
    .filter((c) => c !== "id");

  entites.push({ nom, table, herite, associations, hybrides, chemin: chemin.replace(/\\/g, "/").split("tf_api/")[1] });
}

entites.sort((a, b) => a.nom.localeCompare(b.nom));

// ---------------------------------------------------------------------------
// Contrôles bloquants
// ---------------------------------------------------------------------------

const sansTable = entites.filter((e) => !e.table);
if (sansTable.length) {
  console.error("\nECHEC : entité(s) sans @Table explicite, le rattachement au domaine est impossible :");
  for (const e of sansTable) console.error(`    ${e.nom} (${e.chemin})`);
  process.exit(1);
}

const nonClassees = entites.filter((e) => !domaineDeTable(e.table));
if (nonClassees.length) {
  console.error("\nECHEC : entité(s) dont la table n'est classée dans aucun domaine :");
  for (const e of nonClassees) console.error(`    ${e.nom} → \`${e.table}\``);
  console.error("  → compléter scripts/lib/domaines.mjs, puis relancer.\n");
  process.exit(1);
}

const nomsConnus = new Set(entites.map((e) => e.nom));
const nbAssoc = entites.reduce((n, e) => n + e.associations.filter((a) => nomsConnus.has(a.cible)).length, 0);
const nbHerit = entites.filter((e) => e.herite).length;
const nbHybrides = entites.reduce((n, e) => n + e.hybrides.length, 0);

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------

const AUJ = process.env.TF_DOC_DATE ?? new Date().toISOString().slice(0, 10).split("-").reverse().join("/");

function blocDomaine(domaine) {
  const membres = entites.filter((e) => domaineDeTable(e.table)?.id === domaine.id);
  if (!membres.length) return null;

  const l = ["```mermaid", "classDiagram"];
  for (const e of membres) {
    l.push(`  class ${e.nom} {`);
    l.push(`    <<${e.table}>>`);
    for (const h of e.hybrides) l.push(`    +Long ${h}`);
    l.push("  }");
    if (e.herite) l.push(`  AuditableEntity <|-- ${e.nom}`);
  }
  // Associations dont la cible est une entité connue. Les cibles hors domaine apparaissent en
  // simple classe : sans elles, les domaines périphériques produiraient un diagramme muet.
  const vues = new Set();
  for (const e of membres) {
    for (const a of e.associations) {
      if (!nomsConnus.has(a.cible)) continue;
      const cle = `${e.nom}.${a.champ}`;
      if (vues.has(cle)) continue;
      vues.add(cle);
      l.push(`  ${e.nom} ${CARDINALITES[a.type].mermaid} ${a.cible} : ${a.champ}`);
    }
  }
  l.push("```");
  return { membres, bloc: l.join("\n") };
}

const sections = DOMAINES.map((d) => ({ d, ...(blocDomaine(d) ?? {}) })).filter((s) => s.bloc);

const doc = [
  "---",
  "id: diagramme-classes-uml",
  "title: Diagramme de classes UML",
  "doc_type: reference",
  "statut: active",
  "version: 2.0",
  `date: "${AUJ}"`,
  "auteur: Pierre MICHEL",
  "tags: [architecture, uml, classes, jpa, e8]",
  "---",
  "",
  "# Diagramme de classes UML",
  "",
  "> **Livrable E8** (dossier de conception, compétence C8).",
  ">",
  "> **Ce document est GÉNÉRÉ**, il ne se modifie pas à la main. Source de vérité : les classes",
  "> annotées `@Entity` du code réel. Aucune classe ni association n'est inventée.",
  ">",
  "> Régénération : `node scripts/generate-class-diagram.mjs` (voir §5).",
  "",
  "## 1. Méthode et périmètre",
  "",
  `- **${entites.length} entités JPA**, **${nbHerit} héritant** de \`AuditableEntity\`, **${nbAssoc} associations** entre entités.`,
  `- **${nbHybrides} références par identifiant nu** (voir §4), qui ne sont pas des associations JPA.`,
  "- Extraction par analyse des annotations, commentaires et chaînes retirés au préalable.",
  "- Les entités vivent majoritairement dans `core/model`, mais **pas exclusivement** : les modules",
  "  métier portent les leurs. Restreindre l'extraction à `core/model` en oublierait.",
  "",
  "> **Piège de comptage à connaître.** `@EntityListeners` contient la chaîne `@Entity` : un",
  "> décompte par recherche textuelle simple inclut donc `AuditableEntity`, qui est un",
  `> \`@MappedSuperclass\` et non une entité. Le compte exact est **${entites.length}**, pas ${entites.length + 1}.`,
  "",
  "## 2. Vue par domaine",
  "",
  "Le stéréotype `<<table>>` sous chaque classe donne sa table de rattachement, ce qui permet de",
  "recouper ce diagramme avec le [modèle de données](./Modele_Donnees_MCD_MLD.md), généré depuis la",
  "base par un script frère et partageant le même classement par domaine.",
  "",
  ...sections.flatMap(({ d, membres, bloc }) => [
    `### ${d.id} ${d.titre}`,
    "",
    d.intro,
    "",
    `**${membres.length} entités** : ${membres.map((e) => `\`${e.nom}\``).join(", ")}.`,
    "",
    bloc,
    "",
  ]),
  "## 3. Héritage",
  "",
  "`AuditableEntity` est un **`@MappedSuperclass`**, pas une entité : elle n'a pas de table propre,",
  "ses colonnes sont recopiées dans chaque table fille. C'est ce qui explique qu'on retrouve",
  "`created_at` et `updated_at` répétés au dictionnaire de données plutôt que dans une table commune.",
  "",
  `**${nbHerit} entités sur ${entites.length}** en héritent :`,
  "",
  ...entites.filter((e) => e.herite).map((e) => `- \`${e.nom}\` (\`${e.table}\`)`),
  "",
  `Les ${entites.length - nbHerit} autres portent leur horodatage elles-mêmes, ou n'en ont pas besoin`,
  "(tables de liaison, compteurs de séquence, jetons éphémères).",
  "",
  "## 4. Le modèle hybride de références",
  "",
  "Certaines clés étrangères sont portées par une **association JPA** (`@ManyToOne` vers l'entité",
  "cible), d'autres par un **identifiant nu** (`Long xxxId`). Ce n'est pas une incohérence mais un",
  "arbitrage : l'association donne la navigation et le chargement paresseux, l'identifiant nu évite",
  "un couplage de cycle de vie là où il serait nuisible.",
  "",
  `Le cas emblématique est le journal d'audit : conserver un identifiant nu permet à la trace de`,
  "**survivre à l'anonymisation** du compte qu'elle référence, ce qu'une association avec cascade",
  "aurait empêché. Une contrainte `ON DELETE SET NULL` complète le dispositif côté base.",
  "",
  `**${nbHybrides} références de ce type** sont recensées :`,
  "",
  "| Entité | Références par identifiant |",
  "|---|---|",
  ...entites.filter((e) => e.hybrides.length).map((e) => `| \`${e.nom}\` | ${e.hybrides.map((h) => `\`${h}\``).join(", ")} |`),
  "",
  "## 5. Régénération",
  "",
  "```bash",
  "node scripts/generate-class-diagram.mjs",
  "```",
  "",
  "Le script **échoue volontairement** si une entité n'a pas de `@Table` explicite, ou si sa table",
  "n'est classée dans aucun domaine de `scripts/lib/domaines.mjs`. Ce classement est partagé avec le",
  "générateur du modèle de données : deux classifications séparées auraient divergé, ce qui est",
  "exactement le défaut que ces scripts corrigent.",
  "",
  "Variante non destructive, utilisable en intégration continue :",
  "",
  "```bash",
  "node scripts/generate-class-diagram.mjs --check",
  "```",
  "",
  "> Voir aussi : [[Modele_Donnees_MCD_MLD]] · [[Dictionnaire_Donnees]] · [[Architecture_C4]].",
  "",
].join("\n");

console.log(`Entités : ${entites.length} · héritages : ${nbHerit} · associations : ${nbAssoc} · références par id : ${nbHybrides}`);

const avant = existsSync(CIBLE) ? readFileSync(CIBLE, "utf8") : "";
if (avant === doc) {
  console.log("  inchangé  Diagramme_Classes_UML.md");
} else if (CHECK) {
  console.log("  À RÉGÉNÉRER  Diagramme_Classes_UML.md");
  console.error("\nLe document ne reflète plus le code. Lancer le script sans --check.");
  process.exit(1);
} else {
  writeFileSync(CIBLE, doc, "utf8");
  console.log(`  réécrit   Diagramme_Classes_UML.md (${doc.split("\n").length} lignes)`);
}
