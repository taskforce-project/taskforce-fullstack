import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore, selectActiveProjects, selectArchivedProjects } from './project-store';
import type { Project } from '../api/project-service';
import * as svc from '../api/project-service';

vi.mock('../api/project-service', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
  deleteProject: vi.fn(),
  favoriteProject: vi.fn(),
  unfavoriteProject: vi.fn(),
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    name: 'Proj',
    identifier: 'PRJ',
    description: null,
    status: 'ACTIVE',
    isPublic: false,
    isFavorite: false,
    workspaceId: 1,
    workspaceSlug: 'acme',
    createdById: 1,
    createdByName: 'A',
    memberCount: 1,
    totalIssues: 0,
    openIssues: 0,
    members: [],
    labels: [],
    iconUrl: null,
    color: '#fff',
    growthMode: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('project-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useProjectStore.setState({ projects: [], activeProject: null, isLoading: false, error: null });
    });
  });

  it('fetchProjects populates the list', async () => {
    const projects = [makeProject()];
    vi.mocked(svc.listProjects).mockResolvedValue(projects);

    let result: Project[] = [];
    await act(async () => {
      result = await useProjectStore.getState().fetchProjects('acme');
    });

    expect(svc.listProjects).toHaveBeenCalledWith('acme');
    expect(useProjectStore.getState().projects).toEqual(projects);
    expect(useProjectStore.getState().isLoading).toBe(false);
    expect(result).toEqual(projects);
  });

  it('fetchProjects sets error and returns [] on failure', async () => {
    vi.mocked(svc.listProjects).mockRejectedValue(new Error('boom'));

    let result: Project[] = [makeProject()];
    await act(async () => {
      result = await useProjectStore.getState().fetchProjects('acme');
    });

    expect(result).toEqual([]);
    expect(useProjectStore.getState().error).toBe('boom');
    expect(useProjectStore.getState().isLoading).toBe(false);
  });

  it('createProject prepends the project', async () => {
    act(() => useProjectStore.setState({ projects: [makeProject({ id: 1 })] }));
    const created = makeProject({ id: 2 });
    vi.mocked(svc.createProject).mockResolvedValue(created);

    await act(async () => {
      await useProjectStore.getState().createProject('acme', { name: 'X', identifier: 'X' });
    });

    expect(svc.createProject).toHaveBeenCalledWith('acme', { name: 'X', identifier: 'X' });
    expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual([2, 1]);
  });

  it('createProject sets error and returns null on failure', async () => {
    vi.mocked(svc.createProject).mockRejectedValue(new Error('bad'));

    let result: Project | null = makeProject();
    await act(async () => {
      result = await useProjectStore.getState().createProject('acme', { name: 'X', identifier: 'X' });
    });

    expect(result).toBeNull();
    expect(useProjectStore.getState().error).toBe('bad');
  });

  it('updateProject replaces the project by id and updates activeProject', async () => {
    const original = makeProject({ id: 5, name: 'old' });
    act(() => useProjectStore.setState({ projects: [original], activeProject: original }));
    const updated = makeProject({ id: 5, name: 'new' });
    vi.mocked(svc.updateProject).mockResolvedValue(updated);

    await act(async () => {
      await useProjectStore.getState().updateProject('acme', 5, { name: 'new' });
    });

    expect(svc.updateProject).toHaveBeenCalledWith('acme', 5, { name: 'new' });
    expect(useProjectStore.getState().projects).toEqual([updated]);
    expect(useProjectStore.getState().activeProject).toEqual(updated);
  });

  it('updateProject sets error on failure', async () => {
    vi.mocked(svc.updateProject).mockRejectedValue(new Error('upfail'));

    await act(async () => {
      await useProjectStore.getState().updateProject('acme', 5, { name: 'new' });
    });

    expect(useProjectStore.getState().error).toBe('upfail');
  });

  it('archiveProject replaces the project by id', async () => {
    const original = makeProject({ id: 5, status: 'ACTIVE' });
    act(() => useProjectStore.setState({ projects: [original], activeProject: original }));
    const updated = makeProject({ id: 5, status: 'ARCHIVED' });
    vi.mocked(svc.archiveProject).mockResolvedValue(updated);

    await act(async () => {
      await useProjectStore.getState().archiveProject('acme', 5);
    });

    expect(svc.archiveProject).toHaveBeenCalledWith('acme', 5);
    expect(useProjectStore.getState().projects).toEqual([updated]);
    expect(useProjectStore.getState().activeProject).toEqual(updated);
  });

  it('archiveProject sets error on failure', async () => {
    vi.mocked(svc.archiveProject).mockRejectedValue(new Error('arcfail'));

    await act(async () => {
      await useProjectStore.getState().archiveProject('acme', 5);
    });

    expect(useProjectStore.getState().error).toBe('arcfail');
  });

  it('toggleFavorite (on) optimistically flips then applies the server value', async () => {
    const original = makeProject({ id: 5, isFavorite: false });
    act(() => useProjectStore.setState({ projects: [original] }));
    const updated = makeProject({ id: 5, isFavorite: true, name: 'server' });
    vi.mocked(svc.favoriteProject).mockResolvedValue(updated);

    await act(async () => {
      await useProjectStore.getState().toggleFavorite('acme', 5, true);
    });

    expect(svc.favoriteProject).toHaveBeenCalledWith('acme', 5);
    expect(svc.unfavoriteProject).not.toHaveBeenCalled();
    expect(useProjectStore.getState().projects).toEqual([updated]);
  });

  it('toggleFavorite (off) calls the unfavorite endpoint', async () => {
    const original = makeProject({ id: 5, isFavorite: true });
    act(() => useProjectStore.setState({ projects: [original] }));
    const updated = makeProject({ id: 5, isFavorite: false });
    vi.mocked(svc.unfavoriteProject).mockResolvedValue(updated);

    await act(async () => {
      await useProjectStore.getState().toggleFavorite('acme', 5, false);
    });

    expect(svc.unfavoriteProject).toHaveBeenCalledWith('acme', 5);
    expect(useProjectStore.getState().projects).toEqual([updated]);
  });

  it('toggleFavorite reverts the optimistic flip on failure', async () => {
    const original = makeProject({ id: 5, isFavorite: false });
    act(() => useProjectStore.setState({ projects: [original] }));
    vi.mocked(svc.favoriteProject).mockRejectedValue(new Error('favfail'));

    let result: Project | null = makeProject();
    await act(async () => {
      result = await useProjectStore.getState().toggleFavorite('acme', 5, true);
    });

    expect(result).toBeNull();
    expect(useProjectStore.getState().projects[0].isFavorite).toBe(false);
    expect(useProjectStore.getState().error).toBe('favfail');
  });

  it('deleteProject filters out the project and clears activeProject', async () => {
    const project = makeProject({ id: 7 });
    act(() => useProjectStore.setState({ projects: [project], activeProject: project }));
    vi.mocked(svc.deleteProject).mockResolvedValue(undefined);

    await act(async () => {
      await useProjectStore.getState().deleteProject('acme', 7);
    });

    expect(svc.deleteProject).toHaveBeenCalledWith('acme', 7);
    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().activeProject).toBeNull();
  });

  it('deleteProject sets error on failure', async () => {
    act(() => useProjectStore.setState({ projects: [makeProject({ id: 7 })] }));
    vi.mocked(svc.deleteProject).mockRejectedValue(new Error('delfail'));

    await act(async () => {
      await useProjectStore.getState().deleteProject('acme', 7);
    });

    expect(useProjectStore.getState().error).toBe('delfail');
    expect(useProjectStore.getState().projects).toHaveLength(1);
  });

  it('setActiveProject sets and clears', () => {
    const project = makeProject();
    act(() => useProjectStore.getState().setActiveProject(project));
    expect(useProjectStore.getState().activeProject).toEqual(project);
    act(() => useProjectStore.getState().setActiveProject(null));
    expect(useProjectStore.getState().activeProject).toBeNull();
  });

  it('clearProjects resets the store', () => {
    act(() =>
      useProjectStore.setState({ projects: [makeProject()], activeProject: makeProject(), error: 'x' }),
    );
    act(() => useProjectStore.getState().clearProjects());

    const s = useProjectStore.getState();
    expect(s.projects).toEqual([]);
    expect(s.activeProject).toBeNull();
    expect(s.error).toBeNull();
  });

  it('selectActiveProjects returns ACTIVE and PAUSED projects', () => {
    const state = {
      projects: [
        makeProject({ id: 1, status: 'ACTIVE' }),
        makeProject({ id: 2, status: 'PAUSED' }),
        makeProject({ id: 3, status: 'ARCHIVED' }),
      ],
    } as ReturnType<typeof useProjectStore.getState>;

    expect(selectActiveProjects(state).map((p) => p.id)).toEqual([1, 2]);
  });

  it('selectArchivedProjects returns ARCHIVED projects', () => {
    const state = {
      projects: [
        makeProject({ id: 1, status: 'ACTIVE' }),
        makeProject({ id: 3, status: 'ARCHIVED' }),
      ],
    } as ReturnType<typeof useProjectStore.getState>;

    expect(selectArchivedProjects(state).map((p) => p.id)).toEqual([3]);
  });
});
