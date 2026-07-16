#!/usr/bin/env node
/**
 * Joue la vie d'un projet TaskForce — via la VRAIE API REST.
 *
 * Pourquoi pas un gros fichier SQL (comme `dev_seed.sql`) ? Parce qu'un INSERT ne traverse pas
 * Spring : aucun service appelé, aucun événement publié, aucun listener réveillé. Le seed est
 * précisément la raison pour laquelle la base compte des centaines d'issues et le Brain OS zéro
 * node lié à un projet. Un SQL qui « joue » une migration reproduirait le problème qu'on veut
 * résoudre : un projet plein, un cerveau vide.
 *
 * Ici chaque étape est un appel HTTP réel, exactement comme le ferait un humain dans l'UI. Donc
 * `CycleService` / `IssueService` publient pour de bon leurs événements de transition, et
 * `BrainIngestionListener` écrit les nodes. Ce n'est pas une fixture de démo : c'est la preuve
 * de bout en bout que l'ingestion fonctionne.
 *
 * Usage :
 *   node scripts/scenario/play.mjs            # joue le scénario
 *   node scripts/scenario/play.mjs --reset    # supprime d'abord le projet s'il existe déjà
 *
 * À lancer APRÈS `.\scripts\db.ps1 seed` : le seed DROP `taskforce-demo` en cascade et effacerait
 * tout ce que ce script a créé.
 */

import http from "node:http";

// ── Configuration ───────────────────────────────────────────────────────────
const KEYCLOAK_HOST = process.env.KEYCLOAK_HOST ?? "localhost";
const KEYCLOAK_PORT = Number(process.env.KEYCLOAK_PORT ?? 8180);
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? "taskforce-dev";
const API = process.env.API_URL ?? "http://localhost:8080";
const SLUG = process.env.WORKSPACE_SLUG ?? "taskforce-demo";
const USER = process.env.TF_USER ?? "admin@taskforce.dev";
const PASS = process.env.TF_PASS ?? "Admin@2024";
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "taskforce-api";
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET ?? "dev-secret-change-me";

/**
 * Issuer attendu par l'API. `SecurityConfig` le dérive de `KEYCLOAK_URL` (= `http://keycloak:8080`,
 * le nom de service Docker), alors que depuis l'hôte on tape `localhost:8180` — Keycloak émettrait
 * alors un token d'issuer `localhost:8180` → 401 malgré un token parfaitement valide. On force donc
 * l'en-tête `Host` pour qu'il signe le bon issuer.
 *
 * ⚠️ C'est pour ça que le token passe par `node:http` et non par `fetch` : undici (le client de
 * `fetch`) **ignore silencieusement** un `Host` fourni à la main.
 */
const ISSUER_HOST = process.env.KEYCLOAK_ISSUER_HOST ?? "keycloak:8080";

const PROJECT = {
  name: "Portail Client",
  identifier: process.env.PROJECT_IDENTIFIER ?? "PORT",
  description: "Espace client en self-service : connexion, tableau de bord, factures.",
  isPublic: true,
};

// ── Le scénario : deux cycles, dont un clôturé et un encore en vol ──────────
const STORY = [
  {
    cycle: "Sprint 1 · Fondations",
    start: "2026-06-01",
    end: "2026-06-14",
    close: true, // → clôturé : déclenche la rétro complète (faits + synthèse Qwen)
    issues: [
      { title: "Authentification SSO du portail", type: "Feature", priority: "HIGH", points: 5, done: true },
      { title: "Page de connexion", type: "Feature", priority: "MEDIUM", points: 3, done: true },
      { title: "Modèle de données client", type: "Task", priority: "HIGH", points: 3, done: true },
      { title: "Erreur 500 au rafraîchissement du token", type: "Bug", priority: "URGENT", points: 2, done: true },
      { title: "Tableau de bord client", type: "Feature", priority: "MEDIUM", points: 8, done: false },
    ],
  },
  {
    cycle: "Sprint 2 · Facturation",
    start: "2026-06-15",
    end: "2026-06-28",
    close: false, // → laissé ACTIF : montre le node « Cycle en cours » qui vit au fil des issues
    issues: [
      { title: "Export CSV des factures", type: "Feature", priority: "HIGH", points: 5, done: true },
      { title: "Relance automatique des impayés", type: "Feature", priority: "MEDIUM", points: 8, done: true },
      { title: "Fuite mémoire sur le worker de facturation", type: "Bug", priority: "HIGH", points: 5, done: false },
      { title: "Documentation de l'API publique", type: "Task", priority: "LOW", points: 3, done: false },
    ],
  },
];

