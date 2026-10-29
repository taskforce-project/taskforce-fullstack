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
  "roadmap-controller": "Roadmap",
  "team-controller": "Teams",
  "member-skill-controller": "Member skills",
  "member-leave-controller": "Membership",
  "user-controller": "Users",
  "profile-controller": "Profile",
  "auth-controller": "Authentication",
  "passkey-sign-in-controller": "Authentication",
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
  "eval-controller": "Test bank",
  "skill-suggestion-controller": "Skill suggestions",
  "ai-usage-controller": "AI usage",
  "mcp-action-controller": "MCP actions",
  "integration-controller": "Integrations",
  "webhook-controller": "Webhooks",
  "gdpr-controller": "GDPR",
  "attachment-controller": "Attachments",
  "file-controller": "Files",
  "client-log-controller": "Client logs",
  "ai-status-controller": "AI status",
  "delivery-controller": "Coding agents",
  "runner-provisioning-controller": "Coding agent runners",
  "mcp-server-controller": "MCP server",
  "personal-access-token-controller": "Personal access tokens",
  "project-export-controller": "Project export",
  "project-bundle-controller": "Project files",
  "workspace-bundle-controller": "Workspace files",
  "passkey-controller": "Passkeys",
  "desktop-session-controller": "Desktop sessions",
};

// Ordre d'affichage des sections dans la référence (les tags absents d'ici sont ajoutés à la fin).
const TAG_ORDER = [
  "Authentication", "OAuth login",
  "Workspaces", "Workspace files", "Projects", "Project export", "Project files", "Issues", "Cycles", "Roadmap",
  "Teams", "Users", "Member skills", "Membership", "Profile", "Personal access tokens", "Passkeys", "Desktop sessions",
  "Invitations",
  "Assignments", "Assignment redistribution", "My work", "Notifications", "Notification preferences",
  "AI assistant", "Test bank", "AI analysis (workflows)", "Skill suggestions", "Brain OS", "Brain OS attachments", "AI usage",
  "AI status", "Coding agents", "Coding agent runners", "MCP server",
  "Dashboard", "Analytics",
  "Integrations", "Webhooks", "MCP actions",
  "GDPR",
  "Files", "Attachments", "Client logs",
];

// Descriptions courtes des sections principales (facultatif, améliore la référence).
const TAG_DESC = {
  "Authentication": "Sign-up, sign-in, verification codes and sessions.",
  "Workspaces": "Workspaces: creation, members and settings.",
  "Projects": "Projects, their visibility, statuses and issue types.",
  "Issues": "Issues: status, priority, relations, subtasks and comments.",
  "Cycles": "Cycles: time-boxed iterations and their progress.",
  "Roadmap": "Work planned over time.",
  "Assignments": "Accepting and declining issue assignments.",
  "Notifications": "In-app notifications (Signals) and their state.",
  "AI assistant": "Cortex: conversations and AI help.",
  "Test bank": "Test cases drawn from Cortex answers, replayed on a named model without touching the workspace, and graded by code.",
  "AI analysis (workflows)": "AI analysis jobs: plan, run and resume.",
  "Brain OS": "The workspace's knowledge base: Markdown pages, links, tags, search and ingestion.",
  "Coding agents": "Delegating an issue to a coding agent (Claude Code, GitHub Copilot) and following the run.",
  "Coding agent runners": "Each person's local runner identity, created once, its secret shown once.",
  "MCP server": "The workspace's MCP server (JSON-RPC over HTTP), for Claude Code with a personal access token.",
  "Personal access tokens": "Personal access tokens, valid on the MCP server only.",
  "Passkeys": "The person's passkeys: add one, list them, remove one. Signing in with a passkey is under Authentication.",
  "Desktop sessions": "The desktop app's sessions of the person: approve a sign-in from the web app, list the computers, sign one out.",
  "Project files": "A whole project as one file: download it, or create a project from it.",
  "Workspace files": "A whole workspace as one file, its Brain OS and all its projects: download it, or create a new workspace from it.",
  "Webhooks": "Signed outgoing webhooks (HMAC-SHA256): events, test and delivery history.",
  "Analytics": "Indicators: throughput, velocity, workload and burndown.",
  "Integrations": "Connecting external tools: GitHub, Slack, Plane and MCP servers.",
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

// 1b. Retirer les endpoints INTERNES de la doc publique (décision sécu : ne pas exposer la surface
// qui n'est pas destinée aux consommateurs de l'API). Télémétrie, feedback et RGPD in-app sortent ;
// la gestion de webhooks (feature API légitime) RESTE.
// Filtrage sur les tags BRUTS springdoc (« xxx-controller »), donc AVANT le renommage.
const HIDE = new Set([
  "client-log-controller",
  "gdpr-controller",
  // Retour du navigateur après le consentement OAuth d'un serveur MCP : une redirection, pas une API à appeler.
  "mcp-o-auth-callback-controller",
  // Endpoints MACHINE du runner local de délégation (ADR-013) : réservés à un compte de service
  // Keycloak, sans intérêt pour un consommateur de l'API. La spec vient du backend DEV, où ils existent.
  "delivery-runner-controller",
  "runner-auth-controller",
  // Déplacement de projets par l'app desktop, avec sa seule session : le chemin de l'app, pas une API publique. Le
  // fichier de projet, lui, reste documenté (ProjectBundleController).
  "desktop-transfer-controller",
  // Ce que l'app desktop appelle elle-même pour ouvrir, relire et fermer sa session : son chemin, pas une API publique.
  // L'accord de la personne et ses sessions, eux, restent documentés (DesktopSessionController).
  "desktop-sign-in-controller",
]);
let removedInternal = 0;
for (const [p, item] of Object.entries(spec.paths ?? {})) {
  for (const method of Object.keys(item)) {
    const op = item[method];
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
    if (Array.isArray(op?.tags) && op.tags.some((t) => HIDE.has(t))) { delete item[method]; removedInternal++; }
  }
  if (Object.keys(item).length === 0) delete spec.paths[p];
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
  "REST API of TaskForce. Every path starts with `/api`; a successful response wraps its payload in `data`. " +
  "Authentication with a Bearer access token: see the Authentication and Conventions guides.";

writeFileSync(SPEC, JSON.stringify(spec, null, 2) + "\n", { encoding: "utf8" });

console.log(`OK clean-openapi : -${removedPaths} chemins actuator, -${removedInternal} opérations internes, ` +
  `${used.size} sections, ${Object.keys(spec.paths).length} chemins restants.`);
