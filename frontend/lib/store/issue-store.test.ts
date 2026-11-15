import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIssueStore } from './issue-store';
import type {
  Issue,
  IssueStatus,
  IssueType,
  IssueComment,
  IssueActivity,
  IssueSummary,
  ProjectIssueRelation,
  ProjectIssueRelations,
} from '../api/issue-service';
import * as svc from '../api/issue-service';

vi.mock('../api/issue-service', () => ({
  listIssues: vi.fn(),
  getIssue: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  deleteIssue: vi.fn(),
  setIssueArchived: vi.fn(),
  setIssuePinned: vi.fn(),
  listStatuses: vi.fn(),
  createStatus: vi.fn(),
  updateStatus: vi.fn(),
  deleteStatus: vi.fn(),
  listTypes: vi.fn(),
  listComments: vi.fn(),
  addComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
  listActivity: vi.fn(),
  listProjectRelations: vi.fn(),
  listIssuesPage: vi.fn(),
  ISSUES_PAGE_MAX: 100,
}));
vi.mock('../api/attachment-service', () => ({ listAttachmentCounts: vi.fn() }));
import * as attachments from '../api/attachment-service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const status: IssueStatus = {
  id: 1,
  name: 'Todo',
  color: '#fff',
  category: 'UNSTARTED',
  position: 0,
  isDefault: true,
};

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 100,
    sequenceNumber: 1,
    identifier: 'TF-1',
    projectId: 10,
    projectName: 'Proj',
    title: 'Issue title',
    description: null,
    priority: 'NONE',
    status,
    type: null,
    assignee: null,
    reporter: { id: 1, email: 'a@b.c', displayName: 'A', avatarUrl: null },
    parent: null,
    childCount: 0,
    startDate: null,
    dueDate: null,
    completedAt: null,
    storyPoints: null,
    labels: [],
    commentCount: 0,
    archived: false,
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const type: IssueType = {
  id: 1,
  name: 'Bug',
  color: '#f00',
  icon: 'bug',
  isDefault: true,
};

