// Post-traitement de la spec OpenAPI générée par springdoc, pour une référence API Fern lisible.
//
// springdoc tague chaque opération par le NOM DE CLASSE du contrôleur (« issue-controller »…) et
// expose l'actuator. Sans retouche, la référence afficherait 42 groupes techniques + des endpoints
// système. Ce script (idempotent) :
//   1. retire les endpoints /actuator/** (monitoring, hors API produit) ;
//   2. renomme les tags « xxx-controller » en noms de ressources lisibles (repli auto sinon) ;
//   3. reconstruit le tableau `tags` racine, ORDONNÉ + décrit → pilote l'ordre des sections Fern ;
//   4. pose une info.description si absente.
//
// Lancé automatiquement par generate-openapi.ps1 après la récupération. Rejouable sans risque.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = join(HERE, "..", "openapi", "openapi.json");

// controller kebab -> nom de section lisible (anglais : la référence API décrit le modèle du code).
const TAG_MAP = {
  "issue-controller": "Issues",
  "project-controller": "Projects",
  "workspace-controller": "Workspaces",
  "cycle-controller": "Cycles",
  "page-controller": "Pages",
  "roadmap-controller": "Roadmap",
  "team-controller": "Teams",
  "member-skill-controller": "Member skills",
  "member-leave-controller": "Membership",
  "user-controller": "Users",
  "profile-controller": "Profile",
  "auth-controller": "Authentication",
  "o-auth-login-controller": "OAuth login",
  "invitation-controller": "Invitations",
  "notification-controller": "Notifications",
  "notification-preference-controller": "Notification preferences",
  "assignment-controller": "Assignments",
  "redistribution-controller": "Assignment redistribution",
  "my-work-controller": "My work",
  "dashboard-card-controller": "Dashboard",
  "analytics-controller": "Analytics",
  "analysis-controller": "AI analysis (workflows)",
  "knowledge-controller": "Brain OS",
  "brain-attachment-controller": "Brain OS attachments",
  "ai-conversation-controller": "AI assistant",
  "assistant-controller": "AI assistant",
  "skill-suggestion-controller": "Skill suggestions",
  "ai-usage-controller": "AI usage",
  "mcp-action-controller": "MCP actions",
  "integration-controller": "Integrations",
  "webhook-controller": "Webhooks",
  "billing-controller": "Billing",
  "stripe-controller": "Stripe",
  "stripe-webhook-controller": "Stripe webhooks",
  "sales-controller": "Sales",
  "gdpr-controller": "GDPR",
  "attachment-controller": "Attachments",
  "file-controller": "Files",
  "feedback-controller": "Feedback",
  "client-log-controller": "Client logs",
  "status-controller": "Status",
};

// Ordre d'affichage des sections dans la référence (les tags absents d'ici sont ajoutés à la fin).
const TAG_ORDER = [
  "Authentication", "OAuth login",
  "Workspaces", "Projects", "Issues", "Cycles", "Pages", "Roadmap",
  "Teams", "Users", "Member skills", "Membership", "Profile", "Invitations",
  "Assignments", "Assignment redistribution", "My work", "Notifications", "Notification preferences",
  "AI assistant", "AI analysis (workflows)", "Skill suggestions", "Brain OS", "Brain OS attachments", "AI usage",
  "Dashboard", "Analytics",
  "Integrations", "Webhooks", "MCP actions",
  "Billing", "Stripe", "Stripe webhooks", "Sales", "GDPR",
  "Files", "Attachments", "Feedback", "Client logs", "Status",
];

// Descriptions courtes des sections principales (facultatif, améliore la référence).
const TAG_DESC = {
  "Authentication": "Inscription, connexion, vérification et gestion de session.",
  "Workspaces": "Espaces de travail : création, membres, réglages.",
  "Projects": "Opérations : projets, visibilité, statuts et types de tâches.",
  "Issues": "Tâches : CRUD, statut, priorité, relations, sous-tâches, commentaires.",
  "Cycles": "Sprints : périodes bornées et leur avancement.",
  "Pages": "Documents rattachés à une opération.",
  "Roadmap": "Feuille de route : éléments planifiés dans le temps.",
  "Assignments": "Acceptation et refus des assignations de tâches.",
  "Notifications": "Signaux in-app et leur état.",
  "AI assistant": "Cortex : conversations et assistance IA.",
  "AI analysis (workflows)": "Traitements agentiques : plan, exécution, reprise.",
  "Brain OS": "Base de connaissance de l'espace (graphe).",
  "Analytics": "Indicateurs : débit, vélocité, charge, burndown.",
  "Integrations": "Connexion des outils externes (GitHub, Slack…).",
  "Billing": "Forfaits et facturation.",
};

const prettify = (kebab) =>
  kebab.replace(/-controller$/, "").split("-").filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const rename = (t) => TAG_MAP[t] ?? prettify(t);

const spec = JSON.parse(readFileSync(SPEC, "utf8"));

// 1. Retirer l'actuator.
let removedPaths = 0;
for (const p of Object.keys(spec.paths ?? {})) {
  if (p.startsWith("/actuator")) { delete spec.paths[p]; removedPaths++; }
}

// 2. Renommer les tags au niveau des opérations + collecter ceux réellement utilisés.
const used = new Set();
for (const item of Object.values(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(item)) {
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
    if (Array.isArray(op.tags)) {
      op.tags = op.tags.map(rename);
      op.tags.forEach((t) => used.add(t));
    }
  }
}

// 3. Reconstruire le tableau `tags` racine, ordonné.
const ordered = [
  ...TAG_ORDER.filter((t) => used.has(t)),
  ...[...used].filter((t) => !TAG_ORDER.includes(t)).sort(),
];
spec.tags = ordered.map((name) => (TAG_DESC[name] ? { name, description: TAG_DESC[name] } : { name }));

// 4. info.description par défaut.
spec.info ??= {};
spec.info.title = "TaskForce API";
spec.info.description ??=
  "API REST de TaskForce. Toutes les routes sont préfixées par `/api` et renvoient une enveloppe " +
  "`ApiResponse<T>` (le corps utile est dans `data`). Authentification par jeton Bearer (JWT). " +
  "Voir les guides Authentification et Conventions.";

writeFileSync(SPEC, JSON.stringify(spec, null, 2) + "\n", { encoding: "utf8" });

console.log(`OK clean-openapi : -${removedPaths} chemins actuator, ${used.size} sections, ` +
  `${Object.keys(spec.paths).length} chemins restants.`);
