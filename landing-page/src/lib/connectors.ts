/**
 * connectors.ts - données des FICHES connecteur détaillées (`/product/integrations/{key}`).
 *
 * RÈGLE ABSOLUE : rien ici n'est inventé. Chaque capacité listée correspond à un endpoint réel de
 * `IntegrationController` (backend) et à une méthode de `frontend/lib/api/integration-service.ts`.
 * On ne fait de fiche QUE pour les 3 connecteurs réellement implémentés en profondeur - GitHub,
 * Slack, Plane. Les 126 autres restent au catalogue (connectables, profondeur en cours).
 *
 * Matrice Connect / Remember / Act par connecteur (le modèle du site), avec le VRAI statut :
 *   · connect  = peut-on l'authentifier et le brancher ?
 *   · remember = ses données entrent-elles dans la Memory (Brain OS) ?
 *   · act      = TaskForce agit-il avec (liens, notifications) ?
 * "na" = ce n'est pas le rôle de ce connecteur ; "rolling" = architecturé, pas encore livré ici.
 */

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
