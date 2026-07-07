import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useProfileStore } from './profile-store';
import * as svc from '../api/profile-service';
import type { ProfileData } from '../api/profile-service';

vi.mock('../api/profile-service', () => ({
  getProfile: vi.fn(),
}));

const sampleData: ProfileData = {
  stats: {
    issuesCreated: 5,
    issuesClosed: 3,
    cyclesCompleted: 1,
    daysActive: 10,
    teammateCount: 4,
  },
  activity: [
    {
      id: 1,
      type: 'issue_created',
      issueTitle: 'Fix bug',
      issueIdentifier: 'TF-1',
      projectName: 'Core',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  heatmap: [{ date: '2026-01-01', count: 2 }],
};

describe('profile-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useProfileStore.setState({ stats: null, activity: [], heatmap: [], loading: false, error: null });
    });
  });

  it('fetchProfile loads stats/activity and builds the heatmap grid', async () => {
    vi.mocked(svc.getProfile).mockResolvedValue(sampleData);

    await act(async () => {
      await useProfileStore.getState().fetchProfile('ws');
    });

    expect(svc.getProfile).toHaveBeenCalledWith('ws');
    const state = useProfileStore.getState();
    expect(state.stats).toEqual(sampleData.stats);
    expect(state.activity).toEqual(sampleData.activity);
    // Grille 20 semaines × 7 jours
    expect(state.heatmap).toHaveLength(20);
    expect(state.heatmap[0].days).toHaveLength(7);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('fetchProfile sets error on failure', async () => {
    vi.mocked(svc.getProfile).mockRejectedValue(new Error('boom'));

    await act(async () => {
      await useProfileStore.getState().fetchProfile('ws');
    });

    expect(useProfileStore.getState().loading).toBe(false);
    expect(useProfileStore.getState().error).toBe('Impossible de charger le profil');
  });
});
