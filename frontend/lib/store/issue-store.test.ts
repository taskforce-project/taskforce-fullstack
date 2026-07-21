import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIssueStore } from './issue-store';
import type {
  Issue,
  IssueStatus,
  IssueType,
  IssueComment,
  IssueActivity,
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
}));

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
