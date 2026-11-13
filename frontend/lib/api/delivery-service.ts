/**
 * Service de délégation à un agent de livraison (coding agent) - TF-AGENT-DELIVERY.
 * Slice 2 : liste des providers délégables (pour le picker « déléguer à... »).
 */

import { apiClient } from "./client";
import { saveBlob } from "./project-service";
import { DELIVERY_ROUTES } from "../config/api-routes";

/**
 * Agent de la délégation. `available=false` = coupé sur l'instance ; `ready=false` = pas encore utilisable par la
 * personne connectée (ou sur ce projet), `reason` dit quoi faire.
 */
export interface DeliveryProvider {
  key: string;
  displayName: string;
  logoKey: string;
  available: boolean;
  models: string[];
  ready: boolean;
  reason: string | null;
  /** Un agent à l'essai (R51) : le menu le dit. */
  trial?: boolean;
}

/** Agents de la délégation pour la personne connectée, et pour ce projet si `projectId` est donné. */
export async function getDeliveryProviders(slug: string, projectId?: number): Promise<DeliveryProvider[]> {
  const res = await apiClient.get<{ data: DeliveryProvider[] }>(DELIVERY_ROUTES.PROVIDERS(slug, projectId));
  return res.data.data;
}

export type DeliveryRunStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

/** État d'un run de délégation d'une issue. `summary`/`resultUrl` non nuls quand DONE. */
export interface DeliveryRun {
  id: number;
  issueId: number;
  /** Clé lisible de l'issue (ex. "WEB-12"). Avec le titre et le projet, rend le run lisible hors de sa fiche. */
  issueKey: string | null;
  issueTitle: string | null;
  /** Projet de l'issue : requis par le lien profond `/projects/{projectId}?issue={issueId}`. */
  projectId: number | null;
  projectName: string | null;
  providerKey: string;
  model: string | null;
  status: DeliveryRunStatus;
  summary: string | null;
  resultUrl: string | null;
  error: string | null;
  /** Refusée au départ par une règle (FAILED pour la file) : l'écran dit « Not started », pas une panne (R38). */
  refused?: boolean;
  startedById: number | null;
  /** Le nom de la personne qui a délégué (son e-mail sans nom) : l'issue montre l'agent qui travaille pour elle. */
  startedByName?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Le travail commencé (le runner a pris la mission) et fini : la durée de la carte de résultat (R78). */
  claimedAt?: string | null;
  endedAt?: string | null;
  /** La version des règles de la mission. */
  rulesVersion?: number | null;
  /** La branche de l'agent et ses commits ; absents sans changement de code. */
  branch?: string | null;
  commits?: number | null;
  /** Les tests du projet tels que le runner les a lancés (R32), jamais ce que l'agent en dit. */
  tests?: DeliveryRunTests | null;
  /** Le geste de la personne sur la carte de résultat, et quand ; absents tant qu'elle n'a pas tranché. */
  outcome?: DeliveryRunOutcome | null;
  outcomeAt?: string | null;
  /** La mission que celle-ci reprend sur la même branche (R139) ; absente d'une mission neuve. */
  followUpOf?: number | null;
}

/**
 * `MARKED_DONE` : la mission n'a rien changé, la personne a terminé l'issue (rejeu de la 1.8.0). `FOLLOWED_UP` : la
 * personne a commenté des lignes, une reprise continue la même branche (R139). `STOPPED` : la personne l'a arrêtée
 * pendant le travail (R138) ; son état reste FAILED pour la file, mais ce n'est pas une panne.
 */
export type DeliveryRunOutcome = "APPLIED" | "DISCARDED" | "RETRIED" | "MARKED_DONE" | "FOLLOWED_UP" | "STOPPED";

export interface DeliveryRunTests {
  command: string;
  ran: boolean;
  passed: boolean;
  /** Combien ont passé, sur combien, quand la sortie des tests le dit. */
  passedCount: number | null;
  total: number | null;
  /** Un fichier a été remis comme avant après leur passage : le résultat porte sur une version d'avant (R139). */
  stale?: boolean;
}

