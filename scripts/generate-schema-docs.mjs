/**
 * Génère le modèle de données (MCD/MLD) et le dictionnaire de données depuis le schéma RÉEL.
 *
 * Pourquoi ce script existe
 * -------------------------
 * `Modele_Donnees_MCD_MLD.md` portait déjà, en §5, la consigne « régénérer les diagrammes depuis
 * information_schema (script d'introspection) plutôt que d'éditer à la main ». La consigne
 * existait, **le script non**. Résultat mesuré le 23/07/2026 : 10 tables absentes des documents,
 * une table supprimée encore documentée, et tous les totaux faux (50 tables déclarées pour 56,
 * 483 colonnes pour 555, 94 clés étrangères pour 104).
 *
 * Une consigne sans outil dérive. Celui-ci rend la régénération exécutable en une commande.
 *
 * Garde-fou central
 * -----------------
 * Le classement par domaine est déclaré ci-dessous. Toute table absente de ce classement fait
 * **échouer le script** au lieu d'être ignorée : c'est précisément ainsi que 10 tables avaient
 * disparu des documents sans que personne ne le voie.
 *
 * Usage : node scripts/generate-schema-docs.mjs [--check]
 *   --check : ne réécrit rien, signale seulement les écarts. Utilisable en intégration continue.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMAINES, HORS_METIER } from "./lib/domaines.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(ICI, "../../taskforce-docs/v1/03-architecture");
const CONTENEUR = process.env.TF_PG_CONTAINER ?? "taskforce-postgres-dev";
const BASE = process.env.TF_PG_DB ?? "taskforce-db";
const USER = process.env.TF_PG_USER ?? "postgres";
const CHECK = process.argv.includes("--check");


// ---------------------------------------------------------------------------
// Introspection
// ---------------------------------------------------------------------------

function psql(sql) {
  const out = execFileSync(
    "docker",
    ["exec", CONTENEUR, "psql", "-U", USER, "-d", BASE, "-t", "-A", "-c", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ).trim();
  return out ? JSON.parse(out) : [];
}

const colonnes = psql(`
  SELECT json_agg(t) FROM (
    SELECT c.table_name, c.column_name, c.ordinal_position, c.data_type,
           c.character_maximum_length AS maxlen, c.numeric_precision AS prec,
           c.is_nullable, c.column_default
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position
  ) t;`);

const contraintes = psql(`
  SELECT json_agg(t) FROM (
    SELECT tc.constraint_type, tc.table_name, kcu.column_name,
           ccu.table_name AS ref_table, ccu.column_name AS ref_column, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    LEFT JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     AND tc.constraint_type = 'FOREIGN KEY'
    LEFT JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
    ORDER BY tc.table_name
  ) t;`);

const [{ n: nbMigrations } = { n: 0 }] = psql(
  `SELECT json_agg(t) FROM (SELECT count(*)::int AS n FROM flyway_schema_history WHERE success) t;`,
);

// ---------------------------------------------------------------------------
// Contrôle d'exhaustivité : c'est le coeur du garde-fou
// ---------------------------------------------------------------------------

const tablesReelles = [...new Set(colonnes.map((c) => c.table_name))].sort();
const tablesClassees = new Set([...DOMAINES.flatMap((d) => d.tables), ...HORS_METIER]);

const nonClassees = tablesReelles.filter((t) => !tablesClassees.has(t));
const fantomes = [...tablesClassees].filter((t) => !tablesReelles.includes(t)).sort();

if (nonClassees.length || fantomes.length) {
  console.error("\nECHEC : le classement par domaine ne correspond plus au schéma.\n");
  if (nonClassees.length) {
    console.error(`  ${nonClassees.length} table(s) en base mais non classée(s) :`);
    for (const t of nonClassees) console.error(`    + ${t}`);
    console.error("  → les ajouter au domaine qui convient dans DOMAINES, puis relancer.");
  }
  if (fantomes.length) {
    console.error(`  ${fantomes.length} table(s) classée(s) mais absente(s) de la base :`);
    for (const t of fantomes) console.error(`    - ${t}`);
    console.error("  → les retirer de DOMAINES (table supprimée par une migration).");
  }
  console.error("\nCe contrôle est volontairement bloquant : c'est ainsi que 10 tables avaient");
  console.error("disparu des documents entre le 05/07 et le 23/07/2026 sans que personne ne le voie.\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Indexation
// ---------------------------------------------------------------------------

const parTable = new Map();
for (const t of tablesReelles) parTable.set(t, { colonnes: [], pk: new Set(), uniques: new Set(), fk: [] });
for (const c of colonnes) parTable.get(c.table_name).colonnes.push(c);
for (const k of contraintes) {
  const t = parTable.get(k.table_name);
  if (!t) continue;
  if (k.constraint_type === "PRIMARY KEY") t.pk.add(k.column_name);
  else if (k.constraint_type === "UNIQUE") t.uniques.add(k.column_name);
  else if (k.constraint_type === "FOREIGN KEY" && k.ref_table) {
    t.fk.push({ colonne: k.column_name, refTable: k.ref_table, refColonne: k.ref_column, onDelete: k.delete_rule });
  }
}

const metier = tablesReelles.filter((t) => !HORS_METIER.includes(t));
const nbColonnes = colonnes.filter((c) => !HORS_METIER.includes(c.table_name)).length;
const nbFk = contraintes.filter((k) => k.constraint_type === "FOREIGN KEY" && k.ref_table).length;

function typeCourt(c) {
  const base = {
    "character varying": "varchar", "timestamp without time zone": "timestamp",
    "timestamp with time zone": "timestamptz", "double precision": "float8",
    "USER-DEFINED": "vector", boolean: "bool", integer: "int4", bigint: "int8",
  }[c.data_type] ?? c.data_type;
  return c.maxlen ? `${base}(${c.maxlen})` : base;
}

/**
 * Mermaid n'accepte ni parenthèses ni espaces dans un type d'attribut. La longueur est donc
 * omise ici : elle figure au dictionnaire, qui est fait pour le détail. Un diagramme se lit,
 * il ne s'audite pas.
 */
