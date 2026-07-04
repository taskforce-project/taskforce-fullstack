import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMe, updateMe, searchUsers } from './user-service';
import { apiClient } from './client';
import { USER_ROUTES } from '../config/api-routes';

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

describe('user-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMe: GET ME route and returns user', async () => {
    const user = { id: '1', email: 'me@x.com' };
    vi.mocked(apiClient.get).mockResolvedValue(envelope(user));

    const result = await getMe();

    expect(apiClient.get).toHaveBeenCalledWith(USER_ROUTES.ME);
    expect(result).toEqual(user);
  });

  it('updateMe: PATCH ME route with payload and returns user', async () => {
    const payload = { displayName: 'New Name' };
    const updated = { id: '1', email: 'me@x.com', displayName: 'New Name' };
    vi.mocked(apiClient.patch).mockResolvedValue(envelope(updated));

    const result = await updateMe(payload);

    expect(apiClient.patch).toHaveBeenCalledWith(USER_ROUTES.ME, payload);
    expect(result).toEqual(updated);
  });

  it('searchUsers: GET search route and returns results', async () => {
    const results = [{ id: 1, email: 'a@x.com', displayName: 'A', avatarUrl: null }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(results));

    const result = await searchUsers('alice');

    expect(apiClient.get).toHaveBeenCalledWith(USER_ROUTES.SEARCH('alice'));
    expect(result).toEqual(results);
  });

  it('searchUsers: returns [] and does not call client for blank query', async () => {
    const result = await searchUsers('   ');

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('getMe: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(getMe()).rejects.toThrow('boom');
  });
});
