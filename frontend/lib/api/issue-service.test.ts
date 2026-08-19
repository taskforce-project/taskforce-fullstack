import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listIssues,
  listMyIssues,
  getScheduledIssues,
  getIssue,
  createIssue,
  updateIssue,
  deleteIssue,
  setIssueArchived,
  setIssuePinned,
  listStatuses,
  createStatus,
  updateStatus,
  deleteStatus,
  listTypes,
  listComments,
  addComment,
  updateComment,
  deleteComment,
  listActivity,
  smartAssignIssue,
  listChecklist,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  listWorklogs,
  addWorklog,
  deleteWorklog,
  listChildIssues,
  smartAssignPreview,
  smartAssignBulk,
  reorderStatuses,
  listRelations,
  addRelation,
  deleteRelation,
} from './issue-service';
import { apiClient, AI_TIMEOUT_MS } from './client';
import { ISSUE_ROUTES, ROADMAP_ROUTES } from '../config/api-routes';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  getErrorMessage: vi.fn((e: any) => e?.message || 'error'),
  AI_TIMEOUT_MS: 200_000,
}));

const SLUG = 'acme';
const PID = 3;
const IID = 100;
const envelope = <T>(payload: T) => ({ data: { success: true, message: 'ok', data: payload } });

describe('issue-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Issues CRUD ---
  describe('listIssues', () => {
    it('GET la liste des issues du projet', async () => {
      const issues = [{ id: 1, title: 'A' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(issues));

      const result = await listIssues(SLUG, PID);

      expect(apiClient.get).toHaveBeenCalledWith(ISSUE_ROUTES.LIST(SLUG, PID));
      expect(result).toEqual(issues);
    });

    it('propage l’erreur', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
      await expect(listIssues(SLUG, PID)).rejects.toThrow('boom');
    });
  });

  describe('listMyIssues', () => {
    it('GET les issues assignées (My Work)', async () => {
      const issues = [{ id: 2 }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(issues));

      const result = await listMyIssues(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(ISSUE_ROUTES.MY_ISSUES(SLUG));
      expect(result).toEqual(issues);
    });
  });

  describe('getScheduledIssues', () => {
    it('GET les issues planifiées (roadmap)', async () => {
      const issues = [{ id: 3 }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(issues));

      const result = await getScheduledIssues(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(ROADMAP_ROUTES.SCHEDULED(SLUG));
      expect(result).toEqual(issues);
    });
  });

  describe('getIssue', () => {
    it('GET une issue par id', async () => {
      const issue = { id: IID, title: 'X' } as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(issue));

      const result = await getIssue(SLUG, PID, IID);

      expect(apiClient.get).toHaveBeenCalledWith(ISSUE_ROUTES.BY_ID(SLUG, PID, IID));
      expect(result).toEqual(issue);
    });
  });

  describe('createIssue', () => {
    it('POST le payload de création', async () => {
      const payload = { title: 'New', priority: 'HIGH' as const };
      const issue = { id: IID, ...payload } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(issue));

      const result = await createIssue(SLUG, PID, payload);

      expect(apiClient.post).toHaveBeenCalledWith(ISSUE_ROUTES.CREATE(SLUG, PID), payload);
      expect(result).toEqual(issue);
    });
  });

  describe('updateIssue', () => {
    it('PATCH le payload de mise à jour', async () => {
      const payload = { title: 'Renamed' };
      const issue = { id: IID, title: 'Renamed' } as any;
      vi.mocked(apiClient.patch).mockResolvedValue(envelope(issue));

      const result = await updateIssue(SLUG, PID, IID, payload);

      expect(apiClient.patch).toHaveBeenCalledWith(ISSUE_ROUTES.UPDATE(SLUG, PID, IID), payload);
      expect(result).toEqual(issue);
    });
  });

  describe('deleteIssue', () => {
    it('DELETE une issue', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteIssue(SLUG, PID, IID);

      expect(apiClient.delete).toHaveBeenCalledWith(ISSUE_ROUTES.DELETE(SLUG, PID, IID));
    });
  });

  describe('setIssueArchived', () => {
    it('PATCH la route ARCHIVE quand archived=true', async () => {
      const issue = { id: IID, archived: true } as any;
      vi.mocked(apiClient.patch).mockResolvedValue(envelope(issue));

      const result = await setIssueArchived(SLUG, PID, IID, true);

      expect(apiClient.patch).toHaveBeenCalledWith(ISSUE_ROUTES.ARCHIVE(SLUG, PID, IID), {});
      expect(result).toEqual(issue);
    });

    it('PATCH la route UNARCHIVE quand archived=false', async () => {
      const issue = { id: IID, archived: false } as any;
      vi.mocked(apiClient.patch).mockResolvedValue(envelope(issue));

      const result = await setIssueArchived(SLUG, PID, IID, false);

      expect(apiClient.patch).toHaveBeenCalledWith(ISSUE_ROUTES.UNARCHIVE(SLUG, PID, IID), {});
      expect(result).toEqual(issue);
    });
  });

  describe('setIssuePinned', () => {
    it('PATCH la route PIN avec { pinned }', async () => {
      const issue = { id: IID, pinned: true } as any;
      vi.mocked(apiClient.patch).mockResolvedValue(envelope(issue));

      const result = await setIssuePinned(SLUG, PID, IID, true);

      expect(apiClient.patch).toHaveBeenCalledWith(ISSUE_ROUTES.PIN(SLUG, PID, IID), { pinned: true });
      expect(result).toEqual(issue);
    });
  });

  // --- Statuses ---
  describe('listStatuses', () => {
    it('GET les statuts', async () => {
      const statuses = [{ id: 1, name: 'Todo' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(statuses));

      const result = await listStatuses(SLUG, PID);

      expect(apiClient.get).toHaveBeenCalledWith(ISSUE_ROUTES.STATUSES(SLUG, PID));
      expect(result).toEqual(statuses);
    });
  });

  describe('createStatus', () => {
    it('POST le payload de statut', async () => {
      const payload = { name: 'Doing', category: 'STARTED' as const };
      const status = { id: 2, ...payload } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(status));

      const result = await createStatus(SLUG, PID, payload);

      expect(apiClient.post).toHaveBeenCalledWith(ISSUE_ROUTES.STATUSES(SLUG, PID), payload);
      expect(result).toEqual(status);
    });
  });

  describe('updateStatus', () => {
    it('PATCH le statut', async () => {
      const payload = { name: 'Renamed' };
      const status = { id: 2, name: 'Renamed' } as any;
      vi.mocked(apiClient.patch).mockResolvedValue(envelope(status));

      const result = await updateStatus(SLUG, PID, 2, payload);

      expect(apiClient.patch).toHaveBeenCalledWith(ISSUE_ROUTES.STATUS(SLUG, PID, 2), payload);
      expect(result).toEqual(status);
    });
  });

  describe('deleteStatus', () => {
    it('DELETE un statut', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteStatus(SLUG, PID, 2);

      expect(apiClient.delete).toHaveBeenCalledWith(ISSUE_ROUTES.STATUS(SLUG, PID, 2));
    });
  });

  describe('reorderStatuses', () => {
    it('POST le payload de réordonnancement', async () => {
      const payload = { statuses: [{ id: 1, position: 0 }, { id: 2, position: 1 }] };
      const statuses = [{ id: 1 }, { id: 2 }] as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(statuses));

      const result = await reorderStatuses(SLUG, PID, payload);

      expect(apiClient.post).toHaveBeenCalledWith(ISSUE_ROUTES.STATUSES_REORDER(SLUG, PID), payload);
      expect(result).toEqual(statuses);
    });
  });

  // --- Types ---
  describe('listTypes', () => {
    it('GET les types d’issue', async () => {
      const types = [{ id: 1, name: 'Bug' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(types));

      const result = await listTypes(SLUG, PID);

      expect(apiClient.get).toHaveBeenCalledWith(ISSUE_ROUTES.TYPES(SLUG, PID));
      expect(result).toEqual(types);
    });
  });

  // --- Comments ---
  describe('listComments', () => {
    it('GET les commentaires', async () => {
      const comments = [{ id: 1, content: 'hi' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(comments));

      const result = await listComments(SLUG, PID, IID);

      expect(apiClient.get).toHaveBeenCalledWith(ISSUE_ROUTES.COMMENTS(SLUG, PID, IID));
      expect(result).toEqual(comments);
    });
  });

  describe('addComment', () => {
    it('POST { content }', async () => {
      const comment = { id: 1, content: 'hello' } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(comment));

      const result = await addComment(SLUG, PID, IID, 'hello');

      expect(apiClient.post).toHaveBeenCalledWith(ISSUE_ROUTES.COMMENTS(SLUG, PID, IID), { content: 'hello' });
      expect(result).toEqual(comment);
    });
  });

  describe('updateComment', () => {
    it('PATCH { content }', async () => {
      const comment = { id: 1, content: 'edited' } as any;
      vi.mocked(apiClient.patch).mockResolvedValue(envelope(comment));

      const result = await updateComment(SLUG, PID, IID, 1, 'edited');

      expect(apiClient.patch).toHaveBeenCalledWith(ISSUE_ROUTES.COMMENT(SLUG, PID, IID, 1), { content: 'edited' });
      expect(result).toEqual(comment);
    });
  });

  describe('deleteComment', () => {
    it('DELETE un commentaire', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteComment(SLUG, PID, IID, 1);

      expect(apiClient.delete).toHaveBeenCalledWith(ISSUE_ROUTES.COMMENT(SLUG, PID, IID, 1));
    });
  });

  // --- Activity ---
  describe('listActivity', () => {
    it('GET le journal d’activité', async () => {
      const activity = [{ id: 1, action: 'CREATED' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(activity));

      const result = await listActivity(SLUG, PID, IID);

      expect(apiClient.get).toHaveBeenCalledWith(ISSUE_ROUTES.ACTIVITY(SLUG, PID, IID));
      expect(result).toEqual(activity);
    });
  });

  // --- Smart Assign ---
  describe('smartAssignIssue', () => {
    it('POST sur la route smart-assign (sans body)', async () => {
      const res = { recommended: null, alternatives: [], strategy: 's', fallbackUsed: false };
      vi.mocked(apiClient.post).mockResolvedValue(envelope(res));

      const result = await smartAssignIssue(SLUG, PID, IID);

      expect(apiClient.post).toHaveBeenCalledWith(ISSUE_ROUTES.SMART_ASSIGN(SLUG, PID, IID), undefined, { timeout: AI_TIMEOUT_MS });
      expect(result).toEqual(res);
    });
  });

  describe('smartAssignPreview', () => {
    it('POST le brouillon d’issue', async () => {
      const draft = { title: 'T', labels: ['bug'], priority: 'HIGH' as const };
      const res = { recommended: null, alternatives: [], strategy: 's', fallbackUsed: true };
      vi.mocked(apiClient.post).mockResolvedValue(envelope(res));

      const result = await smartAssignPreview(SLUG, PID, draft);

      expect(apiClient.post).toHaveBeenCalledWith(ISSUE_ROUTES.SMART_ASSIGN_PREVIEW(SLUG, PID), draft, { timeout: AI_TIMEOUT_MS });
      expect(result).toEqual(res);
    });
  });

  describe('smartAssignBulk', () => {
    it('POST { issueIds }', async () => {
      const items = [{ issueId: 1, recommended: null }] as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(items));

      const result = await smartAssignBulk(SLUG, PID, [1, 2]);

      expect(apiClient.post).toHaveBeenCalledWith(ISSUE_ROUTES.SMART_ASSIGN_BULK(SLUG, PID), { issueIds: [1, 2] }, { timeout: AI_TIMEOUT_MS });
      expect(result).toEqual(items);
    });
  });

  // --- Checklist ---
  describe('listChecklist', () => {
    it('GET la checklist', async () => {
      const items = [{ id: 1, content: 'do', done: false, position: 0 }];
      vi.mocked(apiClient.get).mockResolvedValue(envelope(items));

      const result = await listChecklist(SLUG, PID, IID);

      expect(apiClient.get).toHaveBeenCalledWith(ISSUE_ROUTES.CHECKLIST(SLUG, PID, IID));
      expect(result).toEqual(items);
    });
  });

  describe('addChecklistItem', () => {
    it('POST { content }', async () => {
      const item = { id: 1, content: 'do', done: false, position: 0 };
      vi.mocked(apiClient.post).mockResolvedValue(envelope(item));

      const result = await addChecklistItem(SLUG, PID, IID, 'do');

      expect(apiClient.post).toHaveBeenCalledWith(ISSUE_ROUTES.CHECKLIST(SLUG, PID, IID), { content: 'do' });
      expect(result).toEqual(item);
    });
  });

  describe('updateChecklistItem', () => {
    it('PATCH le payload de l’item', async () => {
      const payload = { done: true };
      const item = { id: 1, content: 'do', done: true, position: 0 };
      vi.mocked(apiClient.patch).mockResolvedValue(envelope(item));

      const result = await updateChecklistItem(SLUG, PID, IID, 1, payload);

      expect(apiClient.patch).toHaveBeenCalledWith(ISSUE_ROUTES.CHECKLIST_ITEM(SLUG, PID, IID, 1), payload);
      expect(result).toEqual(item);
    });
  });

  describe('deleteChecklistItem', () => {
    it('DELETE un item de checklist', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteChecklistItem(SLUG, PID, IID, 1);

      expect(apiClient.delete).toHaveBeenCalledWith(ISSUE_ROUTES.CHECKLIST_ITEM(SLUG, PID, IID, 1));
    });
  });

  // --- Worklogs ---
  describe('listWorklogs', () => {
    it('GET les worklogs', async () => {
      const logs = [{ id: 1, minutes: 60 }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(logs));

      const result = await listWorklogs(SLUG, PID, IID);

      expect(apiClient.get).toHaveBeenCalledWith(ISSUE_ROUTES.WORKLOGS(SLUG, PID, IID));
      expect(result).toEqual(logs);
    });
  });

  describe('addWorklog', () => {
    it('POST le payload de worklog', async () => {
      const payload = { minutes: 90, description: 'work' };
      const log = { id: 1, ...payload } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(log));

      const result = await addWorklog(SLUG, PID, IID, payload);

      expect(apiClient.post).toHaveBeenCalledWith(ISSUE_ROUTES.WORKLOGS(SLUG, PID, IID), payload);
      expect(result).toEqual(log);
    });
  });

  describe('deleteWorklog', () => {
    it('DELETE un worklog', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteWorklog(SLUG, PID, IID, 1);

      expect(apiClient.delete).toHaveBeenCalledWith(ISSUE_ROUTES.WORKLOG(SLUG, PID, IID, 1));
    });
  });

  // --- Children ---
  describe('listChildIssues', () => {
    it('GET les sous-tâches', async () => {
      const children = [{ id: 200 }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(children));

      const result = await listChildIssues(SLUG, PID, IID);

      expect(apiClient.get).toHaveBeenCalledWith(ISSUE_ROUTES.CHILDREN(SLUG, PID, IID));
      expect(result).toEqual(children);
    });
  });

  // --- Relations ---
  describe('listRelations', () => {
    it('GET les relations', async () => {
      const relations = [{ id: 1, relationType: 'BLOCKS' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(relations));

      const result = await listRelations(SLUG, PID, IID);

      expect(apiClient.get).toHaveBeenCalledWith(ISSUE_ROUTES.RELATIONS(SLUG, PID, IID));
      expect(result).toEqual(relations);
    });
  });

  describe('addRelation', () => {
    it('POST le payload de relation', async () => {
      const payload = { targetIssueId: 201, relationType: 'BLOCKS' as const };
      const relation = { id: 1, relationType: 'BLOCKS' } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(relation));

      const result = await addRelation(SLUG, PID, IID, payload);

      expect(apiClient.post).toHaveBeenCalledWith(ISSUE_ROUTES.RELATIONS(SLUG, PID, IID), payload);
      expect(result).toEqual(relation);
    });

    it('propage l’erreur', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(new Error('conflict'));
      await expect(
        addRelation(SLUG, PID, IID, { targetIssueId: 201, relationType: 'BLOCKS' }),
      ).rejects.toThrow('conflict');
    });
  });

  describe('deleteRelation', () => {
    it('DELETE une relation', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteRelation(SLUG, PID, IID, 1);

      expect(apiClient.delete).toHaveBeenCalledWith(ISSUE_ROUTES.RELATION(SLUG, PID, IID, 1));
    });
  });
});
