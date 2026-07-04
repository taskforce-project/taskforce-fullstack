import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listCycles,
  createCycle,
  getCycle,
  updateCycle,
  deleteCycle,
  listCycleIssues,
  addIssueToCycle,
  removeIssueFromCycle,
} from './cycle-service';
import { apiClient } from './client';
import { CYCLE_ROUTES } from '../config/api-routes';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  getErrorMessage: vi.fn((e: any) => e?.message || 'error'),
}));

const envelope = <T,>(data: T) => ({ data: { success: true, message: 'ok', data } });

describe('cycle-service', () => {
  const slug = 'acme';
  const projectId = 42;
  const cycleId = 7;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listCycles: GET route and returns payload', async () => {
    const payload = [{ id: 1, name: 'Sprint 1' }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(payload));

    const result = await listCycles(slug, projectId);

    expect(apiClient.get).toHaveBeenCalledWith(CYCLE_ROUTES.LIST(slug, projectId));
    expect(result).toEqual(payload);
  });

  it('createCycle: POST route with payload and returns created cycle', async () => {
    const payload = { name: 'Sprint 2', description: 'desc' };
    const created = { id: 2, name: 'Sprint 2' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(created));

    const result = await createCycle(slug, projectId, payload);

    expect(apiClient.post).toHaveBeenCalledWith(CYCLE_ROUTES.CREATE(slug, projectId), payload);
    expect(result).toEqual(created);
  });

  it('getCycle: GET by-id route and returns cycle', async () => {
    const cycle = { id: cycleId, name: 'Sprint 3' };
    vi.mocked(apiClient.get).mockResolvedValue(envelope(cycle));

    const result = await getCycle(slug, projectId, cycleId);

    expect(apiClient.get).toHaveBeenCalledWith(CYCLE_ROUTES.BY_ID(slug, projectId, cycleId));
    expect(result).toEqual(cycle);
  });

  it('updateCycle: PATCH route with payload and returns updated cycle', async () => {
    const payload = { name: 'Renamed', status: 'ACTIVE' as const };
    const updated = { id: cycleId, name: 'Renamed' };
    vi.mocked(apiClient.patch).mockResolvedValue(envelope(updated));

    const result = await updateCycle(slug, projectId, cycleId, payload);

    expect(apiClient.patch).toHaveBeenCalledWith(CYCLE_ROUTES.UPDATE(slug, projectId, cycleId), payload);
    expect(result).toEqual(updated);
  });

  it('deleteCycle: DELETE route', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(undefined));

    await deleteCycle(slug, projectId, cycleId);

    expect(apiClient.delete).toHaveBeenCalledWith(CYCLE_ROUTES.DELETE(slug, projectId, cycleId));
  });

  it('listCycleIssues: GET issues route and returns issues', async () => {
    const issues = [{ id: 100 }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(issues));

    const result = await listCycleIssues(slug, projectId, cycleId);

    expect(apiClient.get).toHaveBeenCalledWith(CYCLE_ROUTES.ISSUES(slug, projectId, cycleId));
    expect(result).toEqual(issues);
  });

  it('addIssueToCycle: POST issues route with { issueId }', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope(undefined));

    await addIssueToCycle(slug, projectId, cycleId, 100);

    expect(apiClient.post).toHaveBeenCalledWith(CYCLE_ROUTES.ISSUES(slug, projectId, cycleId), { issueId: 100 });
  });

  it('removeIssueFromCycle: DELETE issue route', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(undefined));

    await removeIssueFromCycle(slug, projectId, cycleId, 100);

    expect(apiClient.delete).toHaveBeenCalledWith(CYCLE_ROUTES.ISSUE(slug, projectId, cycleId, 100));
  });

  it('listCycles: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(listCycles(slug, projectId)).rejects.toThrow('boom');
  });
});
