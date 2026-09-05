import { describe, it, expect, beforeEach, vi } from 'vitest';
import { exportMyData, deleteMyAccount, restoreMyAccount } from './gdpr-service';
import { apiClient } from './client';
import { GDPR_ROUTES } from '../config/api-routes';

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

describe('gdpr-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exportMyData: GET export route and returns data', async () => {
    const data = { user: { id: 1 }, issues: [] };
    vi.mocked(apiClient.get).mockResolvedValue(envelope(data));

    const result = await exportMyData();

    expect(apiClient.get).toHaveBeenCalledWith(GDPR_ROUTES.EXPORT());
    expect(result).toEqual(data);
  });

  it('deleteMyAccount: DELETE account route and returns the scheduled purge date', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope({ scheduledPurgeAt: '2026-10-04T04:00:00' }));

    const result = await deleteMyAccount();

    expect(apiClient.delete).toHaveBeenCalledWith(GDPR_ROUTES.ACCOUNT());
    expect(result).toBe('2026-10-04T04:00:00');
  });

  it('restoreMyAccount: POST restore route', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope(undefined));

    await restoreMyAccount();

    expect(apiClient.post).toHaveBeenCalledWith(GDPR_ROUTES.ACCOUNT_RESTORE());
  });

  it('exportMyData: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(exportMyData()).rejects.toThrow('boom');
  });
});
