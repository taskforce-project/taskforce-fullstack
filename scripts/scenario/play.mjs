#!/usr/bin/env node
/**
 * Rejoue **trois mois de vie d'un projet** contre la VRAIE API REST, phase par phase.
 *
 * Pourquoi pas un gros fichier SQL (comme `dev_seed.sql`) ? Parce qu'un INSERT ne traverse pas
 * Spring : aucun service appelé, aucun événement publié, aucun listener réveillé. Le seed est
 * précisément la raison pour laquelle la base compte des centaines d'issues et le Brain OS zéro
 * node lié à un projet. Un SQL qui « joue » une migration reproduirait le problème qu'on veut
 * résoudre : un projet plein, un cerveau vide.
 *
 * Ici chaque étape est un appel HTTP réel, dans l'ordre où elle arriverait vraiment : le cadrage
 * (client, budget, équipe, stack) d'abord, puis les sprints, les décisions, les incidents, l'audit,
 * les retours de bascule. Donc `CycleService` / `IssueService` publient pour de bon leurs événements
 * et `BrainIngestionListener` écrit les nodes — on regarde ensuite ce que le cerveau en a fait.
 *
 * Usage :
 *   node scripts/scenario/play.mjs            # joue le scénario
 *   node scripts/scenario/play.mjs --reset    # supprime d'abord les projets s'ils existent
 *
 * À lancer APRÈS `.\scripts\db.ps1 seed` : le seed DROP `taskforce-demo` en cascade.
 */

import http from "node:http";
import { MAIN, SIDE, CROSS_NOTES, TEAM } from "./story.mjs";

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
 * le nom de service Docker), alors qu'on tape `localhost:8180` depuis l'hôte → sans ça, Keycloak
 * signe un token d'issuer `localhost:8180` et l'API répond 401 malgré un token parfaitement valide.
 *
 * ⚠️ C'est pourquoi le token passe par `node:http` et non `fetch` : undici (le client de `fetch`)
 * **ignore silencieusement** un `Host` fourni à la main.
 */
const ISSUER_HOST = process.env.KEYCLOAK_ISSUER_HOST ?? "keycloak:8080";

// ── Sortie ──────────────────────────────────────────────────────────────────
let token = null;
const log = (msg) => console.log(msg);
const phase = (msg) => console.log(`\n\x1b[36m▸ ${msg}\x1b[0m`);
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const warn = (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`);

/** Token Keycloak avec le bon issuer — `fetch` ne sait pas forcer `Host`, `node:http` si. */
function login() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "password",
    username: USER, password: PASS,
  }).toString();

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: KEYCLOAK_HOST, port: KEYCLOAK_PORT,
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
          } catch {
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

/**
 * Appel API → `response.data.data` (enveloppe ApiResponse, règle d'or n°4 du repo).
 *
 * Reprise sur **429** : le scénario enchaîne des centaines de requêtes et déclenche le
 * `RateLimitFilter`. Ce n'est pas une panne, c'est le serveur qui demande de ralentir.
 */
async function api(method, path, body, attempt = 0) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 429 && attempt < 8) {
    await sleep(2000 * (attempt + 1));
    return api(method, path, body, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  if (!text) return null;
  const json = JSON.parse(text);
  return json.data !== undefined ? json.data : json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Étapes ──────────────────────────────────────────────────────────────────

async function createProject(spec, reset) {
  const projects = await api("GET", `/api/workspaces/${SLUG}/projects`);
  const existing = projects.find((p) => p.identifier === spec.identifier);
  if (existing) {
    if (!reset) {
      throw new Error(
        `Le projet « ${existing.name} » (${spec.identifier}) existe déjà dans ${SLUG}.\n` +
          `   Relance avec --reset pour le supprimer et rejouer.`,
      );
    }
    warn(`--reset : suppression de « ${existing.name} » (#${existing.id})`);
    await api("DELETE", `/api/workspaces/${SLUG}/projects/${existing.id}`);
  }
  return api("POST", `/api/workspaces/${SLUG}/projects`, {
    name: spec.name, identifier: spec.identifier, description: spec.description, isPublic: true,
  });
}

