import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from './workspace-store';
import type { Workspace, WorkspaceMember } from '../api/workspace-service';
import * as svc from '../api/workspace-service';

vi.mock('../api/workspace-service', () => ({
  listWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  getWorkspaceBySlug: vi.fn(),
  updateWorkspace: vi.fn(),
  getWorkspaceMembers: vi.fn(),
  inviteMember: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  deleteWorkspace: vi.fn(),
}));

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 1,
    uuid: 'uuid-1',
    name: 'Acme',
    slug: 'acme',
    description: null,
    logoUrl: null,
    ownerId: 1,
    ownerName: 'Owner',
    memberCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMember(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    id: 1,
    userId: 10,
    email: 'a@b.c',
    displayName: 'A',
    avatarUrl: null,
    role: 'MEMBER',
    joinedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('workspace-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useWorkspaceStore.setState({
        workspaces: [],
        activeWorkspace: null,
        workspace: null,
        members: [],
        isLoading: false,
        membersLoading: false,
        workspacesLoaded: false,
      });
    });
  });

  it('fetchWorkspaces populates the list and flags loaded', async () => {
    const ws = [makeWorkspace()];
    vi.mocked(svc.listWorkspaces).mockResolvedValue(ws);

    let result: Workspace[] = [];
    await act(async () => {
      result = await useWorkspaceStore.getState().fetchWorkspaces();
    });

    expect(svc.listWorkspaces).toHaveBeenCalledTimes(1);
    expect(useWorkspaceStore.getState().workspaces).toEqual(ws);
    expect(useWorkspaceStore.getState().workspacesLoaded).toBe(true);
    expect(useWorkspaceStore.getState().isLoading).toBe(false);
    expect(result).toEqual(ws);
  });

  it('fetchWorkspaces returns [] and flags loaded on failure', async () => {
    vi.mocked(svc.listWorkspaces).mockRejectedValue(new Error('x'));

    let result: Workspace[] = [makeWorkspace()];
    await act(async () => {
      result = await useWorkspaceStore.getState().fetchWorkspaces();
    });

    expect(result).toEqual([]);
    expect(useWorkspaceStore.getState().workspacesLoaded).toBe(true);
    expect(useWorkspaceStore.getState().isLoading).toBe(false);
  });

  it('setActiveBySlug returns the cached workspace without calling API', async () => {
    const cached = makeWorkspace({ slug: 'acme' });
    act(() => useWorkspaceStore.setState({ workspaces: [cached] }));

    let result: Workspace | null = null;
    await act(async () => {
      result = await useWorkspaceStore.getState().setActiveBySlug('acme');
    });

    expect(svc.getWorkspaceBySlug).not.toHaveBeenCalled();
    expect(result).toEqual(cached);
    expect(useWorkspaceStore.getState().activeWorkspace).toEqual(cached);
    expect(useWorkspaceStore.getState().workspace).toEqual(cached);
  });

  it('setActiveBySlug fetches from API and appends when not cached', async () => {
    const fetched = makeWorkspace({ slug: 'beta', id: 2 });
    vi.mocked(svc.getWorkspaceBySlug).mockResolvedValue(fetched);

    await act(async () => {
      await useWorkspaceStore.getState().setActiveBySlug('beta');
    });

    expect(svc.getWorkspaceBySlug).toHaveBeenCalledWith('beta');
    expect(useWorkspaceStore.getState().activeWorkspace).toEqual(fetched);
    expect(useWorkspaceStore.getState().workspaces).toEqual([fetched]);
  });

  it('setActiveBySlug returns null on API failure', async () => {
    vi.mocked(svc.getWorkspaceBySlug).mockRejectedValue(new Error('x'));

    let result: Workspace | null = makeWorkspace();
    await act(async () => {
      result = await useWorkspaceStore.getState().setActiveBySlug('beta');
    });

    expect(result).toBeNull();
    expect(useWorkspaceStore.getState().isLoading).toBe(false);
  });

  it('createWorkspace appends the created workspace', async () => {
    act(() => useWorkspaceStore.setState({ workspaces: [makeWorkspace({ id: 1 })] }));
    const created = makeWorkspace({ id: 2, slug: 'new' });
    vi.mocked(svc.createWorkspace).mockResolvedValue(created);

    await act(async () => {
      await useWorkspaceStore.getState().createWorkspace({ name: 'New' });
    });

    expect(svc.createWorkspace).toHaveBeenCalledWith({ name: 'New' });
    expect(useWorkspaceStore.getState().workspaces.map((w) => w.id)).toEqual([1, 2]);
  });

  it('createWorkspace returns null on failure', async () => {
    vi.mocked(svc.createWorkspace).mockRejectedValue(new Error('x'));

    let result: Workspace | null = makeWorkspace();
    await act(async () => {
      result = await useWorkspaceStore.getState().createWorkspace({ name: 'New' });
    });

    expect(result).toBeNull();
  });

  it('updateWorkspaceInfo returns null when there is no active workspace', async () => {
    let result: Workspace | null = makeWorkspace();
    await act(async () => {
      result = await useWorkspaceStore.getState().updateWorkspaceInfo({ name: 'X' });
    });

    expect(result).toBeNull();
    expect(svc.updateWorkspace).not.toHaveBeenCalled();
  });

  it('updateWorkspaceInfo updates active workspace and the list entry', async () => {
    const active = makeWorkspace({ slug: 'acme' });
    act(() => useWorkspaceStore.setState({ activeWorkspace: active, workspaces: [active] }));
    const updated = makeWorkspace({ slug: 'acme', name: 'Renamed' });
    vi.mocked(svc.updateWorkspace).mockResolvedValue(updated);

    await act(async () => {
      await useWorkspaceStore.getState().updateWorkspaceInfo({ name: 'Renamed' });
    });

    expect(svc.updateWorkspace).toHaveBeenCalledWith('acme', { name: 'Renamed' });
    expect(useWorkspaceStore.getState().activeWorkspace).toEqual(updated);
    expect(useWorkspaceStore.getState().workspaces).toEqual([updated]);
  });

  it('updateWorkspaceInfo returns null on failure', async () => {
    act(() => useWorkspaceStore.setState({ activeWorkspace: makeWorkspace({ slug: 'acme' }) }));
    vi.mocked(svc.updateWorkspace).mockRejectedValue(new Error('x'));

    let result: Workspace | null = makeWorkspace();
    await act(async () => {
      result = await useWorkspaceStore.getState().updateWorkspaceInfo({ name: 'X' });
    });

    expect(result).toBeNull();
    expect(useWorkspaceStore.getState().isLoading).toBe(false);
  });

  it('deleteCurrentWorkspace removes it and switches to a remaining one', async () => {
    const a = makeWorkspace({ id: 1, slug: 'a' });
    const b = makeWorkspace({ id: 2, slug: 'b' });
    act(() =>
      useWorkspaceStore.setState({
        workspaces: [a, b],
        activeWorkspace: a,
        members: [makeMember()],
      }),
    );
    vi.mocked(svc.deleteWorkspace).mockResolvedValue(undefined);

    let nextSlug: string | null = null;
    await act(async () => {
      nextSlug = await useWorkspaceStore.getState().deleteCurrentWorkspace('a');
    });

    expect(svc.deleteWorkspace).toHaveBeenCalledWith('a');
    expect(useWorkspaceStore.getState().workspaces).toEqual([b]);
    expect(useWorkspaceStore.getState().activeWorkspace).toEqual(b);
    expect(useWorkspaceStore.getState().members).toEqual([]);
    expect(nextSlug).toBe('b');
  });

  it('fetchMembers returns [] when there is no active workspace', async () => {
    let result: WorkspaceMember[] = [makeMember()];
    await act(async () => {
      result = await useWorkspaceStore.getState().fetchMembers();
    });

    expect(result).toEqual([]);
    expect(svc.getWorkspaceMembers).not.toHaveBeenCalled();
  });

  it('fetchMembers populates members', async () => {
    act(() => useWorkspaceStore.setState({ activeWorkspace: makeWorkspace({ slug: 'acme' }) }));
    const members = [makeMember()];
    vi.mocked(svc.getWorkspaceMembers).mockResolvedValue(members);

    await act(async () => {
      await useWorkspaceStore.getState().fetchMembers();
    });

    expect(svc.getWorkspaceMembers).toHaveBeenCalledWith('acme');
    expect(useWorkspaceStore.getState().members).toEqual(members);
    expect(useWorkspaceStore.getState().membersLoading).toBe(false);
  });

  it('fetchMembers returns [] on failure', async () => {
    act(() => useWorkspaceStore.setState({ activeWorkspace: makeWorkspace({ slug: 'acme' }) }));
    vi.mocked(svc.getWorkspaceMembers).mockRejectedValue(new Error('x'));

    let result: WorkspaceMember[] = [makeMember()];
    await act(async () => {
      result = await useWorkspaceStore.getState().fetchMembers();
    });

    expect(result).toEqual([]);
    expect(useWorkspaceStore.getState().membersLoading).toBe(false);
  });

  it('invite appends the new member', async () => {
    act(() => useWorkspaceStore.setState({ activeWorkspace: makeWorkspace({ slug: 'acme' }), members: [] }));
    const member = makeMember({ id: 5 });
    vi.mocked(svc.inviteMember).mockResolvedValue(member);

    await act(async () => {
      await useWorkspaceStore.getState().invite({ email: 'x@y.z' });
    });

    expect(svc.inviteMember).toHaveBeenCalledWith('acme', { email: 'x@y.z' });
    expect(useWorkspaceStore.getState().members).toEqual([member]);
  });

  it('invite returns null when there is no active workspace', async () => {
    let result: WorkspaceMember | null = makeMember();
    await act(async () => {
      result = await useWorkspaceStore.getState().invite({ email: 'x@y.z' });
    });

    expect(result).toBeNull();
    expect(svc.inviteMember).not.toHaveBeenCalled();
  });

  it('changeRole replaces the member by id', async () => {
    act(() =>
      useWorkspaceStore.setState({
        activeWorkspace: makeWorkspace({ slug: 'acme' }),
        members: [makeMember({ id: 5, role: 'MEMBER' })],
      }),
    );
    const updated = makeMember({ id: 5, role: 'ADMIN' });
    vi.mocked(svc.updateMemberRole).mockResolvedValue(updated);

    await act(async () => {
      await useWorkspaceStore.getState().changeRole(5, { role: 'ADMIN' });
    });

    expect(svc.updateMemberRole).toHaveBeenCalledWith('acme', 5, { role: 'ADMIN' });
    expect(useWorkspaceStore.getState().members).toEqual([updated]);
  });

  it('kick removes the member', async () => {
    act(() =>
      useWorkspaceStore.setState({
        activeWorkspace: makeWorkspace({ slug: 'acme' }),
        members: [makeMember({ id: 5 })],
      }),
    );
    vi.mocked(svc.removeMember).mockResolvedValue(undefined);

    await act(async () => {
      await useWorkspaceStore.getState().kick(5);
    });

    expect(svc.removeMember).toHaveBeenCalledWith('acme', 5);
    expect(useWorkspaceStore.getState().members).toEqual([]);
  });

  it('setWorkspace updates both workspace and activeWorkspace', () => {
    const ws = makeWorkspace();
    act(() => useWorkspaceStore.getState().setWorkspace(ws));
    expect(useWorkspaceStore.getState().workspace).toEqual(ws);
    expect(useWorkspaceStore.getState().activeWorkspace).toEqual(ws);
  });

  it('fetchWorkspace selects the first workspace as active', async () => {
    const ws = makeWorkspace({ id: 7 });
    vi.mocked(svc.listWorkspaces).mockResolvedValue([ws]);

    let result: Workspace | null = null;
    await act(async () => {
      result = await useWorkspaceStore.getState().fetchWorkspace();
    });

    expect(result).toEqual(ws);
    expect(useWorkspaceStore.getState().activeWorkspace).toEqual(ws);
  });

  it('clearWorkspace resets the store', () => {
    act(() =>
      useWorkspaceStore.setState({
        workspaces: [makeWorkspace()],
        activeWorkspace: makeWorkspace(),
        workspace: makeWorkspace(),
        members: [makeMember()],
        workspacesLoaded: true,
      }),
    );

    act(() => useWorkspaceStore.getState().clearWorkspace());

    const s = useWorkspaceStore.getState();
    expect(s.workspaces).toEqual([]);
    expect(s.activeWorkspace).toBeNull();
    expect(s.workspace).toBeNull();
    expect(s.members).toEqual([]);
    expect(s.workspacesLoaded).toBe(false);
  });
});