const comment: IssueComment = {
  id: 500,
  author: { id: 1, email: 'a@b.c', displayName: 'A', avatarUrl: null },
  content: 'hello',
  isEdited: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const activity: IssueActivity = {
  id: 900,
  actor: null,
  action: 'CREATED',
  oldValue: null,
  newValue: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('issue-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useIssueStore.setState({
        issues: [],
        activeIssue: null,
        statuses: [],
        types: [],
        comments: [],
        activity: [],
        isLoading: false,
        error: null,
        loadedProjectId: null,
        projectRelations: {},
      });
    });
  });

  // --- Issues ---

  it('fetchIssues populates issues and marks project loaded', async () => {
    const issues = [makeIssue()];
    vi.mocked(svc.listIssues).mockResolvedValue(issues);

    let result: Issue[] = [];
    await act(async () => {
      result = await useIssueStore.getState().fetchIssues('ws', 10);
    });

    expect(svc.listIssues).toHaveBeenCalledWith('ws', 10);
    expect(useIssueStore.getState().issues).toEqual(issues);
    expect(useIssueStore.getState().loadedProjectId).toBe(10);
    expect(useIssueStore.getState().isLoading).toBe(false);
    expect(result).toEqual(issues);
  });

  it('fetchIssues uses cache when project already loaded (no refetch)', async () => {
    const cached = [makeIssue()];
    act(() => {
      useIssueStore.setState({ issues: cached, loadedProjectId: 10 });
    });

    let result: Issue[] = [];
    await act(async () => {
      result = await useIssueStore.getState().fetchIssues('ws', 10);
    });

    expect(svc.listIssues).not.toHaveBeenCalled();
    expect(result).toEqual(cached);
  });

  it('fetchIssues sets error and returns [] on failure', async () => {
    vi.mocked(svc.listIssues).mockRejectedValue(new Error('boom'));

    let result: Issue[] = [makeIssue()];
    await act(async () => {
      result = await useIssueStore.getState().fetchIssues('ws', 10);
    });

    expect(result).toEqual([]);
    expect(useIssueStore.getState().error).toBe('boom');
    expect(useIssueStore.getState().isLoading).toBe(false);
  });

  it('fetchIssue sets activeIssue', async () => {
    const issue = makeIssue();
    vi.mocked(svc.getIssue).mockResolvedValue(issue);

    await act(async () => {
      await useIssueStore.getState().fetchIssue('ws', 10, 100);
    });

    expect(svc.getIssue).toHaveBeenCalledWith('ws', 10, 100);
    expect(useIssueStore.getState().activeIssue).toEqual(issue);
  });

  it('fetchIssue sets error and returns null on failure', async () => {
    vi.mocked(svc.getIssue).mockRejectedValue(new Error('nope'));

    let result: Issue | null = makeIssue();
    await act(async () => {
      result = await useIssueStore.getState().fetchIssue('ws', 10, 100);
    });

    expect(result).toBeNull();
    expect(useIssueStore.getState().error).toBe('nope');
  });

  it('createIssue prepends the new issue', async () => {
    const existing = makeIssue({ id: 1 });
    act(() => useIssueStore.setState({ issues: [existing] }));
    const created = makeIssue({ id: 2 });
    vi.mocked(svc.createIssue).mockResolvedValue(created);

    await act(async () => {
      await useIssueStore.getState().createIssue('ws', 10, { title: 'x' });
    });

    expect(svc.createIssue).toHaveBeenCalledWith('ws', 10, { title: 'x' });
    expect(useIssueStore.getState().issues).toEqual([created, existing]);
  });

  it('createIssue sets error and returns null on failure', async () => {
    vi.mocked(svc.createIssue).mockRejectedValue(new Error('bad'));

    let result: Issue | null = makeIssue();
    await act(async () => {
      result = await useIssueStore.getState().createIssue('ws', 10, { title: 'x' });
    });

    expect(result).toBeNull();
    expect(useIssueStore.getState().error).toBe('bad');
  });

  it('updateIssue replaces the issue by id and updates activeIssue', async () => {
    const original = makeIssue({ id: 5, title: 'old' });
    act(() => useIssueStore.setState({ issues: [original], activeIssue: original }));
    const updated = makeIssue({ id: 5, title: 'new' });
    vi.mocked(svc.updateIssue).mockResolvedValue(updated);

    await act(async () => {
      await useIssueStore.getState().updateIssue('ws', 10, 5, { title: 'new' });
    });

    expect(svc.updateIssue).toHaveBeenCalledWith('ws', 10, 5, { title: 'new' });
    expect(useIssueStore.getState().issues).toEqual([updated]);
    expect(useIssueStore.getState().activeIssue).toEqual(updated);
  });

  it('updateIssue sends unassign and clearDueDate, and keeps the issue the server returns', async () => {
    const original = makeIssue({
      id: 5,
      assignee: { id: 2, email: 'b@c.d', displayName: 'B', avatarUrl: null },
      dueDate: '2026-11-20',
    });
    act(() => useIssueStore.setState({ issues: [original], activeIssue: original }));
    const cleared = makeIssue({ id: 5, assignee: null, dueDate: null });
    vi.mocked(svc.updateIssue).mockResolvedValue(cleared);

    await act(async () => {
      await useIssueStore.getState().updateIssue('ws', 10, 5, { unassign: true, clearDueDate: true });
    });

    expect(svc.updateIssue).toHaveBeenCalledWith('ws', 10, 5, { unassign: true, clearDueDate: true });
    expect(useIssueStore.getState().issues[0]).toMatchObject({ assignee: null, dueDate: null });
    expect(useIssueStore.getState().activeIssue).toMatchObject({ assignee: null, dueDate: null });
  });

  // WS-10 : un échec d'édition ne doit PAS poser `store.error`. Un refus (ex. VIEWER en lecture
  // seule) polluait la bannière passive du board, invisible sous l'overlay du sheet puis révélée à
  // sa fermeture. L'échec se signale par le retour `null` ; c'est l'appelant qui affiche un toast.
  it('updateIssue renvoie null sans poser store.error en cas d’échec', async () => {
    act(() => useIssueStore.setState({ error: null }));
    vi.mocked(svc.updateIssue).mockRejectedValue(new Error('upfail'));

    let result: unknown;
    await act(async () => {
      result = await useIssueStore.getState().updateIssue('ws', 10, 5, { title: 'new' });
    });

    expect(result).toBeNull();
    expect(useIssueStore.getState().error).toBeNull();
  });

  it('deleteIssue filters out the issue and clears activeIssue', async () => {
    const issue = makeIssue({ id: 7 });
    act(() => useIssueStore.setState({ issues: [issue], activeIssue: issue }));
    vi.mocked(svc.deleteIssue).mockResolvedValue(undefined);

    await act(async () => {
      await useIssueStore.getState().deleteIssue('ws', 10, 7);
    });

    expect(svc.deleteIssue).toHaveBeenCalledWith('ws', 10, 7);
    expect(useIssueStore.getState().issues).toEqual([]);
    expect(useIssueStore.getState().activeIssue).toBeNull();
  });

  it('deleteIssue sets error on failure', async () => {
    act(() => useIssueStore.setState({ issues: [makeIssue({ id: 7 })] }));
    vi.mocked(svc.deleteIssue).mockRejectedValue(new Error('delfail'));

    await act(async () => {
      await useIssueStore.getState().deleteIssue('ws', 10, 7);
    });

    expect(useIssueStore.getState().error).toBe('delfail');
    expect(useIssueStore.getState().issues).toHaveLength(1);
  });

  it('archiveIssue (true) removes the issue from the list', async () => {
    const issue = makeIssue({ id: 9 });
    act(() => useIssueStore.setState({ issues: [issue] }));
    const updated = makeIssue({ id: 9, archived: true });
    vi.mocked(svc.setIssueArchived).mockResolvedValue(updated);

    await act(async () => {
      await useIssueStore.getState().archiveIssue('ws', 10, 9, true);
    });

    expect(svc.setIssueArchived).toHaveBeenCalledWith('ws', 10, 9, true);
    expect(useIssueStore.getState().issues).toEqual([]);
  });

  it('archiveIssue (false) replaces the issue in place', async () => {
    const issue = makeIssue({ id: 9, archived: true });
    act(() => useIssueStore.setState({ issues: [issue] }));
    const updated = makeIssue({ id: 9, archived: false });
    vi.mocked(svc.setIssueArchived).mockResolvedValue(updated);

    await act(async () => {
      await useIssueStore.getState().archiveIssue('ws', 10, 9, false);
    });

    expect(svc.setIssueArchived).toHaveBeenCalledWith('ws', 10, 9, false);
    expect(useIssueStore.getState().issues).toEqual([updated]);
  });

  it('archiveIssue sets error on failure', async () => {
    vi.mocked(svc.setIssueArchived).mockRejectedValue(new Error('arcfail'));

    await act(async () => {
      await useIssueStore.getState().archiveIssue('ws', 10, 9, true);
    });

    expect(useIssueStore.getState().error).toBe('arcfail');
  });

  it('pinIssue replaces the issue and updates activeIssue', async () => {
    const issue = makeIssue({ id: 3, pinned: false });
    act(() => useIssueStore.setState({ issues: [issue], activeIssue: issue }));
    const updated = makeIssue({ id: 3, pinned: true });
    vi.mocked(svc.setIssuePinned).mockResolvedValue(updated);

    await act(async () => {
      await useIssueStore.getState().pinIssue('ws', 10, 3, true);
    });

    expect(svc.setIssuePinned).toHaveBeenCalledWith('ws', 10, 3, true);
    expect(useIssueStore.getState().issues).toEqual([updated]);
    expect(useIssueStore.getState().activeIssue).toEqual(updated);
  });

  it('pinIssue sets error on failure', async () => {
    vi.mocked(svc.setIssuePinned).mockRejectedValue(new Error('pinfail'));

    await act(async () => {
      await useIssueStore.getState().pinIssue('ws', 10, 3, true);
    });

    expect(useIssueStore.getState().error).toBe('pinfail');
  });

  it('setActiveIssue sets and clears the active issue', () => {
    const issue = makeIssue();
    act(() => useIssueStore.getState().setActiveIssue(issue));
    expect(useIssueStore.getState().activeIssue).toEqual(issue);
    act(() => useIssueStore.getState().setActiveIssue(null));
    expect(useIssueStore.getState().activeIssue).toBeNull();
  });

  it('upsertIssueLocal inserts when the issue does not exist', () => {
    act(() => useIssueStore.getState().upsertIssueLocal(makeIssue({ id: 42 })));
    expect(useIssueStore.getState().issues.map((i) => i.id)).toEqual([42]);
  });

  it('upsertIssueLocal replaces an existing issue by id', () => {
    act(() => useIssueStore.setState({ issues: [makeIssue({ id: 42, title: 'old' })] }));
    act(() => useIssueStore.getState().upsertIssueLocal(makeIssue({ id: 42, title: 'new' })));
    const issues = useIssueStore.getState().issues;
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toBe('new');
  });

  it('removeIssueLocal filters the issue and clears activeIssue', () => {
    const issue = makeIssue({ id: 42 });
    act(() => useIssueStore.setState({ issues: [issue], activeIssue: issue }));
    act(() => useIssueStore.getState().removeIssueLocal(42));
    expect(useIssueStore.getState().issues).toEqual([]);
    expect(useIssueStore.getState().activeIssue).toBeNull();
  });

  // --- Statuses & types ---

  it('fetchStatuses populates statuses', async () => {
    vi.mocked(svc.listStatuses).mockResolvedValue([status]);

    await act(async () => {
      await useIssueStore.getState().fetchStatuses('ws', 10);
    });

    expect(svc.listStatuses).toHaveBeenCalledWith('ws', 10);
    expect(useIssueStore.getState().statuses).toEqual([status]);
  });

  it('fetchStatuses sets error and returns [] on failure', async () => {
    vi.mocked(svc.listStatuses).mockRejectedValue(new Error('sfail'));

    let result: IssueStatus[] = [status];
    await act(async () => {
      result = await useIssueStore.getState().fetchStatuses('ws', 10);
    });

    expect(result).toEqual([]);
    expect(useIssueStore.getState().error).toBe('sfail');
  });

  it('createStatus appends the status', async () => {
    act(() => useIssueStore.setState({ statuses: [status] }));
    const created = { ...status, id: 2, name: 'Done' };
    vi.mocked(svc.createStatus).mockResolvedValue(created);

    await act(async () => {
      await useIssueStore.getState().createStatus('ws', 10, { name: 'Done', category: 'COMPLETED' });
    });

    expect(svc.createStatus).toHaveBeenCalledWith('ws', 10, { name: 'Done', category: 'COMPLETED' });
    expect(useIssueStore.getState().statuses).toEqual([status, created]);
  });

  it('createStatus sets error on failure', async () => {
    vi.mocked(svc.createStatus).mockRejectedValue(new Error('csfail'));

    await act(async () => {
      await useIssueStore.getState().createStatus('ws', 10, { name: 'Done', category: 'COMPLETED' });
    });

    expect(useIssueStore.getState().error).toBe('csfail');
  });

  it('updateStatus replaces the status by id', async () => {
    act(() => useIssueStore.setState({ statuses: [status] }));
    const updated = { ...status, name: 'Renamed' };
    vi.mocked(svc.updateStatus).mockResolvedValue(updated);

    await act(async () => {
      await useIssueStore.getState().updateStatus('ws', 10, 1, { name: 'Renamed' });
    });

    expect(svc.updateStatus).toHaveBeenCalledWith('ws', 10, 1, { name: 'Renamed' });
    expect(useIssueStore.getState().statuses).toEqual([updated]);
  });

  it('updateStatus sets error on failure', async () => {
    vi.mocked(svc.updateStatus).mockRejectedValue(new Error('usfail'));

    await act(async () => {
      await useIssueStore.getState().updateStatus('ws', 10, 1, { name: 'Renamed' });
    });

    expect(useIssueStore.getState().error).toBe('usfail');
  });

  it('deleteStatus filters out the status', async () => {
    act(() => useIssueStore.setState({ statuses: [status] }));
    vi.mocked(svc.deleteStatus).mockResolvedValue(undefined);

    await act(async () => {
      await useIssueStore.getState().deleteStatus('ws', 10, 1);
    });

    expect(svc.deleteStatus).toHaveBeenCalledWith('ws', 10, 1);
    expect(useIssueStore.getState().statuses).toEqual([]);
  });

  it('deleteStatus sets error on failure', async () => {
    act(() => useIssueStore.setState({ statuses: [status] }));
    vi.mocked(svc.deleteStatus).mockRejectedValue(new Error('dsfail'));

    await act(async () => {
      await useIssueStore.getState().deleteStatus('ws', 10, 1);
    });

    expect(useIssueStore.getState().error).toBe('dsfail');
    expect(useIssueStore.getState().statuses).toHaveLength(1);
  });

  it('fetchTypes populates types', async () => {
    vi.mocked(svc.listTypes).mockResolvedValue([type]);

    await act(async () => {
      await useIssueStore.getState().fetchTypes('ws', 10);
    });

    expect(svc.listTypes).toHaveBeenCalledWith('ws', 10);
    expect(useIssueStore.getState().types).toEqual([type]);
  });

  it('fetchTypes sets error and returns [] on failure', async () => {
    vi.mocked(svc.listTypes).mockRejectedValue(new Error('tfail'));

    let result: IssueType[] = [type];
    await act(async () => {
      result = await useIssueStore.getState().fetchTypes('ws', 10);
    });

    expect(result).toEqual([]);
    expect(useIssueStore.getState().error).toBe('tfail');
  });

  // --- Comments ---

  it('fetchComments populates comments', async () => {
    vi.mocked(svc.listComments).mockResolvedValue([comment]);

    await act(async () => {
      await useIssueStore.getState().fetchComments('ws', 10, 100);
    });

    expect(svc.listComments).toHaveBeenCalledWith('ws', 10, 100);
    expect(useIssueStore.getState().comments).toEqual([comment]);
  });

  it('fetchComments sets error and returns [] on failure', async () => {
    vi.mocked(svc.listComments).mockRejectedValue(new Error('cfail'));

    let result: IssueComment[] = [comment];
    await act(async () => {
      result = await useIssueStore.getState().fetchComments('ws', 10, 100);
    });

    expect(result).toEqual([]);
    expect(useIssueStore.getState().error).toBe('cfail');
  });

  it('addComment appends the comment', async () => {
    act(() => useIssueStore.setState({ comments: [comment] }));
    const created = { ...comment, id: 501, content: 'new' };
    vi.mocked(svc.addComment).mockResolvedValue(created);

    await act(async () => {
      await useIssueStore.getState().addComment('ws', 10, 100, 'new');
    });

    expect(svc.addComment).toHaveBeenCalledWith('ws', 10, 100, 'new');
    expect(useIssueStore.getState().comments).toEqual([comment, created]);
  });

  it('addComment sets error on failure', async () => {
    vi.mocked(svc.addComment).mockRejectedValue(new Error('acfail'));

    await act(async () => {
      await useIssueStore.getState().addComment('ws', 10, 100, 'new');
    });

    expect(useIssueStore.getState().error).toBe('acfail');
  });

  it('updateComment replaces the comment by id', async () => {
    act(() => useIssueStore.setState({ comments: [comment] }));
    const updated = { ...comment, content: 'edited', isEdited: true };
    vi.mocked(svc.updateComment).mockResolvedValue(updated);

    await act(async () => {
      await useIssueStore.getState().updateComment('ws', 10, 100, 500, 'edited');
    });

    expect(svc.updateComment).toHaveBeenCalledWith('ws', 10, 100, 500, 'edited');
    expect(useIssueStore.getState().comments).toEqual([updated]);
  });

  it('updateComment sets error on failure', async () => {
    vi.mocked(svc.updateComment).mockRejectedValue(new Error('ucfail'));

    await act(async () => {
      await useIssueStore.getState().updateComment('ws', 10, 100, 500, 'edited');
    });

    expect(useIssueStore.getState().error).toBe('ucfail');
  });

  it('deleteComment filters out the comment', async () => {
    act(() => useIssueStore.setState({ comments: [comment] }));
    vi.mocked(svc.deleteComment).mockResolvedValue(undefined);

    await act(async () => {
      await useIssueStore.getState().deleteComment('ws', 10, 100, 500);
    });

    expect(svc.deleteComment).toHaveBeenCalledWith('ws', 10, 100, 500);
    expect(useIssueStore.getState().comments).toEqual([]);
  });

  it('deleteComment sets error on failure', async () => {
    act(() => useIssueStore.setState({ comments: [comment] }));
    vi.mocked(svc.deleteComment).mockRejectedValue(new Error('dcfail'));

    await act(async () => {
      await useIssueStore.getState().deleteComment('ws', 10, 100, 500);
    });

    expect(useIssueStore.getState().error).toBe('dcfail');
    expect(useIssueStore.getState().comments).toHaveLength(1);
  });

  // --- Activity ---

  it('fetchActivity populates activity', async () => {
    vi.mocked(svc.listActivity).mockResolvedValue([activity]);

    await act(async () => {
      await useIssueStore.getState().fetchActivity('ws', 10, 100);
    });

    expect(svc.listActivity).toHaveBeenCalledWith('ws', 10, 100);
    expect(useIssueStore.getState().activity).toEqual([activity]);
  });

  it('fetchActivity sets error and returns [] on failure', async () => {
    vi.mocked(svc.listActivity).mockRejectedValue(new Error('afail'));

    let result: IssueActivity[] = [activity];
    await act(async () => {
      result = await useIssueStore.getState().fetchActivity('ws', 10, 100);
    });

    expect(result).toEqual([]);
    expect(useIssueStore.getState().error).toBe('afail');
  });

  // --- Reset ---

  it('clearIssues resets the store', () => {
    act(() =>
      useIssueStore.setState({
        issues: [makeIssue()],
        activeIssue: makeIssue(),
        statuses: [status],
        types: [type],
        comments: [comment],
        activity: [activity],
        error: 'x',
        loadedProjectId: 10,
      }),
    );

    act(() => useIssueStore.getState().clearIssues());

    const s = useIssueStore.getState();
    expect(s.issues).toEqual([]);
    expect(s.activeIssue).toBeNull();
    expect(s.statuses).toEqual([]);
    expect(s.types).toEqual([]);
    expect(s.comments).toEqual([]);
    expect(s.activity).toEqual([]);
    expect(s.error).toBeNull();
    expect(s.loadedProjectId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Les liens entre les issues d'un projet (R166)
// ---------------------------------------------------------------------------

const ada = { id: 1, email: 'a@b.c', displayName: 'A', avatarUrl: null };
const done: IssueStatus = { ...status, id: 2, name: 'Done', category: 'COMPLETED' };

function summary(id: number, title = `Issue ${id}`): IssueSummary {
  return { id, sequenceNumber: id, identifier: `TF-${id}`, title, status };
}

function relation(id: number, source: number, target: number): ProjectIssueRelation {
  return { id, relationType: 'BLOCKS', source: summary(source), target: summary(target), createdBy: ada, createdAt: '2026-11-13T10:00:00' };
}

function links(over: Partial<ProjectIssueRelations> = {}): ProjectIssueRelations {
  return { relations: [relation(1, 100, 101)], subIssues: [{ parent: summary(100), issue: summary(102) }], ...over };
}

describe('issue-store : les liens entre les issues du projet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useIssueStore.setState({ issues: [], activeIssue: null, projectRelations: {} });
    });
  });

  const loaded = (projectId = 10, value: ProjectIssueRelations = links()) =>
    act(() => useIssueStore.setState((state) => ({ projectRelations: { ...state.projectRelations, [projectId]: value } })));
  const linksOf = (projectId = 10): ProjectIssueRelations | undefined => useIssueStore.getState().projectRelations[projectId];

  it('fetchProjectRelations lit les liens du projet et les range sous ce projet', async () => {
    const value = links();
    vi.mocked(svc.listProjectRelations).mockResolvedValue(value);

    let result: ProjectIssueRelations | null = null;
    await act(async () => {
      result = await useIssueStore.getState().fetchProjectRelations('ws', 10);
    });

    expect(svc.listProjectRelations).toHaveBeenCalledWith('ws', 10);
    expect(result).toEqual(value);
    expect(useIssueStore.getState().projectRelations).toEqual({ 10: value });
  });

  it('fetchProjectRelations rend null en cas d’échec, et les liens d’avant du projet restent', async () => {
    loaded();
    vi.mocked(svc.listProjectRelations).mockRejectedValue(new Error('down'));

    let result: ProjectIssueRelations | null = links();
    await act(async () => {
      result = await useIssueStore.getState().fetchProjectRelations('ws', 10);
    });

    expect(result).toBeNull();
    expect(linksOf(10)).toEqual(links());
  });

  it('un projet dont la lecture échoue reste sans liens : jamais ceux du projet d’avant', async () => {
    loaded(10);
    vi.mocked(svc.listProjectRelations).mockRejectedValue(new Error('down'));

    await act(async () => {
      await useIssueStore.getState().fetchProjectRelations('ws', 11);
    });

    expect(linksOf(11)).toBeUndefined();
    expect(linksOf(10)).toEqual(links());
  });

  it('une réponse en retard du projet quitté ne range que ses liens à lui', async () => {
    const before = links({ relations: [relation(7, 300, 301)] });
    const now = links({ relations: [relation(8, 400, 401)] });
    let answerBefore: (value: ProjectIssueRelations) => void = () => {};
    vi.mocked(svc.listProjectRelations)
      .mockImplementationOnce(() => new Promise((resolve) => { answerBefore = resolve; }))
      .mockResolvedValueOnce(now);

    let late: Promise<ProjectIssueRelations | null> = Promise.resolve(null);
    await act(async () => {
      late = useIssueStore.getState().fetchProjectRelations('ws', 10);
      await useIssueStore.getState().fetchProjectRelations('ws', 11);
    });
    await act(async () => {
      answerBefore(before);
      await late;
    });

    expect(linksOf(11)).toEqual(now);
    expect(linksOf(10)).toEqual(before);
  });

  it('upsertRelationLocal ajoute un lien posé, et remplace un lien déjà là', () => {
    loaded();

    act(() => useIssueStore.getState().upsertRelationLocal(10, relation(2, 101, 100)));
    expect(linksOf()?.relations.map((r) => r.id)).toEqual([1, 2]);

    const changed = { ...relation(2, 101, 100), relationType: 'RELATES_TO' as const };
    act(() => useIssueStore.getState().upsertRelationLocal(10, changed));
    expect(linksOf()?.relations).toEqual([relation(1, 100, 101), changed]);
  });

  it('removeRelationLocal retire un lien', () => {
    loaded();

    act(() => useIssueStore.getState().removeRelationLocal(10, 1));

    expect(linksOf()?.relations).toEqual([]);
    expect(linksOf()?.subIssues).toHaveLength(1);
  });

  it('un lien d’un autre projet, ou avant la lecture des liens, ne change rien', () => {
    act(() => useIssueStore.getState().upsertRelationLocal(10, relation(2, 101, 100)));
    act(() => useIssueStore.getState().removeRelationLocal(10, 2));
    expect(useIssueStore.getState().projectRelations).toEqual({});

    loaded(10);
    act(() => useIssueStore.getState().upsertRelationLocal(11, relation(3, 201, 200)));
    act(() => useIssueStore.getState().removeRelationLocal(11, 1));
    expect(useIssueStore.getState().projectRelations).toEqual({ 10: links() });
  });

  it('une issue qui change garde ses liens à jour : son nom et son statut', () => {
    loaded();

    act(() => useIssueStore.getState().upsertIssueLocal(makeIssue({ id: 101, identifier: 'TF-101', sequenceNumber: 101, title: 'Renamed', status: done })));

    const target = linksOf()?.relations[0].target;
    expect(target).toEqual({ id: 101, sequenceNumber: 101, identifier: 'TF-101', title: 'Renamed', status: done });
  });

  it('une sous-issue qui change de parent change de lien ; celle qui n’en a plus le quitte', () => {
    loaded();

    act(() => useIssueStore.getState().upsertIssueLocal(makeIssue({ id: 102, identifier: 'TF-102', sequenceNumber: 102, title: 'Child', parent: summary(101) })));
    expect(linksOf()?.subIssues).toEqual([
      { parent: summary(101), issue: { id: 102, sequenceNumber: 102, identifier: 'TF-102', title: 'Child', status } },
    ]);

    act(() => useIssueStore.getState().upsertIssueLocal(makeIssue({ id: 102, parent: null })));
    expect(linksOf()?.subIssues).toEqual([]);
  });

  it('le parent qui change de nom le dit sur ses sous-issues', () => {
    loaded();

    act(() => useIssueStore.getState().upsertIssueLocal(makeIssue({ id: 100, identifier: 'TF-100', sequenceNumber: 100, title: 'Parent renamed' })));

    expect(linksOf()?.subIssues[0].parent.title).toBe('Parent renamed');
  });

  it('une issue archivée quitte les liens, comme la lecture du serveur la laisse de côté', () => {
    loaded();

    act(() => useIssueStore.getState().upsertIssueLocal(makeIssue({ id: 100, archived: true })));

    expect(linksOf()).toEqual({ relations: [], subIssues: [] });
  });

  it('une issue d’un autre projet ne touche pas aux liens lus', () => {
    loaded(10);

    act(() => useIssueStore.getState().upsertIssueLocal(makeIssue({ id: 101, projectId: 11, title: 'Elsewhere' })));

    expect(useIssueStore.getState().projectRelations).toEqual({ 10: links() });
  });

  it('une issue supprimée emporte ses liens et laisse ses sous-issues sans parent ; les autres projets ne changent pas', () => {
    const elsewhere = links({ relations: [relation(5, 200, 201)], subIssues: [] });
    loaded(10, links({ relations: [relation(1, 100, 101), relation(2, 103, 104)] }));
    loaded(11, elsewhere);

    act(() => useIssueStore.getState().removeIssueLocal(100));

    expect(linksOf(10)).toEqual({ relations: [relation(2, 103, 104)], subIssues: [] });
    expect(linksOf(11)).toBe(elsewhere);
  });

  it('clearIssues oublie aussi les liens', () => {
    loaded();

    act(() => useIssueStore.getState().clearIssues());

    expect(useIssueStore.getState().projectRelations).toEqual({});
  });
});