/** Écrit une note si son titre n'existe pas déjà (le script doit rester rejouable). */
async function writeNote(note, projectIds, seen) {
  if (seen.has(note.title)) return false;
  await api("POST", `/api/workspaces/${SLUG}/brain/nodes`, {
    type: note.type, domain: note.domain, title: note.title,
    content: note.content, tags: note.tags, projects: projectIds,
  });
  seen.add(note.title);
  return true;
}

async function playProject(spec, reset, team, seenTitles) {
  phase(`${spec.name} — ouverture`);
  const project = await createProject(spec, reset);
  const pid = project.id;
  ok(`« ${project.name} » (${project.identifier}) — #${pid}`);

  const statuses = await api("GET", `/api/workspaces/${SLUG}/projects/${pid}/issues/statuses`);
  const types = await api("GET", `/api/workspaces/${SLUG}/projects/${pid}/issues/types`);
  const at = (cat) => statuses.find((s) => s.category === cat);
  const todo = at("UNSTARTED"), doing = at("STARTED"), done = at("COMPLETED");
  const typeId = (name) => types.find((t) => t.name === name)?.id ?? null;

  const cycleIds = [];
  let cursor = 0;

  for (const ph of spec.phases) {
    phase(`${spec.identifier} · ${ph.label}`);

    // 1. La connaissance du moment — écrite AVANT le sprint, comme dans la vraie vie.
    let written = 0;
    for (const note of ph.notes ?? []) {
      if (await writeNote(note, [pid], seenTitles)) written++;
    }
    if (written) {
      const domains = new Set((ph.notes ?? []).map((n) => n.domain));
      ok(`${written} notes écrites (${[...domains].join(", ")})`);
    }

    if (!ph.cycle) continue;

    // 2. Le sprint : issues → cycle → avancement → clôture.
    const created = [];
    for (const spc of ph.cycle.issues) {
      const issue = await api("POST", `/api/workspaces/${SLUG}/projects/${pid}/issues`, {
        title: spc.title,
        description: `Issue du cycle « ${ph.cycle.name} » — projet ${spec.name}.`,
        typeId: typeId(spc.type),
        priority: spc.priority,
        statusId: todo.id,
        assigneeId: team.length ? team[cursor++ % team.length] : null,
      });
      // storyPoints n'existe pas dans CreateIssueRequest → écrit à la mise à jour.
      await api("PATCH", `/api/workspaces/${SLUG}/projects/${pid}/issues/${issue.id}`, {
        storyPoints: spc.points,
      });
      created.push({ ...spc, id: issue.id });
    }

    const cycle = await api("POST", `/api/workspaces/${SLUG}/projects/${pid}/cycles`, {
      name: ph.cycle.name,
      description: `Sprint du projet ${spec.name}.`,
      startDate: ph.cycle.start,
      endDate: ph.cycle.end,
    });
    for (const i of created) {
      await api("POST", `/api/workspaces/${SLUG}/projects/${pid}/cycles/${cycle.id}/issues`, { issueId: i.id });
    }
    await api("PATCH", `/api/workspaces/${SLUG}/projects/${pid}/cycles/${cycle.id}`, { status: "ACTIVE" });
    cycleIds.push(cycle.id);

    let finished = 0;
    for (const i of created) {
      await api("PATCH", `/api/workspaces/${SLUG}/projects/${pid}/issues/${i.id}`, { statusId: doing.id });
      if (i.done) {
        // ── Transition réelle → IssueCompletedEvent → le relevé du cycle se rafraîchit.
        await api("PATCH", `/api/workspaces/${SLUG}/projects/${pid}/issues/${i.id}`, { statusId: done.id });
        finished++;
      }
    }

    if (ph.cycle.close) {
      // ── Transition réelle → CycleCompletedEvent → rétro écrite par le Brain OS.
      await api("PATCH", `/api/workspaces/${SLUG}/projects/${pid}/cycles/${cycle.id}`, { status: "COMPLETED" });
      ok(`${created.length} issues · ${finished} livrées · cycle clôturé → le cerveau écrit sa rétro`);
    } else {
      warn(`${created.length} issues · ${finished} livrées · cycle EN COURS → relevé vivant`);
    }
  }

  return { project, cycleIds };
}

