import { describe, it, expect, beforeEach, vi } from 'vitest';
import { listLeaves, createLeave, deleteLeave } from './availability-service';
import { apiClient } from './client';
import { AVAILABILITY_ROUTES } from '../config/api-routes';

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

describe('availability-service', () => {
  const slug = 'acme';
  const userId = 9;
  const leaveId = 4;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listLeaves: GET leaves route and returns leaves', async () => {
    const leaves = [{ id: 1, type: 'VACATION' }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(leaves));

    const result = await listLeaves(slug, userId);

    expect(apiClient.get).toHaveBeenCalledWith(AVAILABILITY_ROUTES.LEAVES(slug, userId));
    expect(result).toEqual(leaves);
  });

  it('createLeave: POST leaves route with payload and returns leave', async () => {
    const payload = { type: 'SICK' as const, startDate: '2026-01-01', endDate: '2026-01-02' };
    const created = { id: 2, type: 'SICK' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(created));

    const result = await createLeave(slug, userId, payload);

    expect(apiClient.post).toHaveBeenCalledWith(AVAILABILITY_ROUTES.LEAVES(slug, userId), payload);
    expect(result).toEqual(created);
  });

  it('deleteLeave: DELETE leave route', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(undefined));

    await deleteLeave(slug, userId, leaveId);

    expect(apiClient.delete).toHaveBeenCalledWith(AVAILABILITY_ROUTES.LEAVE(slug, userId, leaveId));
  });

  it('listLeaves: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(listLeaves(slug, userId)).rejects.toThrow('boom');
  });
});
