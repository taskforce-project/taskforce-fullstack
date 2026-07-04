import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getProfile } from './profile-service';
import { apiClient } from './client';
import { PROFILE_ROUTES } from '../config/api-routes';

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

describe('profile-service', () => {
  const slug = 'acme';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getProfile: GET profile route and returns profile data', async () => {
    const profile = {
      stats: { issuesCreated: 1, issuesClosed: 0, cyclesCompleted: 0, daysActive: 3, teammateCount: 2 },
      activity: [],
      heatmap: [],
    };
    vi.mocked(apiClient.get).mockResolvedValue(envelope(profile));

    const result = await getProfile(slug);

    expect(apiClient.get).toHaveBeenCalledWith(PROFILE_ROUTES.GET(slug));
    expect(result).toEqual(profile);
  });

  it('getProfile: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(getProfile(slug)).rejects.toThrow('boom');
  });
});
