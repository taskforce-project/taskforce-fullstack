import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useUserStore } from './user-store';
import * as svc from '../api/user-service';
import type { AuthUser } from '../auth';

vi.mock('../api/user-service', () => ({
  getMe: vi.fn(),
  updateMe: vi.fn(),
}));

const sampleUser: AuthUser = {
  id: '1',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Example',
  displayName: 'Alice Example',
  planType: 'FREE',
};

describe('user-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useUserStore.setState({ user: null, isLoading: false });
    });
  });

  it('setUser stores the user', () => {
    act(() => {
      useUserStore.getState().setUser(sampleUser);
    });
    expect(useUserStore.getState().user).toEqual(sampleUser);
  });

  it('clearUser resets the user to null', () => {
    act(() => {
      useUserStore.setState({ user: sampleUser });
      useUserStore.getState().clearUser();
    });
    expect(useUserStore.getState().user).toBeNull();
  });

  it('fetchMe loads the current user and clears loading', async () => {
    vi.mocked(svc.getMe).mockResolvedValue(sampleUser);

    let returned: AuthUser | null | undefined;
    await act(async () => {
      returned = await useUserStore.getState().fetchMe();
    });

    expect(svc.getMe).toHaveBeenCalled();
    expect(returned).toEqual(sampleUser);
    expect(useUserStore.getState().user).toEqual(sampleUser);
    expect(useUserStore.getState().isLoading).toBe(false);
  });

  it('fetchMe returns null and clears loading on failure', async () => {
    vi.mocked(svc.getMe).mockRejectedValue(new Error('boom'));

    let returned: AuthUser | null | undefined;
    await act(async () => {
      returned = await useUserStore.getState().fetchMe();
    });

    expect(returned).toBeNull();
    expect(useUserStore.getState().isLoading).toBe(false);
  });

  it('updateProfile updates the user and returns it', async () => {
    const updated: AuthUser = { ...sampleUser, displayName: 'Alice Updated' };
    vi.mocked(svc.updateMe).mockResolvedValue(updated);

    let returned: AuthUser | null | undefined;
    await act(async () => {
      returned = await useUserStore.getState().updateProfile({ displayName: 'Alice Updated' });
    });

    expect(svc.updateMe).toHaveBeenCalledWith({ displayName: 'Alice Updated' });
    expect(returned).toEqual(updated);
    expect(useUserStore.getState().user).toEqual(updated);
    expect(useUserStore.getState().isLoading).toBe(false);
  });

  it('updateProfile rethrows and clears loading on failure', async () => {
    vi.mocked(svc.updateMe).mockRejectedValue(new Error('boom'));

    await act(async () => {
      await expect(useUserStore.getState().updateProfile({ displayName: 'x' })).rejects.toThrow('boom');
    });

    expect(useUserStore.getState().isLoading).toBe(false);
  });
});