const typeMermaid = (c) => typeCourt(c).replace(/\(.*$/, "").replace(/[\s,]/g, "_");

// ---------------------------------------------------------------------------
// Génération du MCD / MLD
// ---------------------------------------------------------------------------

const AUJ = process.env.TF_DOC_DATE ?? new Date().toISOString().slice(0, 10).split("-").reverse().join("/");

function blocMld(domaine) {
  const l = ["```mermaid", "erDiagram"];
  for (const t of domaine.tables) {
    const info = parTable.get(t);
    const cles = info.colonnes.filter(
      (c) => info.pk.has(c.column_name) || info.fk.some((f) => f.colonne === c.column_name) || info.uniques.has(c.column_name),
    );
    l.push(`  ${t} {`);
    for (const c of cles) {
      const marque = info.pk.has(c.column_name) ? "PK" : info.fk.some((f) => f.colonne === c.column_name) ? "FK" : "UK";
      l.push(`    ${typeMermaid(c)} ${c.column_name} ${marque}`);
    }
    l.push("  }");
  }
  // Toutes les clés étrangères des tables du domaine, y compris celles qui pointent au-dehors.
  // Restreindre aux relations internes rendait certains diagrammes muets : le domaine Facturation
  // n'a aucune clé interne, toutes ses tables pointant vers `users`. Les tables externes
  // apparaissent en simple noeud, ce qui montre l'ancrage du domaine sans le surcharger.
  const vus = new Set();
  for (const t of domaine.tables) {
    for (const f of parTable.get(t).fk) {
      const cle = `${f.refTable}->${t}:${f.colonne}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      const info = parTable.get(t);
      const nullable = info.colonnes.find((c) => c.column_name === f.colonne)?.is_nullable === "YES";
      l.push(`  ${f.refTable} ||--${nullable ? "o" : "|"}{ ${t} : "${f.colonne}${f.onDelete && f.onDelete !== "NO ACTION" ? ` / ON DELETE ${f.onDelete}` : ""}"`);
    }
  }
  l.push("```");
  return l.join("\n");
}

/**
 * MCD — niveau conceptuel.
 *
 * Il ne se dérive PAS du schéma : un modèle conceptuel abstrait la réalité technique, il ne la
 * décalque pas. Les entités sont donc déclarées ici, avec le vocabulaire du cahier des charges
 * plutôt que celui des tables, et les associations sont nommées par un verbe comme le veut MERISE.
 *
 * En revanche chaque entité conceptuelle est **rattachée à une table réelle**, et ce rattachement
 * est vérifié plus bas : un concept sans support en base serait une invention.
 */
const MCD_ENTITES = [
  ["UTILISATEUR", "users", "Le collaborateur du cahier des charges"],
  ["WORKSPACE", "workspaces", "Espace de travail d'une organisation"],
  ["EQUIPE", "teams", "Regroupement de collaborateurs"],
  ["PROJET", "projects", "Regroupement de tâches"],
  ["TACHE", "issues", "L'unité de travail à répartir"],
  ["CYCLE", "cycles", "Itération de travail bornée dans le temps"],
  ["PROFIL_COMPETENCES", "member_skill_profiles", "Compétences, séniorité et capacité d'un collaborateur"],
  ["ABSENCE", "member_leaves", "Indisponibilité déclarée, entrant dans le calcul de charge"],
  ["DECISION_AFFECTATION", "assignment_events", "Trace d'une affectation et de son motif"],
  ["NOTIFICATION", "notifications", "Alerte de surcharge ou d'échéance"],
  ["ABONNEMENT", "subscriptions", "Plan souscrit par un utilisateur"],
  ["PAGE", "pages", "Documentation collaborative"],
];

const MCD_ASSOCIATIONS = [
  ["WORKSPACE", "||--o{", "PROJET", "contient"],
  ["WORKSPACE", "||--o{", "EQUIPE", "organise"],
  ["WORKSPACE", "||--o{", "UTILISATEUR", "réunit"],
  ["WORKSPACE", "||--o{", "PAGE", "documente"],
  ["EQUIPE", "}o--o{", "UTILISATEUR", "regroupe"],
  ["PROJET", "||--o{", "TACHE", "décompose en"],
  ["PROJET", "||--o{", "CYCLE", "planifie"],
  ["CYCLE", "}o--o{", "TACHE", "cadence"],
  ["UTILISATEUR", "||--o|", "PROFIL_COMPETENCES", "possède"],
  ["UTILISATEUR", "||--o{", "ABSENCE", "déclare"],
  ["UTILISATEUR", "||--o{", "TACHE", "se voit affecter"],
  ["UTILISATEUR", "||--o{", "NOTIFICATION", "reçoit"],
  ["UTILISATEUR", "||--o|", "ABONNEMENT", "souscrit"],
  ["TACHE", "||--o{", "DECISION_AFFECTATION", "justifie"],
  ["PROFIL_COMPETENCES", "||--o{", "DECISION_AFFECTATION", "pondère"],
];

const conceptsOrphelins = MCD_ENTITES.filter(([, table]) => !tablesReelles.includes(table));
if (conceptsOrphelins.length) {
  console.error("\nECHEC : des entités conceptuelles ne reposent sur aucune table réelle :");
  for (const [nom, table] of conceptsOrphelins) console.error(`    ${nom} → \`${table}\` introuvable`);
  console.error("  → un concept sans support en base serait une invention. Corriger MCD_ENTITES.\n");
  process.exit(1);
}

const mcd = [
  "```mermaid",
  "erDiagram",
  ...MCD_ASSOCIATIONS.map(([a, card, b, verbe]) => `  ${a} ${card} ${b} : "${verbe}"`),
  "```",
].join("\n");

const mld = [
  "---",
  "id: modele-donnees",
  "title: Modèle de données — MCD / MLD (MERISE)",
  "doc_type: reference",
  "statut: active",
  "version: 2.0",
  `date: "${AUJ}"`,
  "auteur: Pierre MICHEL",
  "tags: [architecture, donnees, mcd, mld, merise, erd, postgresql, flyway, e8]",
  "---",
  "",
  "# Modèle de données — MCD / MLD (MERISE)",
  "",
  "> **Livrable E8** (dossier de conception, compétences C8 et C9). Modèle entité-association de la",
  "> base TaskForce.",
  ">",
  "> **Ce document est GÉNÉRÉ**, il ne se modifie pas à la main. Source de vérité : le schéma réel de",
  "> PostgreSQL, obtenu par introspection d'`information_schema` après application des migrations",
  "> Flyway. Aucune table ni relation n'est inventée : tout provient du schéma exécuté.",
  ">",
  "> Régénération : `node scripts/generate-schema-docs.mjs` (voir §5).",
  "",
  "## 1. Périmètre et méthode",
  "",
  `- **${metier.length} tables** métier (hors \`flyway_schema_history\`), **${nbColonnes} colonnes**, **${nbFk} clés étrangères**.`,
  `- **${nbMigrations} migrations Flyway** appliquées avec succès.`,
  "- **MERISE** : le MCD (§3) décrit les domaines et leur poids ; le MLD (§4) est le schéma relationnel",
  "  réel, table par table. Le MPD (physique) est PostgreSQL 18 avec l'extension pgvector.",
  "- Diagrammes en **Mermaid**, rendus nativement par GitHub et Obsidian.",
  "",
  "### Légende",
  "",
  "| Marque | Signification |",
  "|---|---|",
  "| `PK` | Clé primaire |",
  "| `FK` | Clé étrangère |",
  "| `UK` | Contrainte d'unicité |",
  "| `||--||` | Association obligatoire (colonne non nulle) |",
  "| `||--o{` | Association facultative (colonne nullable) |",
  "",
  "Chaque relation porte le nom de sa colonne porteuse et, le cas échéant, son comportement",
  "`ON DELETE`. Ce comportement n'est pas cosmétique : c'est lui qui détermine si la suppression",
  "d'un workspace emporte ses données ou si un journal d'audit survit à l'anonymisation d'un compte.",
  "",
  "## 2. Conventions transverses",
  "",
  "- Clés primaires techniques (`id`), auto-incrémentées ou UUID selon la table.",
  "- Horodatage `created_at` et `updated_at` sur les entités auditables.",
  "- Isolation multi-tenant : les tables métier portent un rattachement direct ou transitif au workspace.",
  "- Les colonnes portant un secret sont chiffrées applicativement en AES-256-GCM avant persistance.",
  "",
  "## 3. MCD — modèle conceptuel",
  "",
  "Niveau **conceptuel** : les entités et leurs associations, sans détail technique. Le vocabulaire",
  "est celui du cahier des charges, pas celui des tables, afin que le modèle reste lisible par le",
  "demandeur. Les associations sont nommées par un verbe, conformément à MERISE.",
  "",
  mcd,
  "",
  "| Entité conceptuelle | Table support | Rôle |",
  "|---|---|---|",
  ...MCD_ENTITES.map(([nom, table, role]) => `| **${nom}** | \`${table}\` | ${role} |`),
  "",
  "Chaque entité conceptuelle est adossée à une table réelle, et ce rattachement est **vérifié à la",
  "génération** : un concept sans support en base serait une invention, et le script refuserait de",
  "produire le document.",
  "",
  "### Répartition du schéma par domaine",
  "",
  "Le passage au logique fait apparaître des tables de liaison, d'historisation et de configuration",
  `qui n'ont pas d'existence conceptuelle. D'où l'écart entre ${MCD_ENTITES.length} entités et`,
  `${metier.length} tables. Leur poids relatif dit où se concentre la complexité, et il correspond à`,
  "ce qu'on attend : le coeur métier des projets et des tâches est de loin le plus lourd.",
  "",
  "| Domaine | Tables |",
  "|---|:--:|",
  ...DOMAINES.map((d) => `| ${d.id} ${d.titre} | ${d.tables.length} |`),
  `| **Total métier** | **${metier.length}** |`,
  "",
  "## 4. MLD — schéma relationnel réel, par domaine",
  "",
  "Chaque diagramme ne montre que les **colonnes porteuses de clés** (primaire, étrangère, unicité) :",
  "au-delà, le rendu devient illisible. Le détail exhaustif des colonnes vit dans le",
  "[dictionnaire de données](./Dictionnaire_Donnees.md), généré par le même script.",
  "",
  ...DOMAINES.flatMap((d) => [
    `### ${d.id} ${d.titre}`,
    "",
    d.intro,
    "",
    `**${d.tables.length} tables** : ${d.tables.map((t) => `\`${t}\``).join(", ")}.`,
    "",
    blocMld(d),
    "",
  ]),
  "## 5. Régénération",
  "",
  "```bash",
  "node scripts/generate-schema-docs.mjs",
  "```",
  "",
  "Le script interroge la base de développement en cours d'exécution et réécrit ce document ainsi que",
  "le dictionnaire de données. Il **échoue volontairement** si une table de la base n'est classée dans",
  "aucun domaine, ou si un domaine référence une table disparue.",
  "",
  "Ce blocage est la leçon du 23/07/2026 : la consigne « régénérer plutôt qu'éditer à la main »",
  "figurait déjà ici, mais **aucun script ne l'accompagnait**. Entre le 05/07 et le 23/07,",
  "10 tables ont été ajoutées sans jamais apparaître dans ces documents, une table supprimée y est",
  "restée, et tous les totaux étaient faux. Une consigne sans outil dérive.",
  "",
  "Variante non destructive, utilisable en intégration continue :",
  "",
  "```bash",
  "node scripts/generate-schema-docs.mjs --check",
  "```",
  "",
  "> Voir aussi : [[Dictionnaire_Donnees]] · [[Architecture]] · [[Modules]] · [[Diagramme_Classes_UML]].",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// Génération du dictionnaire
// ---------------------------------------------------------------------------

function ligneColonne(t, c) {
  const info = parTable.get(t);
  const fk = info.fk.find((f) => f.colonne === c.column_name);
  const cles = [
    info.pk.has(c.column_name) ? "PK" : null,
    fk ? `FK → \`${fk.refTable}.${fk.refColonne}\`` : null,
    info.uniques.has(c.column_name) ? "UK" : null,
  ].filter(Boolean).join(", ");
  const defaut = c.column_default ? `\`${String(c.column_default).slice(0, 40)}\`` : "";
  return `| \`${c.column_name}\` | ${typeCourt(c)} | ${c.is_nullable === "YES" ? "oui" : "non"} | ${cles || ""} | ${defaut} | ${fk?.onDelete && fk.onDelete !== "NO ACTION" ? fk.onDelete : ""} |`;
}

const dico = [
  "---",
  "id: dictionnaire-donnees",
  "title: Dictionnaire de données",
  "doc_type: reference",
  "statut: active",
  "version: 2.0",
  `date: "${AUJ}"`,
  "auteur: Pierre MICHEL",
  "tags: [architecture, donnees, dictionnaire, postgresql, e8]",
  "---",
  "",
  "# Dictionnaire de données",
  "",
  "> **Document GÉNÉRÉ**, il ne se modifie pas à la main. Régénération :",
  "> `node scripts/generate-schema-docs.mjs`.",
  ">",
  `> Périmètre : **${metier.length} tables** métier, **${nbColonnes} colonnes**, **${nbFk} clés étrangères**,`,
  `> **${nbMigrations} migrations Flyway** appliquées. Introspection d'\`information_schema\` sur la base réelle.`,
  "",
  "La colonne **ON DELETE** n'est renseignée que lorsqu'elle diffère du comportement par défaut.",
  "C'est une information de conception, pas un détail : elle dit si la suppression d'un parent",
  "emporte ses enfants, les détache, ou est refusée.",
  "",
  ...DOMAINES.flatMap((d) => [
    `## ${d.id} ${d.titre}`,
    "",
    d.intro,
    "",
    ...d.tables.flatMap((t) => {
      const info = parTable.get(t);
      return [
        `### \`${t}\``,
        "",
        `${info.colonnes.length} colonnes · ${info.fk.length} clé(s) étrangère(s).`,
        "",
        "| Colonne | Type | Nullable | Clés | Défaut | ON DELETE |",
        "|---|---|:--:|---|---|---|",
        ...info.colonnes.map((c) => ligneColonne(t, c)),
        "",
      ];
    }),
  ]),
  "> Voir aussi : [[Modele_Donnees_MCD_MLD]] · [[Table_Reconciliation]].",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

const cibles = [
  { chemin: resolve(DOCS, "Modele_Donnees_MCD_MLD.md"), contenu: mld },
  { chemin: resolve(DOCS, "Dictionnaire_Donnees.md"), contenu: dico },
];

console.log(`Schéma : ${metier.length} tables métier, ${nbColonnes} colonnes, ${nbFk} clés étrangères, ${nbMigrations} migrations.`);

let differe = false;
for (const { chemin, contenu } of cibles) {
  const avant = existsSync(chemin) ? readFileSync(chemin, "utf8") : "";
  if (avant === contenu) {
    console.log(`  inchangé  ${chemin.split(/[\\/]/).pop()}`);
    continue;
  }
  differe = true;
  if (CHECK) {
    console.log(`  À RÉGÉNÉRER  ${chemin.split(/[\\/]/).pop()}`);
  } else {
    writeFileSync(chemin, contenu, "utf8");
    console.log(`  réécrit   ${chemin.split(/[\\/]/).pop()} (${contenu.split("\n").length} lignes)`);
  }
}

if (CHECK && differe) {
  console.error("\nLes documents ne reflètent plus le schéma. Lancer le script sans --check.");
  process.exit(1);
}