/** Un fichier qu'une mission a changé, relevé par le runner (R139). */
export interface MissionFileChange {
  path: string;
  /** `written` : un fichier d'un dossier jetable, qui n'a pas d'« avant ». */
  status: "added" | "modified" | "deleted" | "written";
  /** Lignes ajoutées et retirées ; null pour un binaire. */
  added: number | null;
  removed: number | null;
  binary: boolean;
  truncated: boolean;
  /** Un fichier qui peut porter un secret : son texte n'a jamais quitté le poste. */
  withheld: boolean;
  /** L'empreinte de ce qui a changé : le diff ouvert se relit quand elle bouge. */
  revision: string;
  /** Le runner est en train de le remettre comme avant. */
  reverting: boolean;
  /** Pourquoi la dernière tentative n'a pas abouti, en mots. */
  error: string | null;
  updatedAt: string | null;
}

/** Ce qu'est devenue la dernière correction de la personne. */
export interface MissionCorrection {
  id: number;
  text: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "EXPIRED";
  message: string | null;
}

/** Les changements d'une mission, et ce que la personne connectée peut en faire maintenant (R139, R15). */
export interface MissionChanges {
  /** `repo`, `scratch`, ou null : le runner n'a rien relevé (runner plus ancien, ou pas encore parti). */
  mode: "repo" | "scratch" | null;
  live: boolean;
  added: number;
  removed: number;
  /** Les fichiers au-delà du plafond, comptés dans les totaux. */
  more: number;
  files: MissionFileChange[];
  canRevert: boolean;
  canComment: boolean;
  canCorrect: boolean;
  /** Pourquoi ces gestes manquent, quand une phrase utile existe. */
  blockedReason: string | null;
  correction: MissionCorrection | null;
}

/** Le texte d'un fichier de la mission : un patch (`diff`) ou un contenu (`text`, dossier jetable). */
export interface MissionFileDiff {
  path: string;
  format: "diff" | "text";
  body: string | null;
  binary: boolean;
  truncated: boolean;
  withheld: boolean;
  revision: string;
}

/** Un commentaire de relecture sur une ligne : `new` dans la version de l'agent, `old` une ligne qu'il a retirée. */
export interface ChangeComment {
  path: string;
  line: number;
  side: "new" | "old";
  text: string;
}

/** Les changements d'une mission. Lu en boucle pendant le travail : jamais de toast. */
export async function getMissionChanges(slug: string, runId: number): Promise<MissionChanges> {
  const res = await apiClient.get<{ data: MissionChanges }>(DELIVERY_ROUTES.CHANGES(slug, runId), { silentError: true });
  return res.data.data;
}

/** Le diff d'un fichier de la mission. Une erreur remonte à l'appelant. */
export async function getMissionFileDiff(slug: string, runId: number, path: string): Promise<MissionFileDiff> {
  const res = await apiClient.get<{ data: MissionFileDiff }>(DELIVERY_ROUTES.CHANGED_FILE(slug, runId), { params: { path }, silentError: true });
  return res.data.data;
}

/** Remet un fichier comme avant la mission : le runner le fait, la liste dit quand c'est fait. */
export async function revertMissionFile(slug: string, runId: number, path: string): Promise<void> {
  await apiClient.post(DELIVERY_ROUTES.REVERT_FILE(slug, runId), { path }, { silentError: true });
}

/** Les commentaires sur les lignes, envoyés ensemble : rend la mission qui repart sur la même branche. */
export async function askForChanges(slug: string, runId: number, comments: ChangeComment[]): Promise<DeliveryRun> {
  const res = await apiClient.post<{ data: DeliveryRun }>(DELIVERY_ROUTES.FOLLOW_UP(slug, runId), { comments }, { silentError: true });
  return res.data.data;
}

/** Une correction tapée pendant le travail : l'agent la lit à sa prochaine étape. */
export async function sendCorrection(slug: string, runId: number, text: string): Promise<void> {
  await apiClient.post(DELIVERY_ROUTES.CORRECTION(slug, runId), { text }, { silentError: true });
}

/**
 * « Apply » (R78) : la pull request de l'agent est fusionnée sur GitHub, puis l'issue terminée. Si les tests ont échoué,
 * le serveur demande la raison de passer outre (R87) : elle part sans ses blancs.
 */
export async function applyRun(slug: string, runId: number, reason = ""): Promise<void> {
  await apiClient.post(DELIVERY_ROUTES.APPLY(slug, runId), reason.trim() ? { reason: reason.trim() } : {});
}

