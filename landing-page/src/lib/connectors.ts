/**
 * connectors.ts - données des FICHES connecteur détaillées (`/product/integrations/{key}`).
 *
 * RÈGLE ABSOLUE : rien ici n'est inventé. Pour les 3 natifs profonds (GitHub, Slack, Plane), chaque
 * capacité listée correspond à un endpoint réel de `IntegrationController` + `integration-service.ts`.
 * Les connecteurs MCP-ready reçoivent une fiche HONNÊTE générée (`mcpFiche`) : ils marchent tous pareil
 * (serveur MCP officiel 1-clic + l'agent s'en sert dans un run), différenciés par la vraie data du
 * catalogue backend. On n'affirme pas d'outils précis qu'on ne connaît pas. Le reste reste au catalogue.
 *
 * Matrice Connect / Remember / Act par connecteur (le modèle du site), avec le VRAI statut :
 *   · connect  = peut-on l'authentifier et le brancher ?
 *   · remember = ses données entrent-elles dans la Memory (Brain OS) ?
 *   · act      = TaskForce agit-il avec (liens, notifications) ?
 * "na" = ce n'est pas le rôle de ce connecteur ; "rolling" = architecturé, pas encore livré ici.
 */

import type { Connector } from "@/lib/connectors-data";

export type ConnStatus = "live" | "beta" | "rolling" | "na";

export type ConnectorDetail = {
  key: string;
  name: string;
  category: string;
  tagline: string;
  matrix: { connect: ConnStatus; remember: ConnStatus; act: ConnStatus };
  auth: string;
  plan: string;
  /** Ce que TaskForce sait faire - chaque item = un endpoint réel. */
  can: { title: string; text: string }[];
  /** Ce qui circule (puces). */
  flows: string[];
  /** Honnêteté : ce qui n'est PAS dans l'intégration aujourd'hui. */
  notYet: string[];
  /** Lien docs du fournisseur (depuis `ConnectorCatalog`). */
  docsUrl: string;
  docsLabel: string;
};

export const CONNECTORS: Record<string, ConnectorDetail> = {
  github: {
    key: "github",
    name: "GitHub",
    category: "Dev & CI/CD",
    tagline:
      "Bring your repositories, issues and pull requests into TaskForce - and link code back to the work it belongs to.",
    matrix: { connect: "live", remember: "rolling", act: "beta" },
    auth: "OAuth · one click, no token to copy",
    plan: "Business plan and up",
    can: [
      { title: "Connect with OAuth", text: "One click authorizes TaskForce against GitHub - nothing to copy or paste." },
      { title: "Read your repositories", text: "List repositories with their visibility and open-issue count." },
      { title: "Read issues and pull requests", text: "Pull a repository's issues and PRs, with state and author." },
      { title: "Link code to the work", text: "Attach a pull request or commit to a TaskForce issue; the link tracks live status - Open, Merged or Closed." },
    ],
    flows: ["Repositories", "Issues", "Pull requests", "Commit & PR links"],
    notYet: [
      "Creating GitHub issues or branches, or pushing code from TaskForce, isn't part of the integration today.",
      "Ingesting GitHub data into Memory is rolling out - Plane is the reference today.",
    ],
    docsUrl: "https://docs.github.com",
    docsLabel: "GitHub docs",
  },
  slack: {
    key: "slack",
    name: "Slack",
    category: "Communication",
    tagline: "Mirror the work into the channels your team already watches - the right events, in the right place.",
    matrix: { connect: "live", remember: "na", act: "beta" },
    auth: "OAuth · one click, no token to copy",
    plan: "Business plan and up",
    can: [
      { title: "Connect with OAuth", text: "One click authorizes TaskForce against your Slack workspace." },
      { title: "Choose channels", text: "Pick which channels receive updates - and which event types go to each one." },
      { title: "Mirror events", text: "Issue and workflow events post to the channels you choose, as they happen." },
    ],
    flows: ["Channels", "Event notifications"],
    notYet: [
      "Reading Slack conversations or two-way chat from TaskForce isn't part of the integration today.",
      "Slack is a notification surface here, not a Memory source.",
    ],
    docsUrl: "https://api.slack.com",
    docsLabel: "Slack API docs",
  },
  plane: {
    key: "plane",
    name: "Plane",
    category: "Project management",
    tagline: "The reference Memory integration: bring a Plane project's issues into the decision graph behind every run.",
    matrix: { connect: "live", remember: "live", act: "na" },
    auth: "API key + workspace slug",
    plan: "Business plan and up",
    can: [
      { title: "Connect with an API key", text: "Provide a Plane personal API key and your workspace slug." },
      { title: "List your projects", text: "TaskForce reads the projects available in your Plane workspace." },
      { title: "Sync into Memory", text: "Ingest a project's issues into the Brain OS decision graph - the sync reports how many nodes were created and updated." },
    ],
    flows: ["Projects", "Issues → Brain OS nodes"],
    notYet: [
      "Writing back to Plane from TaskForce isn't part of the integration today.",
      "Plane is the first connector with live Memory ingestion - the same path is rolling out to the rest.",
    ],
    docsUrl: "https://developers.plane.so/api-reference/introduction",
    docsLabel: "Plane API docs",
  },
};

/**
 * Fiche HONNÊTE d'un connecteur MCP-ready, générée depuis la vraie data du catalogue (aucune capacité
 * inventée). Tous les MCP-ready partagent le même moteur : serveur MCP officiel hébergé, connexion
 * 1-clic OAuth, l'agent appelle leurs outils dans un run (avec approbation humaine sur toute écriture).
 * La différence entre deux fiches = le nom, la description, la catégorie et le serveur MCP réels.
 */
export function mcpFiche(c: Connector): ConnectorDetail {
  const docsUrl = c.docsUrl || c.websiteUrl || "https://modelcontextprotocol.io";
  const docsLabel = c.docsUrl ? `${c.name} API docs` : c.websiteUrl ? `${c.name} website` : "About MCP";
  return {
    key: c.key,
    name: c.name,
    category: c.catLabel,
    tagline: `${c.desc}. Connect ${c.name} over its official MCP server in one click - your agents can then use it inside a run, with a human on every write.`,
    matrix: { connect: "live", remember: "rolling", act: "beta" },
    auth: "MCP - one-click OAuth to the official server",
    plan: "Beta",
    can: [
      {
        title: "Connect in one click",
        text: `TaskForce connects to ${c.name}'s official hosted MCP server over OAuth - no key to paste. The server URL stays editable if you self-host.`,
      },
      {
        title: "Your agents can use it in a run",
        text: `An agent can call ${c.name}'s MCP tools to read context or take an action. Anything that writes waits for a human approval first.`,
      },
      {
        title: "Bounded by your scopes",
        text: "The agent only reaches what the OAuth scopes you grant expose - nothing beyond them.",
      },
    ],
    flows: [],
    notYet: [
      `Native ingestion into Brain OS memory isn't wired for ${c.name} yet - it runs through the generic MCP layer, not a dedicated reader. Deep sync is rolling out, with Plane as the reference.`,
      `The exact tools available depend on ${c.name}'s own MCP server.`,
    ],
    docsUrl,
    docsLabel,
  };
}
