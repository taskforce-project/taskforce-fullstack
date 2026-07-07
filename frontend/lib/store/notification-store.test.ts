import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationStore, type Signal } from './notification-store';
import type { NotificationResponse } from '../api/notification-service';
import * as svc from '../api/notification-service';

vi.mock('../api/notification-service', () => ({
  listNotifications: vi.fn(),
  countUnread: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  acknowledge: vi.fn(),
  acknowledgeAll: vi.fn(),
}));

function makeNotif(overrides: Partial<NotificationResponse> = {}): NotificationResponse {
  return {
    id: 1,
    type: 'mention',
    urgency: 'info',
    read: false,
    acknowledged: false,
    actor: { id: 3, name: 'Alice', initials: 'AL', avatarUrl: null },
    title: 'Titre',
    body: null,
    issueIdentifier: 'TF-1',
    issueUrl: '/issue/1',
    projectName: 'Proj',
    projectUrl: '/proj',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Un signal minimal directement dans le store (déjà converti). */
function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: '1',
    type: 'mention',
    urgency: 'info',
    read: false,
    acknowledged: false,
    operation: 'Proj',
    operationUrl: '/proj',
    title: 'Titre',
    issueId: 'TF-1',
    issueUrl: '/issue/1',
    timestamp: 'just now',
    ...overrides,
  };
}

describe('notification-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useNotificationStore.setState({ signals: [], unreadCount: 0, isLoading: false });
    });
  });

  it('fetchNotifications converts, sorts by urgency and counts unread', async () => {
    vi.mocked(svc.listNotifications).mockResolvedValue([
      makeNotif({ id: 1, urgency: 'low', read: true }),
      makeNotif({ id: 2, urgency: 'critical', read: false }),
      makeNotif({ id: 3, urgency: 'warning', read: false }),
    ]);

    await act(async () => {
      await useNotificationStore.getState().fetchNotifications('acme');
    });

    expect(svc.listNotifications).toHaveBeenCalledWith('acme');
    const signals = useNotificationStore.getState().signals;
    expect(signals.map((s) => s.urgency)).toEqual(['critical', 'warning', 'low']);
    expect(useNotificationStore.getState().unreadCount).toBe(2);
    expect(useNotificationStore.getState().isLoading).toBe(false);
  });

  it('fetchNotifications stops loading on failure', async () => {
    vi.mocked(svc.listNotifications).mockRejectedValue(new Error('x'));

    await act(async () => {
      await useNotificationStore.getState().fetchNotifications('acme');
    });

    expect(useNotificationStore.getState().isLoading).toBe(false);
    expect(useNotificationStore.getState().signals).toEqual([]);
  });

  it('pushSignal inserts an unread signal and increments unreadCount', () => {
    act(() => useNotificationStore.getState().pushSignal(makeNotif({ id: 10, read: false })));

    expect(useNotificationStore.getState().signals.map((s) => s.id)).toEqual(['10']);
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it('pushSignal does not increment unreadCount for a read signal', () => {
    act(() => useNotificationStore.getState().pushSignal(makeNotif({ id: 10, read: true })));

    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('pushSignal dedupes by id', () => {
    act(() => useNotificationStore.getState().pushSignal(makeNotif({ id: 10, read: false })));
    act(() => useNotificationStore.getState().pushSignal(makeNotif({ id: 10, read: false })));

    expect(useNotificationStore.getState().signals).toHaveLength(1);
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it('fetchUnreadCount sets the count', async () => {
    vi.mocked(svc.countUnread).mockResolvedValue(7);

    await act(async () => {
      await useNotificationStore.getState().fetchUnreadCount('acme');
    });

    expect(svc.countUnread).toHaveBeenCalledWith('acme');
    expect(useNotificationStore.getState().unreadCount).toBe(7);
  });

  it('fetchUnreadCount is silent on failure', async () => {
    act(() => useNotificationStore.setState({ unreadCount: 3 }));
    vi.mocked(svc.countUnread).mockRejectedValue(new Error('x'));

    await act(async () => {
      await useNotificationStore.getState().fetchUnreadCount('acme');
    });

    expect(useNotificationStore.getState().unreadCount).toBe(3);
  });

  it('markAsRead flips read optimistically and decrements unreadCount', async () => {
    act(() =>
      useNotificationStore.setState({
        signals: [makeSignal({ id: '1', read: false })],
        unreadCount: 1,
      }),
    );
    vi.mocked(svc.markAsRead).mockResolvedValue(makeNotif());

    await act(async () => {
      await useNotificationStore.getState().markAsRead('acme', '1');
    });

    expect(svc.markAsRead).toHaveBeenCalledWith('acme', 1);
    expect(useNotificationStore.getState().signals[0].read).toBe(true);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('markAsRead does not decrement when the signal was already read', async () => {
    act(() =>
      useNotificationStore.setState({
        signals: [makeSignal({ id: '1', read: true })],
        unreadCount: 0,
      }),
    );
    vi.mocked(svc.markAsRead).mockResolvedValue(makeNotif());

    await act(async () => {
      await useNotificationStore.getState().markAsRead('acme', '1');
    });

    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('markAllAsRead flips every signal and zeroes unreadCount', async () => {
    act(() =>
      useNotificationStore.setState({
        signals: [makeSignal({ id: '1', read: false }), makeSignal({ id: '2', read: false })],
        unreadCount: 2,
      }),
    );
    vi.mocked(svc.markAllAsRead).mockResolvedValue(undefined);

    await act(async () => {
      await useNotificationStore.getState().markAllAsRead('acme');
    });

    expect(svc.markAllAsRead).toHaveBeenCalledWith('acme');
    expect(useNotificationStore.getState().signals.every((s) => s.read)).toBe(true);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('acknowledge removes the signal and decrements unreadCount', async () => {
    act(() =>
      useNotificationStore.setState({
        signals: [makeSignal({ id: '1', read: false })],
        unreadCount: 1,
      }),
    );
    vi.mocked(svc.acknowledge).mockResolvedValue(makeNotif());

    await act(async () => {
      await useNotificationStore.getState().acknowledge('acme', '1');
    });

    expect(svc.acknowledge).toHaveBeenCalledWith('acme', 1);
    expect(useNotificationStore.getState().signals).toEqual([]);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('acknowledge resyncs via fetchNotifications on failure', async () => {
    act(() =>
      useNotificationStore.setState({
        signals: [makeSignal({ id: '1', read: false })],
        unreadCount: 1,
      }),
    );
    vi.mocked(svc.acknowledge).mockRejectedValue(new Error('x'));
    vi.mocked(svc.listNotifications).mockResolvedValue([makeNotif({ id: 2, read: false })]);

    await act(async () => {
      await useNotificationStore.getState().acknowledge('acme', '1');
    });

    expect(svc.listNotifications).toHaveBeenCalledWith('acme');
    expect(useNotificationStore.getState().signals.map((s) => s.id)).toEqual(['2']);
  });

  it('acknowledgeAll acknowledges then refetches', async () => {
    vi.mocked(svc.acknowledgeAll).mockResolvedValue(undefined);
    vi.mocked(svc.listNotifications).mockResolvedValue([]);

    await act(async () => {
      await useNotificationStore.getState().acknowledgeAll('acme');
    });

    expect(svc.acknowledgeAll).toHaveBeenCalledWith('acme');
    expect(svc.listNotifications).toHaveBeenCalledWith('acme');
    expect(useNotificationStore.getState().signals).toEqual([]);
  });
});