/** « Discard » : la pull request est fermée, sa branche supprimée. */
export async function discardRun(slug: string, runId: number): Promise<void> {
  await apiClient.post(DELIVERY_ROUTES.DISCARD(slug, runId), {});
}

/** « Mark as done » : la mission n'a rien changé (ni pull request ni commit), l'issue se termine. */
export async function markRunDone(slug: string, runId: number): Promise<void> {
  await apiClient.post(DELIVERY_ROUTES.DONE(slug, runId), {});
}

/** « Try again » : le résultat écarté, la remarque postée sur l'issue, une nouvelle mission ; rend cette mission. */
export async function retryRun(slug: string, runId: number, note: string): Promise<DeliveryRun> {
  const res = await apiClient.post<{ data: DeliveryRun }>(DELIVERY_ROUTES.RETRY(slug, runId), note.trim() ? { note: note.trim() } : {});
  return res.data.data;
}

/** « Stop » : la mission se clôt, au nom de la personne ; le runner arrête l'agent à son prochain signe de vie (R138). */
export async function stopRun(slug: string, runId: number): Promise<void> {
  await apiClient.post(DELIVERY_ROUTES.STOP(slug, runId), {}, { silentError: true });
}

/** Délègue une issue à un agent (crée un run, exécuté en arrière-plan côté serveur). */
export async function delegateIssue(
  slug: string,
  issueId: number,
  providerKey: string,
  model?: string,
): Promise<DeliveryRun> {
  const res = await apiClient.post<{ data: DeliveryRun }>(
    DELIVERY_ROUTES.DELEGATE(slug, issueId),
    { providerKey, model },
  );
  return res.data.data;
}

/** Dernier run de délégation d'une issue, ou null si aucune délégation. */
export async function getIssueRun(slug: string, issueId: number): Promise<DeliveryRun | null> {
  const res = await apiClient.get<{ data: DeliveryRun | null }>(DELIVERY_ROUTES.RUN(slug, issueId));
  return res.data.data;
}

/** Runs de délégation du workspace (les plus récents), pour la vue « workflow » (agents en parallèle). */
export async function listWorkspaceRuns(slug: string): Promise<DeliveryRun[]> {
  const res = await apiClient.get<{ data: DeliveryRun[] }>(DELIVERY_ROUTES.RUNS(slug), { silentError: true });
  return res.data.data ?? [];
}

/**
 * Une mission de la personne qui attend sa réponse (R128, séance n°19) : une ligne par mission, avec le nombre de ses
 * demandes encore ouvertes. Lue de la demande elle-même, jamais de sa notification.
 */
export interface OpenApproval {
  runId: number;
  issueId: number;
  issueKey: string | null;
  issueTitle: string | null;
  projectId: number | null;
  requests: number;
}

/** Ce qui attend la personne dans l'espace, lu en arrière-plan : la mission qui attend depuis le plus longtemps d'abord. */
export async function listOpenApprovals(slug: string): Promise<OpenApproval[]> {
  const res = await apiClient.get<{ data: OpenApproval[] }>(DELIVERY_ROUTES.OPEN_APPROVALS(slug), { silentError: true });
  return res.data.data ?? [];
}

/** Un événement de la chronologie d'un run du runner local (lot 5). */
export interface DeliveryRunEvent {
  seq: number;
  /**
   * `exit` : une sortie du runner (push, pull request), faite ou non ; `limit` : le plafond d'événements atteint ;
   * `test` : les tests du projet, lancés par le runner après l'agent (S1).
   */
  kind: "start" | "text" | "tool" | "error" | "denied" | "exit" | "limit" | "test";
  tool: string | null;
  text: string;
  at: string | null;
}

export type DeliveryApprovalStatus = "PENDING" | "ALLOWED" | "DENIED" | "EXPIRED";

