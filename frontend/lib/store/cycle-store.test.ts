import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCycleStore } from './cycle-store';
import type { Cycle } from '../api/cycle-service';
import type { Issue } from '../api/issue-service';
import * as svc from '../api/cycle-service';

vi.mock('../api/cycle-service', () => ({
  listCycles: vi.fn(),
  createCycle: vi.fn(),
  getCycle: vi.fn(),
  updateCycle: vi.fn(),
  deleteCycle: vi.fn(),
  listCycleIssues: vi.fn(),
  addIssueToCycle: vi.fn(),
  removeIssueFromCycle: vi.fn(),
}));

function makeCycle(overrides: Partial<Cycle> = {}): Cycle {
  return {
    id: 1,
    name: 'Sprint 1',
    description: null,
    startDate: null,
    endDate: null,
    status: 'DRAFT',
    createdBy: { id: 1, email: 'a@b.c', displayName: 'A', avatarUrl: null },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    issueCount: 0,
    ...overrides,
  };
}

function makeIssue(id: number): Issue {
  return {
    id,
    sequenceNumber: id,
    identifier: `TF-${id}`,
    projectId: 10,
    projectName: 'Proj',
    title: `Issue ${id}`,
    description: null,
    priority: 'NONE',
    status: { id: 1, name: 'Todo', color: '#fff', category: 'UNSTARTED', position: 0, isDefault: true },
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
  };
}

