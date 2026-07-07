import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useDiscussionStore } from './discussion-store';
import { discussionService, type Discussion } from '@/lib/api/discussion-service';

vi.mock('@/lib/api/discussion-service', () => ({
  discussionService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    togglePin: vi.fn(),
    toggleLock: vi.fn(),
  },
}));

const sampleDiscussion: Discussion = {
  id: 1,
  title: 'Hello',
  body: null,
  category: 'GENERAL',
  state: 'OPEN',
  authorId: 5,
  authorName: 'Alice',
  authorInitials: 'AL',
  authorAvatarUrl: null,
  replyCount: 0,
  reactionCount: 0,
  isPinned: false,
  isLocked: false,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('discussion-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useDiscussionStore.setState({ discussions: [], loading: false, error: null });
    });
  });

  it('fetchDiscussions loads discussions with optional category', async () => {
    vi.mocked(discussionService.list).mockResolvedValue([sampleDiscussion]);

    await act(async () => {
      await useDiscussionStore.getState().fetchDiscussions('ws', 'IDEA');
    });

    expect(discussionService.list).toHaveBeenCalledWith('ws', 'IDEA');
    expect(useDiscussionStore.getState().discussions).toEqual([sampleDiscussion]);
    expect(useDiscussionStore.getState().loading).toBe(false);
    expect(useDiscussionStore.getState().error).toBeNull();
  });

  it('fetchDiscussions sets error on failure', async () => {
    vi.mocked(discussionService.list).mockRejectedValue(new Error('boom'));

    await act(async () => {
      await useDiscussionStore.getState().fetchDiscussions('ws');
    });

    expect(useDiscussionStore.getState().error).toBe('Impossible de charger les discussions');
    expect(useDiscussionStore.getState().loading).toBe(false);
  });

  it('createDiscussion prepends the new discussion', async () => {
    vi.mocked(discussionService.create).mockResolvedValue(sampleDiscussion);

    let returned: Discussion | undefined;
    await act(async () => {
      returned = await useDiscussionStore.getState().createDiscussion('ws', { title: 'Hello' });
    });

    expect(discussionService.create).toHaveBeenCalledWith('ws', { title: 'Hello' });
    expect(returned).toEqual(sampleDiscussion);
    expect(useDiscussionStore.getState().discussions[0]).toEqual(sampleDiscussion);
  });

  it('updateDiscussion replaces the matching discussion', async () => {
    const updated: Discussion = { ...sampleDiscussion, title: 'Updated' };
    vi.mocked(discussionService.update).mockResolvedValue(updated);
    act(() => {
      useDiscussionStore.setState({ discussions: [sampleDiscussion] });
    });

    await act(async () => {
      await useDiscussionStore.getState().updateDiscussion('ws', 1, { title: 'Updated' });
    });

    expect(discussionService.update).toHaveBeenCalledWith('ws', 1, { title: 'Updated' });
    expect(useDiscussionStore.getState().discussions[0].title).toBe('Updated');
  });

  it('deleteDiscussion removes the discussion', async () => {
    vi.mocked(discussionService.delete).mockResolvedValue(undefined);
    act(() => {
      useDiscussionStore.setState({ discussions: [sampleDiscussion] });
    });

    await act(async () => {
      await useDiscussionStore.getState().deleteDiscussion('ws', 1);
    });

    expect(discussionService.delete).toHaveBeenCalledWith('ws', 1);
    expect(useDiscussionStore.getState().discussions).toHaveLength(0);
  });

  it('togglePin replaces the discussion with the returned one', async () => {
    const pinned: Discussion = { ...sampleDiscussion, isPinned: true };
    vi.mocked(discussionService.togglePin).mockResolvedValue(pinned);
    act(() => {
      useDiscussionStore.setState({ discussions: [sampleDiscussion] });
    });

    await act(async () => {
      await useDiscussionStore.getState().togglePin('ws', 1);
    });

    expect(discussionService.togglePin).toHaveBeenCalledWith('ws', 1);
    expect(useDiscussionStore.getState().discussions[0].isPinned).toBe(true);
  });

  it('toggleLock replaces the discussion with the returned one', async () => {
    const locked: Discussion = { ...sampleDiscussion, isLocked: true };
    vi.mocked(discussionService.toggleLock).mockResolvedValue(locked);
    act(() => {
      useDiscussionStore.setState({ discussions: [sampleDiscussion] });
    });

    await act(async () => {
      await useDiscussionStore.getState().toggleLock('ws', 1);
    });

    expect(discussionService.toggleLock).toHaveBeenCalledWith('ws', 1);
    expect(useDiscussionStore.getState().discussions[0].isLocked).toBe(true);
  });
});