/** Demande de validation d'une action de l'agent. `canDecide` : c'est à la personne connectée de répondre. */
export interface DeliveryRunApproval {
  id: number;
  tool: string;
  summary: string;
  status: DeliveryApprovalStatus;
  createdAt: string | null;
  expiresAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  canDecide: boolean;
  /** Qui demande : l'agent, ou TaskForce lui-même avant une sortie, les tests du projet ou un départ (décision J4). */
  askedBy?: "agent" | "runner";
  /** L'action que les règles ont jugée (`web.search`, `shell`...), pour la dire en mots (R78) ; absente d'un runner plus ancien. */
  action?: string | null;
  /** La règle qui demande, et sa raison telle qu'elle s'écrit pour la personne ; absentes quand aucune ne couvre l'action. */
  rule?: string | null;
  reason?: string | null;
  /** Portée d'un accord : `ONCE`, ou `MISSION` pour le reste de la mission (R46). */
  scope?: "ONCE" | "MISSION" | null;
  /**
   * Les personnes qu'une règle de l'entreprise désigne pour accorder (R98), une liste par règle : un nom, ou la référence
   * d'un rôle (`role:admin`, `role:owner`, `project-lead`) ; vide pour un accord ordinaire.
   */
  waitingFor?: string[][];
  /** Le nombre de personnes distinctes qui accordent. */
  signatures?: number;
  /** La personne qui a délégué ne signe pas. */
  separate?: boolean;
  /** Qui a déjà accordé, quand il en faut plusieurs. */
  signedBy?: string[];
  /**
   * La décision lie : une règle de l'entreprise, une règle qui porte des obligations (qui accorde, des signatures, un
   * seuil), ou le socle. L'accord n'y vaut qu'une fois : l'écran n'offre pas « pour cette mission ».
   */
  binding?: boolean;
}

export interface DeliveryRunActivity {
  events: DeliveryRunEvent[];
  approvals: DeliveryRunApproval[];
}

/**
 * L'étape en cours d'une mission, telle que le serveur la connaît : le dernier événement de sa chronologie. Les cinq
 * étapes (comprendre, prévoir, faire, vérifier, rendre) se lisent de toute la chronologie (`missionSequence`), comme sur
 * la vue du travail : `seq` dit si la chronologie lue est à jour.
 */
export interface ProjectRunStep {
  seq: number;
  kind: DeliveryRunEvent["kind"];
  tool: string | null;
  at: string | null;
}

/** Les liens d'une mission : sa branche, sa pull request, la mission qu'elle reprend et la dernière qui la reprend (R139). */
export interface ProjectRunLinks {
  branch: string | null;
  pullRequestUrl: string | null;
  followUpOf: number | null;
  followedUpBy: number | null;
}

/** Une mission d'un projet telle que la vue du workflow la lit (R166) : elle, son étape en cours, ses liens, ses demandes. */
export interface ProjectRun {
  run: DeliveryRun;
  /** Nulle tant que la mission n'a rien fait. */
  step: ProjectRunStep | null;
  links: ProjectRunLinks;
  /** Ses demandes encore ouvertes ; `canDecide` : la personne connectée peut y répondre, comme les règles en décident. */
  approvals: DeliveryRunApproval[];
}

