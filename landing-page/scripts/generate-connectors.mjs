// Génère src/lib/connectors-data.ts depuis le catalogue de connecteurs REEL du backend.
//
// Le catalogue (source de vérité = `backend/.../ConnectorCatalog.java`) est exposé par
// `GET /api/workspaces/{slug}/integrations/catalog` (authentifié). Récupère d'abord le JSON,
// puis lance ce script dessus :
//
//   # 1) token dev (ROPC) + dump du catalogue :
//   TOKEN=$(curl -s -X POST http://localhost:8180/realms/taskforce-dev/protocol/openid-connect/token \
//     -d grant_type=password -d client_id=taskforce-api -d client_secret=dev-secret-change-me \
//     -d username=admin@taskforce.dev -d password=Admin@2024 | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
//   curl -s http://localhost:8080/api/workspaces/<slug>/integrations/catalog -H "Authorization: Bearer $TOKEN" -o /tmp/catalog.json
//   # 2) génération :
//   node landing-page/scripts/generate-connectors.mjs /tmp/catalog.json
//
// On n'invente rien : chaque connecteur dit COMMENT il se connecte (auth), s'il est MCP-ready
// (serveur MCP hébergé vérifié -> 1 clic, utilisable par l'agent) et sa profondeur NATIVE réelle.
// Les non-joignables (auth "none" = libs UI recommandées) sortent en nom + logo seuls côté UI.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "lib", "connectors-data.ts");
const SRC = process.argv[2];
if (!SRC) { console.error("Usage: node generate-connectors.mjs <catalog.json>"); process.exit(1); }

const cat = JSON.parse(readFileSync(SRC, "utf8")).data;

const CAT_ID = {
  PROJECT_MANAGEMENT: "pm", DEV_CICD: "dev", HOSTING_INFRA: "infra", DATABASE: "db", ADS: "ads",
  ANALYTICS: "analytics", PAYMENTS: "payments", CRM_SALES: "crm", COMMUNICATION: "comms",
  IDENTITY_AUTH: "identity", SECURITY: "security", PRODUCTIVITY: "productivity", DESIGN_MEDIA: "design",
  ECOMMERCE: "ecommerce", AUTOMATION: "automation", AI_MODELS: "ai", UI_COMPONENTS: "ui",
};
const AUTH = { OAUTH2: "oauth", API_KEY: "apikey", TOKEN: "token", CONFIG: "config", NONE: "none" };
// Profondeur NATIVE réelle (au-delà du simple connectable) : Plane ingère vers le Brain OS,
// GitHub/Slack portent des actions natives (capability "act").
const NATIVE = { plane: "Memory", github: "Actions", slack: "Actions" };
// Assainit les caractères bannis (flèches, tirets longs) des descriptions backend.
const clean = (s) => (s || "").replace(/\s*→\s*/g, " to ").replace(/[—–]/g, "-").replace(/\s+/g, " ").trim();

const rows = [];
for (const c of cat.categories) {
  for (const t of c.tools) {
    const auth = AUTH[t.authType] ?? "config";
    rows.push({
      key: t.key, name: t.name, cat: CAT_ID[t.category] ?? "other", auth,
      mcp: !!t.mcpSuggestedUrl, native: NATIVE[t.key] ?? null, reachable: auth !== "none",
      desc: clean(t.description),
    });
  }
}

const ts = `// AUTOGENERE par scripts/generate-connectors.mjs - ne pas editer a la main.
// Source : catalogue backend (ConnectorCatalog) via GET /integrations/catalog. Regenerer : voir le script.

export type ConnectorAuth = "oauth" | "apikey" | "token" | "config" | "none";

export interface Connector {
  key: string;
  name: string;
  cat: string;
  /** Comment on le connecte. "none" = pas de moyen de connexion aujourd'hui. */
  auth: ConnectorAuth;
  /** Serveur MCP hebergé verifié -> connexion 1 clic, utilisable par l'agent. */
  mcp: boolean;
  /** Profondeur native reelle au-dela du connectable ("Memory" = ingestion, "Actions" = actions). */
  native: string | null;
  /** A un moyen de connexion (auth !== "none"). */
  reachable: boolean;
  desc: string;
}

export const CONNECTORS: Connector[] = ${JSON.stringify(rows, null, 2)};
`;
writeFileSync(OUT, ts, "utf8");
console.log(`OK connectors-data.ts : ${rows.length} connecteurs, ${rows.filter((r) => r.reachable).length} joignables, ` +
  `${rows.filter((r) => r.mcp).length} MCP-ready, ${rows.filter((r) => r.native).length} natifs.`);