async function play() {
  const reset = process.argv.includes("--reset");

  phase("Authentification");
  token = await login();
  ok(`Connecté en tant que ${USER}`);

  const members = await api("GET", `/api/workspaces/${SLUG}/members`);
  const team = members.map((m) => m.userId).filter(Boolean).slice(0, TEAM.length);
  ok(`Équipe de ${team.length} personnes sur le projet`);

  const seenTitles = new Set(
    ((await api("GET", `/api/workspaces/${SLUG}/brain`)).nodes ?? []).map((n) => n.title),
  );

  const played = [];
  for (const spec of [MAIN, SIDE]) {
    played.push(await playProject(spec, reset, team, seenTitles));
  }

  phase("Connaissance transverse");
  const all = await api("GET", `/api/workspaces/${SLUG}/projects`);
  const idOf = new Map(all.map((p) => [p.identifier, p.id]));
  for (const note of CROSS_NOTES) {
    const ids = note.projects.map((k) => idOf.get(k)).filter(Boolean);
    if (ids.length !== note.projects.length) {
      warn(`« ${note.title} » ignorée — projet(s) ${note.projects.join("/")} absent(s)`);
      continue;
    }
    if (await writeNote(note, ids, seenTitles)) ok(`${note.title} → ${note.projects.join(" + ")}`);
  }

  phase("Ce que le cerveau en a fait");
  const expected = played.flatMap((p) => p.cycleIds);
  const closed = [MAIN, SIDE].flatMap((p) => p.phases).filter((ph) => ph.cycle?.close).length;
  const nodes = await waitForNodes(expected, closed);
  if (nodes.length === 0) {
    warn("Aucun node d'ingestion — regarde les logs du backend.");
    process.exitCode = 1;
    return;
  }
  for (const n of nodes) {
    const mode = n.metadata?.mode === "generated" ? "faits + synthèse IA" : "faits seuls";
    ok(`«  ${n.title} » — ${mode} · ${n.metadata?.completionRate ?? "?"} % livré`);
  }

  // ── Invariant : UN node par cycle, mis à jour — jamais un node par événement.
  const perCycle = new Map();
  for (const n of nodes) perCycle.set(n.refId, (perCycle.get(n.refId) ?? 0) + 1);
  const dupes = [...perCycle.entries()].filter(([, c]) => c > 1);
  if (dupes.length) {
    warn(`Idempotence cassée : ${dupes.map(([c, n]) => `cycle ${c} → ${n} nodes`).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  ok(`Idempotence OK : ${perCycle.size} cycles → ${nodes.length} nodes`);

  const retros = nodes.filter((n) => n.metadata?.closed === true).length;
  if (retros < closed) {
    warn(`${retros}/${closed} rétros écrites — une ingestion de cycle a échoué.`);
    process.exitCode = 1;
    return;
  }

  const brain = await api("GET", `/api/workspaces/${SLUG}/brain`);
  log(`\n\x1b[32mTerminé.\x1b[0m ${brain.totalNodes} nodes dans le cerveau. Ouvre le graphe de ${SLUG}.`);
}

/**
 * L'ingestion est asynchrone (`@Async` + génération LLM) : on laisse au backend le temps d'écrire.
 * On ne regarde QUE les cycles joués par ce run — compter tous les nodes `CYCLE` du workspace
 * ferait passer la vérification au vert grâce à ceux d'un run précédent.
 */
async function waitForNodes(cycleIds, closedCount, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  const fetchNodes = async () => {
    const brain = await api("GET", `/api/workspaces/${SLUG}/brain`);
    return (brain.nodes ?? []).filter((n) => n.refType === "CYCLE" && cycleIds.includes(n.refId));
  };
  let announced = false;
  while (Date.now() < deadline) {
    const found = await fetchNodes();
    const done = found.filter((n) => n.metadata?.closed === true).length;
    if (found.length >= cycleIds.length && done >= closedCount) return found;
    if (!announced) {
      log(`  … ${closedCount} synthèses Qwen à générer, ça prend une minute ou deux`);
      announced = true;
    }
    await sleep(4000);
  }
  return fetchNodes();
}

play().catch((err) => {
  console.error(`\n\x1b[31m✗ ${err.message}\x1b[0m`);
  process.exit(1);
});