/** Une page des missions d'un projet, les plus récentes d'abord. */
export interface ProjectRunsPage {
  content: ProjectRun[];
  pageNumber: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

/**
 * Ce que publie le topic des missions d'un projet, `/topic/projects.{projectId}.delivery` : qu'une mission a changé. Sans
 * ce que seule la personne connectée peut savoir (`canDecide`) : la mission se relit pour cela.
 */
export interface ProjectDeliveryEvent {
  /** `run` : son état, son résultat, ses liens ; `approval` : une demande ouverte ou tranchée ; `step` : une étape de plus. */
  type: "run" | "approval" | "step";
  projectId: number;
  runId: number;
  issueId: number | null;
  status: DeliveryRunStatus | null;
  outcome: DeliveryRunOutcome | null;
  approvalId: number | null;
  approvalStatus: DeliveryApprovalStatus | null;
  /** La nouvelle étape en cours, pour `step`. */
  step: ProjectRunStep | null;
}

/** Les missions d'un projet et leurs demandes ouvertes, une page à la fois. Lu en arrière-plan : jamais de toast. */
export async function listProjectRuns(slug: string, projectId: number, page = 0, size = 20): Promise<ProjectRunsPage> {
  const res = await apiClient.get<{ data: ProjectRunsPage }>(DELIVERY_ROUTES.PROJECT_RUNS(slug, projectId), {
    params: { page, size }, silentError: true,
  });
  return res.data.data;
}

/** Une mission d'un projet, comme une ligne de la liste : relue quand le topic du projet l'annonce. Jamais de toast. */
export async function getProjectRun(slug: string, projectId: number, runId: number): Promise<ProjectRun> {
  const res = await apiClient.get<{ data: ProjectRun }>(DELIVERY_ROUTES.PROJECT_RUN(slug, projectId, runId), { silentError: true });
  return res.data.data;
}

/** Chronologie d'un run après l'événement `after`, et ses demandes. Lu en boucle pendant le run : jamais de toast. */
export async function getRunActivity(slug: string, runId: number, after: number): Promise<DeliveryRunActivity> {
  const res = await apiClient.get<{ data: DeliveryRunActivity }>(DELIVERY_ROUTES.ACTIVITY(slug, runId, after), { silentError: true });
  return res.data.data;
}

/** Autorise ou refuse une action demandée par l'agent. */
export async function decideApproval(
  slug: string, runId: number, approvalId: number, allow: boolean, forMission = false,
): Promise<void> {
  await apiClient.post(DELIVERY_ROUTES.DECIDE(slug, runId, approvalId), {
    decision: allow ? "ALLOW" : "DENY",
    ...(allow && forMission ? { scope: "MISSION" } : {}),
  });
}

/**
 * Télécharge le dossier de preuve d'un run : le JSON se vérifie sans TaskForce, le Markdown se lit. Une erreur
 * (run sans dossier) remonte à l'appelant.
 */
export async function downloadEvidence(slug: string, runId: number, format: "json" | "md"): Promise<void> {
  const res = await apiClient.get(DELIVERY_ROUTES.EVIDENCE(slug, runId), { params: { format }, responseType: "blob", silentError: true });
  saveBlob(res.data as Blob, `evidence-run-${runId}.${format}`);
}

/** Un événement du dossier de preuve (`taskforce-evidence/1`) : chaîné au précédent par son empreinte. */
export interface MissionEvidenceEvent {
  seq: number;
  /** UTC, avec son « Z ». */
  at: string;
  /** `mission.started`, `action.requested`, `action.decided`, `human.decision`, `test.result`, `mission.ended`... */
  type: string;
  actor: { kind: string; id: string };
  data: Record<string, unknown> | null;
  prev: string;
  hash: string;
}

/** Le dossier de preuve d'une mission, tel qu'il se construit : ses événements et l'empreinte du dernier. */
export interface MissionEvidence {
  format: string;
  events: MissionEvidenceEvent[];
  root: string;
}

/**
 * Le dossier de preuve d'un run, en JSON, lu pour la vue du travail (R95, point 3) ; la même route que le
 * téléchargement. Une erreur (un run sans dossier : 404) remonte à l'appelant.
 */
export async function getEvidence(slug: string, runId: number): Promise<MissionEvidence> {
  const res = await apiClient.get<MissionEvidence>(DELIVERY_ROUTES.EVIDENCE(slug, runId), {
    params: { format: "json" }, silentError: true,
  });
  return res.data;
}

/** Runner local de l'utilisateur (ADR-013), tel que le serveur le connaît. Ne contient jamais de secret. */
export interface RunnerStatus {
  /** Une identité de runner est déjà provisionnée pour cet utilisateur. */
  exists: boolean;
  /** Client Keycloak du runner (`TASKFORCE_RUNNER_CLIENT_ID`). */
  clientId: string;
  /** Propriétaire signé : le runner ne réclame que les délégations de cet e-mail. */
  ownerEmail: string;
}

/** Identité fraîchement provisionnée. Le secret n'est renvoyé qu'une fois, à copier dans le `.env` du runner. */
export interface RunnerProvision {
  clientId: string;
  clientSecret: string;
  ownerEmail: string;
}

/** État du runner local de l'utilisateur connecté. Appel de fond (ouverture du panneau) : jamais de toast. */
export async function getRunnerStatus(): Promise<RunnerStatus> {
  const res = await apiClient.get<{ data: RunnerStatus }>(DELIVERY_ROUTES.RUNNER, { silentError: true });
  return res.data.data;
}

/** Provisionne le runner local de l'utilisateur, ou régénère son secret (l'ancien cesse de fonctionner). */
export async function provisionRunner(): Promise<RunnerProvision> {
  const res = await apiClient.post<{ data: RunnerProvision }>(DELIVERY_ROUTES.RUNNER);
  return res.data.data;
}
