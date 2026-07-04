import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listNotifications,
  countUnread,
  markAsRead,
  markAllAsRead,
  acknowledge,
  acknowledgeAll,
} from './notification-service';
import { apiClient } from './client';
import { NOTIFICATION_ROUTES } from '../config/api-routes';

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

describe('notification-service', () => {
  const slug = 'acme';
  const id = 12;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listNotifications: GET list route and returns notifications', async () => {
    const notifs = [{ id: 1, title: 'hi' }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(notifs));

    const result = await listNotifications(slug);

    expect(apiClient.get).toHaveBeenCalledWith(NOTIFICATION_ROUTES.LIST(slug));
    expect(result).toEqual(notifs);
  });

  it('countUnread: GET unread-count route and returns count', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(envelope(7));

    const result = await countUnread(slug);

    expect(apiClient.get).toHaveBeenCalledWith(NOTIFICATION_ROUTES.UNREAD_COUNT(slug));
    expect(result).toBe(7);
  });

  it('markAsRead: PATCH mark-read route and returns notification', async () => {
    const notif = { id, read: true };
    vi.mocked(apiClient.patch).mockResolvedValue(envelope(notif));

    const result = await markAsRead(slug, id);

    expect(apiClient.patch).toHaveBeenCalledWith(NOTIFICATION_ROUTES.MARK_READ(slug, id));
    expect(result).toEqual(notif);
  });

  it('markAllAsRead: PATCH mark-all-read route', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(envelope(undefined));

    await markAllAsRead(slug);

    expect(apiClient.patch).toHaveBeenCalledWith(NOTIFICATION_ROUTES.MARK_ALL_READ(slug));
  });

  it('acknowledge: PATCH acknowledge route and returns notification', async () => {
    const notif = { id, acknowledged: true };
    vi.mocked(apiClient.patch).mockResolvedValue(envelope(notif));

    const result = await acknowledge(slug, id);

    expect(apiClient.patch).toHaveBeenCalledWith(NOTIFICATION_ROUTES.ACKNOWLEDGE(slug, id));
    expect(result).toEqual(notif);
  });

  it('acknowledgeAll: PATCH acknowledge-all route', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(envelope(undefined));

    await acknowledgeAll(slug);

    expect(apiClient.patch).toHaveBeenCalledWith(NOTIFICATION_ROUTES.ACKNOWLEDGE_ALL(slug));
  });

  it('countUnread: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(countUnread(slug)).rejects.toThrow('boom');
  });
});