describe('cycle-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useCycleStore.setState({
        cycles: [],
        activeCycle: null,
        cycleIssues: [],
        isLoading: false,
        error: null,
      });
    });
  });

  it('fetchCycles populates cycles', async () => {
    const cycles = [makeCycle()];
    vi.mocked(svc.listCycles).mockResolvedValue(cycles);

    let result: Cycle[] = [];
    await act(async () => {
      result = await useCycleStore.getState().fetchCycles('acme', 10);
    });

    expect(svc.listCycles).toHaveBeenCalledWith('acme', 10);
    expect(useCycleStore.getState().cycles).toEqual(cycles);
    expect(useCycleStore.getState().isLoading).toBe(false);
    expect(result).toEqual(cycles);
  });

  it('fetchCycles sets error and returns [] on failure', async () => {
    vi.mocked(svc.listCycles).mockRejectedValue(new Error('boom'));

    let result: Cycle[] = [makeCycle()];
    await act(async () => {
      result = await useCycleStore.getState().fetchCycles('acme', 10);
    });

    expect(result).toEqual([]);
    expect(useCycleStore.getState().error).toBe('boom');
    expect(useCycleStore.getState().isLoading).toBe(false);
  });

  it('createCycle prepends the cycle', async () => {
    act(() => useCycleStore.setState({ cycles: [makeCycle({ id: 1 })] }));
    const created = makeCycle({ id: 2 });
    vi.mocked(svc.createCycle).mockResolvedValue(created);

    await act(async () => {
      await useCycleStore.getState().createCycle('acme', 10, { name: 'Sprint 2' });
    });

    expect(svc.createCycle).toHaveBeenCalledWith('acme', 10, { name: 'Sprint 2' });
    expect(useCycleStore.getState().cycles.map((c) => c.id)).toEqual([2, 1]);
  });

  it('createCycle sets error and returns null on failure', async () => {
    vi.mocked(svc.createCycle).mockRejectedValue(new Error('bad'));

    let result: Cycle | null = makeCycle();
    await act(async () => {
      result = await useCycleStore.getState().createCycle('acme', 10, { name: 'x' });
    });

    expect(result).toBeNull();
    expect(useCycleStore.getState().error).toBe('bad');
  });

  it('fetchCycle sets the active cycle', async () => {
    const cycle = makeCycle({ id: 3 });
    vi.mocked(svc.getCycle).mockResolvedValue(cycle);

    await act(async () => {
      await useCycleStore.getState().fetchCycle('acme', 10, 3);
    });

    expect(svc.getCycle).toHaveBeenCalledWith('acme', 10, 3);
    expect(useCycleStore.getState().activeCycle).toEqual(cycle);
    expect(useCycleStore.getState().isLoading).toBe(false);
  });

  it('fetchCycle sets error and returns null on failure', async () => {
    vi.mocked(svc.getCycle).mockRejectedValue(new Error('nope'));

    let result: Cycle | null = makeCycle();
    await act(async () => {
      result = await useCycleStore.getState().fetchCycle('acme', 10, 3);
    });

    expect(result).toBeNull();
    expect(useCycleStore.getState().error).toBe('nope');
  });

  it('updateCycle replaces the cycle by id and updates activeCycle', async () => {
    const original = makeCycle({ id: 5, name: 'old' });
    act(() => useCycleStore.setState({ cycles: [original], activeCycle: original }));
    const updated = makeCycle({ id: 5, name: 'new' });
    vi.mocked(svc.updateCycle).mockResolvedValue(updated);

    await act(async () => {
      await useCycleStore.getState().updateCycle('acme', 10, 5, { name: 'new' });
    });

    expect(svc.updateCycle).toHaveBeenCalledWith('acme', 10, 5, { name: 'new' });
    expect(useCycleStore.getState().cycles).toEqual([updated]);
    expect(useCycleStore.getState().activeCycle).toEqual(updated);
  });

  it('updateCycle sets error on failure', async () => {
    vi.mocked(svc.updateCycle).mockRejectedValue(new Error('upfail'));

    await act(async () => {
      await useCycleStore.getState().updateCycle('acme', 10, 5, { name: 'new' });
    });

    expect(useCycleStore.getState().error).toBe('upfail');
  });

  it('deleteCycle filters out the cycle and clears activeCycle', async () => {
    const cycle = makeCycle({ id: 7 });
    act(() => useCycleStore.setState({ cycles: [cycle], activeCycle: cycle }));
    vi.mocked(svc.deleteCycle).mockResolvedValue(undefined);

    await act(async () => {
      await useCycleStore.getState().deleteCycle('acme', 10, 7);
    });

    expect(svc.deleteCycle).toHaveBeenCalledWith('acme', 10, 7);
    expect(useCycleStore.getState().cycles).toEqual([]);
    expect(useCycleStore.getState().activeCycle).toBeNull();
  });

  it('deleteCycle sets error on failure', async () => {
    act(() => useCycleStore.setState({ cycles: [makeCycle({ id: 7 })] }));
    vi.mocked(svc.deleteCycle).mockRejectedValue(new Error('delfail'));

    await act(async () => {
      await useCycleStore.getState().deleteCycle('acme', 10, 7);
    });

    expect(useCycleStore.getState().error).toBe('delfail');
    expect(useCycleStore.getState().cycles).toHaveLength(1);
  });

  it('fetchCycleIssues populates cycleIssues', async () => {
    const issues = [makeIssue(1)];
    vi.mocked(svc.listCycleIssues).mockResolvedValue(issues);

    let result: Issue[] = [];
    await act(async () => {
      result = await useCycleStore.getState().fetchCycleIssues('acme', 10, 3);
    });

    expect(svc.listCycleIssues).toHaveBeenCalledWith('acme', 10, 3);
    expect(useCycleStore.getState().cycleIssues).toEqual(issues);
    expect(result).toEqual(issues);
  });

  it('fetchCycleIssues sets error and returns [] on failure', async () => {
    vi.mocked(svc.listCycleIssues).mockRejectedValue(new Error('cifail'));

    let result: Issue[] = [makeIssue(1)];
    await act(async () => {
      result = await useCycleStore.getState().fetchCycleIssues('acme', 10, 3);
    });

    expect(result).toEqual([]);
    expect(useCycleStore.getState().error).toBe('cifail');
  });

  it('addIssueToCycle calls the API then refetches the cycle issues', async () => {
    vi.mocked(svc.addIssueToCycle).mockResolvedValue(undefined);
    vi.mocked(svc.listCycleIssues).mockResolvedValue([makeIssue(1), makeIssue(2)]);

    await act(async () => {
      await useCycleStore.getState().addIssueToCycle('acme', 10, 3, 2);
    });

    expect(svc.addIssueToCycle).toHaveBeenCalledWith('acme', 10, 3, 2);
    expect(svc.listCycleIssues).toHaveBeenCalledWith('acme', 10, 3);
    expect(useCycleStore.getState().cycleIssues.map((i) => i.id)).toEqual([1, 2]);
  });

  it('addIssueToCycle sets error on failure', async () => {
    vi.mocked(svc.addIssueToCycle).mockRejectedValue(new Error('addfail'));

    await act(async () => {
      await useCycleStore.getState().addIssueToCycle('acme', 10, 3, 2);
    });

    expect(useCycleStore.getState().error).toBe('addfail');
    expect(svc.listCycleIssues).not.toHaveBeenCalled();
  });

  it('removeIssueFromCycle filters the issue out of cycleIssues', async () => {
    act(() => useCycleStore.setState({ cycleIssues: [makeIssue(1), makeIssue(2)] }));
    vi.mocked(svc.removeIssueFromCycle).mockResolvedValue(undefined);

    await act(async () => {
      await useCycleStore.getState().removeIssueFromCycle('acme', 10, 3, 1);
    });

    expect(svc.removeIssueFromCycle).toHaveBeenCalledWith('acme', 10, 3, 1);
    expect(useCycleStore.getState().cycleIssues.map((i) => i.id)).toEqual([2]);
  });

  it('removeIssueFromCycle sets error on failure', async () => {
    act(() => useCycleStore.setState({ cycleIssues: [makeIssue(1)] }));
    vi.mocked(svc.removeIssueFromCycle).mockRejectedValue(new Error('remfail'));

    await act(async () => {
      await useCycleStore.getState().removeIssueFromCycle('acme', 10, 3, 1);
    });

    expect(useCycleStore.getState().error).toBe('remfail');
    expect(useCycleStore.getState().cycleIssues).toHaveLength(1);
  });

  it('setActiveCycle sets and clears', () => {
    const cycle = makeCycle();
    act(() => useCycleStore.getState().setActiveCycle(cycle));
    expect(useCycleStore.getState().activeCycle).toEqual(cycle);
    act(() => useCycleStore.getState().setActiveCycle(null));
    expect(useCycleStore.getState().activeCycle).toBeNull();
  });

  it('clearCycles resets the store', () => {
    act(() =>
      useCycleStore.setState({
        cycles: [makeCycle()],
        activeCycle: makeCycle(),
        cycleIssues: [makeIssue(1)],
        error: 'x',
      }),
    );
    act(() => useCycleStore.getState().clearCycles());

    const s = useCycleStore.getState();
    expect(s.cycles).toEqual([]);
    expect(s.activeCycle).toBeNull();
    expect(s.cycleIssues).toEqual([]);
    expect(s.error).toBeNull();
  });
});