// Le workflow d'un projet (séance n°25, W1) : toutes ses issues, sous-issues comprises, lues page par page.
describe('issue-store : les issues du workflow', () => {
  const page = (content: Issue[], pageNumber: number, totalPages: number, totalElements: number) => ({
    content, pageNumber, pageSize: 100, totalElements, totalPages, first: pageNumber === 0, last: pageNumber >= totalPages - 1,
    empty: content.length === 0,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useIssueStore.getState().clearIssues();
  });

  it('lit la première page, puis les autres, et ne pose les issues qu’une fois toutes lues', async () => {
    const all = Array.from({ length: 250 }, (_, i) => makeIssue({ id: i + 1, identifier: 'TF-' + (i + 1) }));
    vi.mocked(svc.listIssuesPage).mockImplementation(async (_slug, _project, n) => page(all.slice(n * 100, (n + 1) * 100), n, 3, 250));

    let read: Issue[] | null = null;
    await act(async () => { read = await useIssueStore.getState().fetchWorkflowIssues('acme', 10); });

    expect(vi.mocked(svc.listIssuesPage).mock.calls.map((call) => [call[2], call[3]])).toEqual([[0, 100], [1, 100], [2, 100]]);
    expect(read).toHaveLength(250);
    expect(useIssueStore.getState().workflowIssues).toMatchObject({ projectId: 10 });
    expect(useIssueStore.getState().workflowIssues?.issues).toHaveLength(250);
  });

  it('garde une issue une fois, même glissée d’une page à l’autre, et laisse les archivées', async () => {
    const one = makeIssue({ id: 1 });
    vi.mocked(svc.listIssuesPage).mockImplementation(async (_slug, _project, n) => page(
      n === 0 ? [one, makeIssue({ id: 2, archived: true })] : [one, makeIssue({ id: 3 })], n, 2, 4,
    ));
    await act(async () => { await useIssueStore.getState().fetchWorkflowIssues('acme', 10); });
    expect(useIssueStore.getState().workflowIssues?.issues.map((i) => i.id)).toEqual([1, 3]);
  });

  it('rend null en cas d’échec, et les issues d’avant restent', async () => {
    useIssueStore.setState({ workflowIssues: { projectId: 10, issues: [makeIssue()] } });
    vi.mocked(svc.listIssuesPage).mockRejectedValue(new Error('down'));
    let read: Issue[] | null = [];
    await act(async () => { read = await useIssueStore.getState().fetchWorkflowIssues('acme', 10); });
    expect(read).toBeNull();
    expect(useIssueStore.getState().workflowIssues?.issues).toHaveLength(1);
  });

  it('une lecture en retard d’un projet quitté ne se pose pas : le projet ouvert garde ses issues et ses documents', async () => {
    type Page = Awaited<ReturnType<typeof svc.listIssuesPage>>;
    let release: (value: Page) => void = () => {};
    vi.mocked(svc.listIssuesPage).mockImplementation((_slug, project) => (project === 3
      ? new Promise<Page>((resolve) => { release = resolve; })
      : Promise.resolve(page([makeIssue({ id: 50, projectId: 5 })], 0, 1, 1))));
    let late: Issue[] | null = [];
    await act(async () => {
      const left = useIssueStore.getState().fetchWorkflowIssues('acme', 3);
      await useIssueStore.getState().fetchWorkflowIssues('acme', 5);
      release(page([makeIssue({ id: 30, projectId: 3 })], 0, 1, 1));
      late = await left;
    });
    expect(late).toBeNull();
    expect(useIssueStore.getState().workflowIssues).toMatchObject({ projectId: 5, issues: [{ id: 50 }] });

    type Counts = Awaited<ReturnType<typeof attachments.listAttachmentCounts>>;
    let releaseCounts: (value: Counts) => void = () => {};
    vi.mocked(attachments.listAttachmentCounts).mockImplementation((_slug, project) => (project === 3
      ? new Promise<Counts>((resolve) => { releaseCounts = resolve; })
      : Promise.resolve([{ issueId: 50, count: 2 }])));
    await act(async () => {
      const left = useIssueStore.getState().fetchDocumentCounts('acme', 3);
      await useIssueStore.getState().fetchDocumentCounts('acme', 5);
      releaseCounts([{ issueId: 30, count: 9 }]);
      await left;
    });
    expect(useIssueStore.getState().documentCounts).toEqual({ projectId: 5, counts: { 50: 2 } });
  });

  it('le temps réel et les gestes les tiennent à jour : ajoutée, changée, archivée, supprimée ; rien pour un autre projet', async () => {
    useIssueStore.setState({ workflowIssues: { projectId: 10, issues: [makeIssue({ id: 1 }), makeIssue({ id: 2 })] } });
    const ids = () => useIssueStore.getState().workflowIssues?.issues.map((i) => i.id + ':' + i.title);

    act(() => useIssueStore.getState().upsertIssueLocal(makeIssue({ id: 3, title: 'New' })));
    act(() => useIssueStore.getState().upsertIssueLocal(makeIssue({ id: 1, title: 'Renamed' })));
    act(() => useIssueStore.getState().upsertIssueLocal(makeIssue({ id: 9, projectId: 11 })));
    expect(ids()).toEqual(['1:Renamed', '2:Issue title', '3:New']);

    act(() => useIssueStore.getState().upsertIssueLocal(makeIssue({ id: 2, archived: true })));
    expect(ids()).toEqual(['1:Renamed', '3:New']);
    act(() => useIssueStore.getState().removeIssueLocal(3));
    expect(ids()).toEqual(['1:Renamed']);

    vi.mocked(svc.updateIssue).mockResolvedValue(makeIssue({ id: 1, title: 'Moved' }));
    await act(async () => { await useIssueStore.getState().updateIssue('acme', 10, 1, { statusId: 2 }); });
    expect(ids()).toEqual(['1:Moved']);
    vi.mocked(svc.createIssue).mockResolvedValue(makeIssue({ id: 4, title: 'Created' }));
    await act(async () => { await useIssueStore.getState().createIssue('acme', 10, { title: 'Created' } as never); });
    vi.mocked(svc.setIssuePinned).mockResolvedValue(makeIssue({ id: 4, title: 'Pinned', pinned: true }));
    await act(async () => { await useIssueStore.getState().pinIssue('acme', 10, 4, true); });
    expect(ids()).toEqual(['1:Moved', '4:Pinned']);
    vi.mocked(svc.setIssueArchived).mockResolvedValue(makeIssue({ id: 4, archived: true }));
    await act(async () => { await useIssueStore.getState().archiveIssue('acme', 10, 4, true); });
    vi.mocked(svc.deleteIssue).mockResolvedValue(undefined);
    await act(async () => { await useIssueStore.getState().deleteIssue('acme', 10, 1); });
    expect(ids()).toEqual([]);
  });

  it('une suppression annulable retire l’issue du workflow, et l’y remet si on l’annule', () => {
    vi.useFakeTimers();
    const kept = makeIssue({ id: 1 });
    useIssueStore.setState({ issues: [kept], workflowIssues: { projectId: 10, issues: [kept, makeIssue({ id: 2 })] } });
    act(() => useIssueStore.getState().deleteIssueWithUndo('acme', 10, 1));
    expect(useIssueStore.getState().workflowIssues?.issues.map((i) => i.id)).toEqual([2]);
    vi.useRealTimers();
  });

  it('le nombre de documents de chaque issue, et l’activité d’une issue pour l’inspecteur', async () => {
    vi.mocked(attachments.listAttachmentCounts).mockResolvedValue([{ issueId: 1, count: 2 }, { issueId: 5, count: 1 }]);
    await act(async () => { await useIssueStore.getState().fetchDocumentCounts('acme', 10); });
    expect(useIssueStore.getState().documentCounts).toEqual({ projectId: 10, counts: { 1: 2, 5: 1 } });
    vi.mocked(attachments.listAttachmentCounts).mockRejectedValue(new Error('down'));
    let counts: Record<number, number> | null = {};
    await act(async () => { counts = await useIssueStore.getState().fetchDocumentCounts('acme', 10); });
    expect(counts).toBeNull();
    expect(useIssueStore.getState().documentCounts?.counts[1]).toBe(2);

    vi.mocked(svc.listActivity).mockResolvedValue([activity]);
    await act(async () => { await useIssueStore.getState().fetchIssueActivity('acme', 10, 100); });
    expect(useIssueStore.getState().issueActivity[100]).toEqual([activity]);
    // Celle de la fiche ouverte, à part, ne bouge pas.
    expect(useIssueStore.getState().activity).toEqual([]);
    vi.mocked(svc.listActivity).mockRejectedValue(new Error('down'));
    let read: IssueActivity[] | null = [];
    await act(async () => { read = await useIssueStore.getState().fetchIssueActivity('acme', 10, 100); });
    expect(read).toBeNull();
  });
});