// ── Petit socle HTTP ────────────────────────────────────────────────────────
let token = null;
const log = (msg) => console.log(msg);
const step = (msg) => console.log(`\n\x1b[36m▸ ${msg}\x1b[0m`);
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const warn = (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`);

/** Token Keycloak avec le bon issuer (cf. ISSUER_HOST) — `fetch` ne sait pas faire, `node:http` si. */
function login() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "password",
    username: USER,
    password: PASS,
  }).toString();

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: KEYCLOAK_HOST,
        port: KEYCLOAK_PORT,
        path: `/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          Host: ISSUER_HOST,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (!json.access_token) return reject(new Error(`Keycloak: ${data}`));
            resolve(json.access_token);
          } catch (e) {
            reject(new Error(`Keycloak (réponse illisible): ${data}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** Appel API. Renvoie `response.data.data` (enveloppe ApiResponse) — règle d'or n°4 du repo. */
async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  if (!text) return null;
  const json = JSON.parse(text);
  return json.data !== undefined ? json.data : json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Étapes ──────────────────────────────────────────────────────────────────

async function resolveProject(reset) {
  const projects = await api("GET", `/api/workspaces/${SLUG}/projects`);
  const existing = projects.find((p) => p.identifier === PROJECT.identifier);
  if (existing) {
    if (!reset) {
      throw new Error(
        `Le projet « ${existing.name} » (${PROJECT.identifier}) existe déjà dans ${SLUG}.\n` +
          `   Relance avec --reset pour le supprimer et rejouer, ou change PROJECT_IDENTIFIER.`,
      );
    }
    warn(`--reset : suppression du projet existant « ${existing.name} » (#${existing.id})`);
    await api("DELETE", `/api/workspaces/${SLUG}/projects/${existing.id}`);
  }
  const project = await api("POST", `/api/workspaces/${SLUG}/projects`, PROJECT);
  ok(`Projet « ${project.name} » (${project.identifier}) créé — #${project.id}`);
  return project;
}

async function play() {
  const reset = process.argv.includes("--reset");

  step("Authentification");
  token = await login();
  ok(`Connecté en tant que ${USER}`);

  step("Projet");
  const project = await resolveProject(reset);
  const pid = project.id;

  // Statuts + types sont auto-amorcés à la création du projet (IssueService.seedDefaultStatusesAndTypes).
  const statuses = await api("GET", `/api/workspaces/${SLUG}/projects/${pid}/issues/statuses`);
  const types = await api("GET", `/api/workspaces/${SLUG}/projects/${pid}/issues/types`);
  const byCategory = (cat) => statuses.find((s) => s.category === cat);
  const todo = byCategory("UNSTARTED");
  const doing = byCategory("STARTED");
  const done = byCategory("COMPLETED");
  const typeId = (name) => types.find((t) => t.name === name)?.id ?? null;
  ok(`${statuses.length} statuts, ${types.length} types amorcés par le backend`);

  const members = await api("GET", `/api/workspaces/${SLUG}/members`);
  const assignees = members.map((m) => m.userId).filter(Boolean);
  ok(`${assignees.length} membres disponibles pour l'assignation`);

  let assigneeCursor = 0;
  const nextAssignee = () =>
    assignees.length ? assignees[assigneeCursor++ % assignees.length] : null;

  // Les cycles joués par CE run : la vérification finale ne doit pas se contenter de compter les
  // nodes CYCLE du workspace — ceux d'un run précédent la feraient passer au vert à tort.
  const playedCycleIds = [];

  for (const chapter of STORY) {
    step(`${chapter.cycle} — création des issues`);
    const created = [];
    for (const spec of chapter.issues) {
      const issue = await api("POST", `/api/workspaces/${SLUG}/projects/${pid}/issues`, {
        title: spec.title,
        description: `Issue du cycle « ${chapter.cycle} ».`,
        typeId: typeId(spec.type),
        priority: spec.priority,
        statusId: todo.id,
        assigneeId: nextAssignee(),
      });
      // storyPoints n'existe pas dans CreateIssueRequest → on l'écrit à la mise à jour.
      await api("PATCH", `/api/workspaces/${SLUG}/projects/${pid}/issues/${issue.id}`, {
        storyPoints: spec.points,
      });
      created.push({ ...spec, id: issue.id, key: `${project.identifier}-${issue.sequenceNumber}` });
      ok(`${project.identifier}-${issue.sequenceNumber} — ${spec.title} (${spec.points} pts)`);
    }

    step(`${chapter.cycle} — ouverture du cycle`);
    const cycle = await api("POST", `/api/workspaces/${SLUG}/projects/${pid}/cycles`, {
      name: chapter.cycle,
      description: `Cycle joué par le scénario d'ingestion.`,
      startDate: chapter.start,
      endDate: chapter.end,
    });
    for (const issue of created) {
      await api("POST", `/api/workspaces/${SLUG}/projects/${pid}/cycles/${cycle.id}/issues`, {
        issueId: issue.id,
      });
    }
    await api("PATCH", `/api/workspaces/${SLUG}/projects/${pid}/cycles/${cycle.id}`, {
      status: "ACTIVE",
    });
    playedCycleIds.push(cycle.id);
    ok(`Cycle #${cycle.id} actif, ${created.length} issues rattachées`);

    step(`${chapter.cycle} — l'équipe travaille`);
    for (const issue of created) {
      await api("PATCH", `/api/workspaces/${SLUG}/projects/${pid}/issues/${issue.id}`, {
        statusId: doing.id,
      });
      if (issue.done) {
        // ── Transition réelle vers COMPLETED → IssueCompletedEvent → le node du cycle se rafraîchit.
        await api("PATCH", `/api/workspaces/${SLUG}/projects/${pid}/issues/${issue.id}`, {
          statusId: done.id,
        });
        ok(`${issue.key} terminée`);
      } else {
        warn(`${issue.key} reste en cours`);
      }
    }

    if (chapter.close) {
      step(`${chapter.cycle} — clôture`);
      // ── Transition réelle vers COMPLETED → CycleCompletedEvent → rétro écrite par le Brain OS.
      await api("PATCH", `/api/workspaces/${SLUG}/projects/${pid}/cycles/${cycle.id}`, {
        status: "COMPLETED",
      });
      ok("Cycle clôturé — le Brain OS écrit sa rétro (asynchrone)");
    }
  }

  step("Le cerveau a-t-il grandi ?");
  const nodes = await waitForNodes(playedCycleIds);
  if (nodes.length === 0) {
    warn("Aucun node d'ingestion après 90 s — regarde les logs du backend.");
    process.exitCode = 1;
    return;
  }
  for (const node of nodes) {
    const mode = node.metadata?.mode === "generated" ? "faits + synthèse IA" : "faits seuls";
    ok(`#${node.id} « ${node.title} » — ${mode}`);
  }

  // ── Invariant : UN node par cycle, mis à jour — jamais un node par événement. C'est ce que
  // l'upsert promet, et c'est précisément ce qui cassait avant le verrou (4 issues terminées
  // coup sur coup → 4 threads @Async → 4 doublons).
  const perCycle = new Map();
  for (const node of nodes) perCycle.set(node.refId, (perCycle.get(node.refId) ?? 0) + 1);
  const duplicated = [...perCycle.entries()].filter(([, count]) => count > 1);
  if (duplicated.length) {
    warn(
      `Idempotence cassée : ${duplicated
        .map(([cycleId, count]) => `cycle ${cycleId} → ${count} nodes`)
        .join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }
  ok(`Idempotence OK : ${perCycle.size} cycles → ${nodes.length} nodes`);

  const closed = STORY.filter((c) => c.close).length;
  const retros = nodes.filter((n) => n.metadata?.closed === true).length;
  if (retros < closed) {
    warn(`${retros}/${closed} rétro(s) de clôture écrite(s) — l'ingestion du cycle clôturé a échoué.`);
    process.exitCode = 1;
    return;
  }

  log(
    `\n\x1b[32mTerminé.\x1b[0m Le projet a vécu, le Brain OS s'est rempli tout seul : ` +
      `ouvre le graphe du workspace ${SLUG}, domaine « 16 · Historique des actions ».`,
  );
}

/**
 * L'ingestion est asynchrone (`@Async` + génération LLM) : on laisse au backend le temps d'écrire.
 * On ne regarde QUE les cycles joués par ce run — compter tous les nodes `CYCLE` du workspace
 * ferait passer la vérification au vert grâce à ceux d'un run précédent.
 */
async function waitForNodes(cycleIds, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  const fetchNodes = async () => {
    const brain = await api("GET", `/api/workspaces/${SLUG}/brain`);
    return (brain.nodes ?? []).filter((n) => n.refType === "CYCLE" && cycleIds.includes(n.refId));
  };
  let announced = false;
  while (Date.now() < deadline) {
    const found = await fetchNodes();
    // Chaque cycle joué doit avoir produit son node, et le cycle clôturé sa rétro.
    const closedDone = found.filter((n) => n.metadata?.closed === true).length;
    if (found.length >= cycleIds.length && closedDone >= STORY.filter((c) => c.close).length) {
      return found;
    }
    if (!announced) {
      log("  … attente de l'ingestion asynchrone (génération Qwen en cours)");
      announced = true;
    }
    await sleep(3000);
  }
  return fetchNodes();
}

play().catch((err) => {
  console.error(`\n\x1b[31m✗ ${err.message}\x1b[0m`);
  process.exit(1);
});
