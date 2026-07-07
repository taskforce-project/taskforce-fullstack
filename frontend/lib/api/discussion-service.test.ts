import { describe, it, expect, beforeEach, vi } from 'vitest';
import { discussionService } from './discussion-service';
import { apiClient } from './client';
import { DISCUSSION_ROUTES } from '../config/api-routes';

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

describe('discussionService', () => {
  const slug = 'acme';
  const id = 5;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list: GET list route with undefined params and returns discussions', async () => {
    const discussions = [{ id: 1, title: 'D1' }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(discussions));

    const result = await discussionService.list(slug);

    expect(apiClient.get).toHaveBeenCalledWith(DISCUSSION_ROUTES.LIST(slug), { params: undefined });
    expect(result).toEqual(discussions);
  });

  it('list: passes category as query param when provided', async () => {
    const discussions = [{ id: 1, title: 'D1', category: 'IDEA' }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(discussions));

    const result = await discussionService.list(slug, 'IDEA');

    expect(apiClient.get).toHaveBeenCalledWith(DISCUSSION_ROUTES.LIST(slug), { params: { category: 'IDEA' } });
    expect(result).toEqual(discussions);
  });

  it('get: GET by-id route and returns discussion', async () => {
    const discussion = { id, title: 'D' };
    vi.mocked(apiClient.get).mockResolvedValue(envelope(discussion));

    const result = await discussionService.get(slug, id);

    expect(apiClient.get).toHaveBeenCalledWith(DISCUSSION_ROUTES.BY_ID(slug, id));
    expect(result).toEqual(discussion);
  });

  it('create: POST create route with payload and returns discussion', async () => {
    const payload = { title: 'New', category: 'GENERAL' as const };
    const created = { id: 2, title: 'New' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(created));

    const result = await discussionService.create(slug, payload);

    expect(apiClient.post).toHaveBeenCalledWith(DISCUSSION_ROUTES.CREATE(slug), payload);
    expect(result).toEqual(created);
  });

  it('update: PATCH update route with payload and returns discussion', async () => {
    const payload = { title: 'Renamed' };
    const updated = { id, title: 'Renamed' };
    vi.mocked(apiClient.patch).mockResolvedValue(envelope(updated));

    const result = await discussionService.update(slug, id, payload);

    expect(apiClient.patch).toHaveBeenCalledWith(DISCUSSION_ROUTES.UPDATE(slug, id), payload);
    expect(result).toEqual(updated);
  });

  it('delete: DELETE route and resolves undefined', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(undefined));

    const result = await discussionService.delete(slug, id);

    expect(apiClient.delete).toHaveBeenCalledWith(DISCUSSION_ROUTES.DELETE(slug, id));
    expect(result).toBeUndefined();
  });

  it('togglePin: PATCH pin route and returns discussion', async () => {
    const pinned = { id, isPinned: true };
    vi.mocked(apiClient.patch).mockResolvedValue(envelope(pinned));

    const result = await discussionService.togglePin(slug, id);

    expect(apiClient.patch).toHaveBeenCalledWith(DISCUSSION_ROUTES.PIN(slug, id));
    expect(result).toEqual(pinned);
  });

  it('toggleLock: PATCH lock route and returns discussion', async () => {
    const locked = { id, isLocked: true };
    vi.mocked(apiClient.patch).mockResolvedValue(envelope(locked));

    const result = await discussionService.toggleLock(slug, id);

    expect(apiClient.patch).toHaveBeenCalledWith(DISCUSSION_ROUTES.LOCK(slug, id));
    expect(result).toEqual(locked);
  });

  it('list: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(discussionService.list(slug)).rejects.toThrow('boom');
  });
});
