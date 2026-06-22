/**
 * Service pour les opérations sur les issues.
 * Toutes les routes sont scopées par workspace slug + project id.
 */

import { apiClient } from "./client";
import { ISSUE_ROUTES, ROADMAP_ROUTES } from "../config/api-routes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IssuePriority = "NONE" | "URGENT" | "HIGH" | "MEDIUM" | "LOW";
export type IssueStatusCategory = "BACKLOG" | "UNSTARTED" | "STARTED" | "COMPLETED" | "CANCELLED";
export type IssueRelationType = "BLOCKS" | "BLOCKED_BY" | "DUPLICATE" | "RELATES_TO";
export type IssueActivityType =
  | "CREATED" | "STATUS_CHANGED" | "PRIORITY_CHANGED" | "ASSIGNEE_CHANGED"
  | "TYPE_CHANGED" | "TITLE_CHANGED" | "DESCRIPTION_CHANGED" | "LABEL_ADDED"
  | "LABEL_REMOVED" | "DUE_DATE_CHANGED" | "START_DATE_CHANGED" | "PARENT_CHANGED"
  | "COMMENT_ADDED" | "COMMENT_DELETED" | "COMPLETED" | "REOPENED";

export interface UserSummary {
  id: number;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface IssueStatus {
  id: number;
  name: string;
  color: string;
  category: IssueStatusCategory;
  position: number;
  isDefault: boolean;
}

export interface IssueType {
  id: number;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
}

export interface IssueLabel {
  id: number;
  name: string;
  color: string;
}

export interface IssueSummary {
  id: number;
  sequenceNumber: number;
  identifier: string;
  title: string;
  status: IssueStatus;
}

export interface Issue {
  id: number;
  sequenceNumber: number;
  identifier: string;
  projectId: number;
  projectName: string;
  title: string;
  description: string | null;
  priority: IssuePriority;
  status: IssueStatus;
  type: IssueType | null;
  assignee: UserSummary | null;
  reporter: UserSummary;
  parent: IssueSummary | null;
  childCount: number;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  storyPoints: number | null;
  labels: IssueLabel[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IssueComment {
  id: number;
  author: UserSummary;
  content: string;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IssueActivity {
  id: number;
  actor: UserSummary | null;
  action: IssueActivityType;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface SmartAssignCandidate {
  userId: number;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  score: number;
  semanticScore: number;
  historicalScore: number;
  workloadScore: number;
  availability: number;
  openIssues: number;
  labelMatchCount: number;
  factors: string[];
  /** Explication en langage naturel (Groq) ou synthèse (repli). */
  reason: string | null;
  /** Compétences du membre recoupant les labels de l'issue. */
  matchedSkills: string[];
}

export interface SmartAssignResult {
  recommended: SmartAssignCandidate | null;
  alternatives: SmartAssignCandidate[];
  strategy: string;
  fallbackUsed: boolean;
}

export interface CreateIssuePayload {
  title: string;
  description?: string;
  statusId?: number;
  typeId?: number;
  priority?: IssuePriority;
  assigneeId?: number;
  parentId?: number;
  startDate?: string;
  dueDate?: string;
}

export interface UpdateIssuePayload {
  title?: string;
  description?: string;
  statusId?: number;
  typeId?: number;
  priority?: IssuePriority;
  assigneeId?: number | null;
  parentId?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  position?: number;
  /** Story points : undefined = pas de changement ; 0 = retirer l'estimation ; >0 = valeur */
  storyPoints?: number;
  /** null = pas de changement ; [] = retirer tous les labels */
  labelIds?: number[];
}

export interface StatusPosition {
  id: number;
  position: number;
}

export interface ReorderStatusesPayload {
  statuses: StatusPosition[];
}

export interface IssueRelation {
  id: number;
  relationType: IssueRelationType;
  issue: IssueSummary;
  relatedIssue: IssueSummary;
  createdBy: UserSummary;
  createdAt: string;
}

export interface CreateIssueRelationPayload {
  targetIssueId: number;
  relationType: IssueRelationType;
}

export interface CreateIssueStatusPayload {
  name: string;
  color?: string;
  category: IssueStatusCategory;
  position?: number;
}

export interface UpdateIssueStatusPayload {
  name?: string;
  color?: string;
  position?: number;
  isDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export async function listIssues(slug: string, projectId: number): Promise<Issue[]> {
  const res = await apiClient.get<{ data: Issue[] }>(ISSUE_ROUTES.LIST(slug, projectId));
  return res.data.data;
}

/** Vue My Work : issues assignées à l'utilisateur courant, tous projets du workspace */
export async function listMyIssues(slug: string): Promise<Issue[]> {
  const res = await apiClient.get<{ data: Issue[] }>(ISSUE_ROUTES.MY_ISSUES(slug));
  return res.data.data;
}

/**
 * Retourne les issues planifiées (startDate ou dueDate renseigné) du workspace — roadmap.
 */
export async function getScheduledIssues(slug: string): Promise<Issue[]> {
  const res = await apiClient.get<{ data: Issue[] }>(ROADMAP_ROUTES.SCHEDULED(slug));
  return res.data.data;
}

export async function getIssue(slug: string, projectId: number, issueId: number): Promise<Issue> {
  const res = await apiClient.get<{ data: Issue }>(ISSUE_ROUTES.BY_ID(slug, projectId, issueId));
  return res.data.data;
}

export async function createIssue(
  slug: string,
  projectId: number,
  payload: CreateIssuePayload
): Promise<Issue> {
  const res = await apiClient.post<{ data: Issue }>(ISSUE_ROUTES.CREATE(slug, projectId), payload);
  return res.data.data;
}

export async function updateIssue(
  slug: string,
  projectId: number,
  issueId: number,
  payload: UpdateIssuePayload
): Promise<Issue> {
  const res = await apiClient.patch<{ data: Issue }>(ISSUE_ROUTES.UPDATE(slug, projectId, issueId), payload);
  return res.data.data;
}

export async function deleteIssue(
  slug: string,
  projectId: number,
  issueId: number
): Promise<void> {
  await apiClient.delete(ISSUE_ROUTES.DELETE(slug, projectId, issueId));
}

// ---------------------------------------------------------------------------
// Statuts
// ---------------------------------------------------------------------------

export async function listStatuses(slug: string, projectId: number): Promise<IssueStatus[]> {
  const res = await apiClient.get<{ data: IssueStatus[] }>(ISSUE_ROUTES.STATUSES(slug, projectId));
  return res.data.data;
}

export async function createStatus(
  slug: string,
  projectId: number,
  payload: CreateIssueStatusPayload
): Promise<IssueStatus> {
  const res = await apiClient.post<{ data: IssueStatus }>(ISSUE_ROUTES.STATUSES(slug, projectId), payload);
  return res.data.data;
}

export async function updateStatus(
  slug: string,
  projectId: number,
  statusId: number,
  payload: UpdateIssueStatusPayload
): Promise<IssueStatus> {
  const res = await apiClient.patch<{ data: IssueStatus }>(ISSUE_ROUTES.STATUS(slug, projectId, statusId), payload);
  return res.data.data;
}

export async function deleteStatus(
  slug: string,
  projectId: number,
  statusId: number
): Promise<void> {
  await apiClient.delete(ISSUE_ROUTES.STATUS(slug, projectId, statusId));
}

// ---------------------------------------------------------------------------
// Types d'issues
// ---------------------------------------------------------------------------

export async function listTypes(slug: string, projectId: number): Promise<IssueType[]> {
  const res = await apiClient.get<{ data: IssueType[] }>(ISSUE_ROUTES.TYPES(slug, projectId));
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Commentaires
// ---------------------------------------------------------------------------

export async function listComments(
  slug: string,
  projectId: number,
  issueId: number
): Promise<IssueComment[]> {
  const res = await apiClient.get<{ data: IssueComment[] }>(ISSUE_ROUTES.COMMENTS(slug, projectId, issueId));
  return res.data.data;
}

export async function addComment(
  slug: string,
  projectId: number,
  issueId: number,
  content: string
): Promise<IssueComment> {
  const res = await apiClient.post<{ data: IssueComment }>(
    ISSUE_ROUTES.COMMENTS(slug, projectId, issueId),
    { content }
  );
  return res.data.data;
}

export async function updateComment(
  slug: string,
  projectId: number,
  issueId: number,
  commentId: number,
  content: string
): Promise<IssueComment> {
  const res = await apiClient.patch<{ data: IssueComment }>(
    ISSUE_ROUTES.COMMENT(slug, projectId, issueId, commentId),
    { content }
  );
  return res.data.data;
}

export async function deleteComment(
  slug: string,
  projectId: number,
  issueId: number,
  commentId: number
): Promise<void> {
  await apiClient.delete(ISSUE_ROUTES.COMMENT(slug, projectId, issueId, commentId));
}

// ---------------------------------------------------------------------------
// Activité
// ---------------------------------------------------------------------------

export async function listActivity(
  slug: string,
  projectId: number,
  issueId: number
): Promise<IssueActivity[]> {
  const res = await apiClient.get<{ data: IssueActivity[] }>(ISSUE_ROUTES.ACTIVITY(slug, projectId, issueId));
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Smart Assign
// ---------------------------------------------------------------------------

export async function smartAssignIssue(
  slug: string,
  projectId: number,
  issueId: number
): Promise<SmartAssignResult> {
  const res = await apiClient.post<{ data: SmartAssignResult }>(
    ISSUE_ROUTES.SMART_ASSIGN(slug, projectId, issueId)
  );
  return res.data.data;
}

// --- Checklist (PROD-2.3) ---
export interface ChecklistItem {
  id: number;
  content: string;
  done: boolean;
  position: number;
}

export async function listChecklist(slug: string, projectId: number, issueId: number): Promise<ChecklistItem[]> {
  const res = await apiClient.get<{ data: ChecklistItem[] }>(ISSUE_ROUTES.CHECKLIST(slug, projectId, issueId));
  return res.data.data;
}

export async function addChecklistItem(slug: string, projectId: number, issueId: number, content: string): Promise<ChecklistItem> {
  const res = await apiClient.post<{ data: ChecklistItem }>(ISSUE_ROUTES.CHECKLIST(slug, projectId, issueId), { content });
  return res.data.data;
}

export async function updateChecklistItem(
  slug: string, projectId: number, issueId: number, itemId: number,
  payload: { content?: string; done?: boolean; position?: number }
): Promise<ChecklistItem> {
  const res = await apiClient.patch<{ data: ChecklistItem }>(ISSUE_ROUTES.CHECKLIST_ITEM(slug, projectId, issueId, itemId), payload);
  return res.data.data;
}

export async function deleteChecklistItem(slug: string, projectId: number, issueId: number, itemId: number): Promise<void> {
  await apiClient.delete(ISSUE_ROUTES.CHECKLIST_ITEM(slug, projectId, issueId, itemId));
}

/** Sous-tâches (issues enfants) d'une issue. */
export async function listChildIssues(
  slug: string,
  projectId: number,
  issueId: number
): Promise<Issue[]> {
  const res = await apiClient.get<{ data: Issue[] }>(ISSUE_ROUTES.CHILDREN(slug, projectId, issueId));
  return res.data.data;
}

/** Brouillon d'issue pour une suggestion Smart Assign à la création (dry-run). */
export interface SmartAssignDraft {
  title: string;
  description?: string;
  labels?: string[];
  priority?: IssuePriority;
}

export async function smartAssignPreview(
  slug: string,
  projectId: number,
  draft: SmartAssignDraft
): Promise<SmartAssignResult> {
  const res = await apiClient.post<{ data: SmartAssignResult }>(
    ISSUE_ROUTES.SMART_ASSIGN_PREVIEW(slug, projectId),
    draft
  );
  return res.data.data;
}

/** Recommandation Smart Assign en lot (multi-assign). */
export interface BulkSmartAssignItem {
  issueId: number;
  recommended: SmartAssignCandidate | null;
}

export async function smartAssignBulk(
  slug: string,
  projectId: number,
  issueIds: number[]
): Promise<BulkSmartAssignItem[]> {
  const res = await apiClient.post<{ data: BulkSmartAssignItem[] }>(
    ISSUE_ROUTES.SMART_ASSIGN_BULK(slug, projectId),
    { issueIds }
  );
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Reorder statuts
// ---------------------------------------------------------------------------

export async function reorderStatuses(
  slug: string,
  projectId: number,
  payload: ReorderStatusesPayload
): Promise<IssueStatus[]> {
  const res = await apiClient.post<{ data: IssueStatus[] }>(
    ISSUE_ROUTES.STATUSES_REORDER(slug, projectId),
    payload
  );
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export async function listRelations(
  slug: string,
  projectId: number,
  issueId: number
): Promise<IssueRelation[]> {
  const res = await apiClient.get<{ data: IssueRelation[] }>(
    ISSUE_ROUTES.RELATIONS(slug, projectId, issueId)
  );
  return res.data.data;
}

export async function addRelation(
  slug: string,
  projectId: number,
  issueId: number,
  payload: CreateIssueRelationPayload
): Promise<IssueRelation> {
  const res = await apiClient.post<{ data: IssueRelation }>(
    ISSUE_ROUTES.RELATIONS(slug, projectId, issueId),
    payload
  );
  return res.data.data;
}

export async function deleteRelation(
  slug: string,
  projectId: number,
  issueId: number,
  relationId: number
): Promise<void> {
  await apiClient.delete(ISSUE_ROUTES.RELATION(slug, projectId, issueId, relationId));
}
