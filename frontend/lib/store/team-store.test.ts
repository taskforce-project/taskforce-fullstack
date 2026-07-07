import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useTeamStore } from './team-store';
import { teamService, type Team, type TeamMember } from '@/lib/api/team-service';

vi.mock('@/lib/api/team-service', () => ({
  teamService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listMembers: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
  },
}));

const sampleMember: TeamMember = {
  id: 10,
  userId: 100,
  displayName: 'Alice',
  initials: 'AL',
  avatarUrl: null,
  role: 'MEMBER',
  joinedAt: '2026-01-01T00:00:00.000Z',
};

const sampleTeam: Team = {
  id: 1,
  name: 'Core',
  description: null,
  emoji: '🚀',
  color: '#fff',
  members: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('team-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useTeamStore.setState({ teams: [], loading: false, error: null });
    });
  });

  it('fetchTeams loads teams', async () => {
    vi.mocked(teamService.list).mockResolvedValue([sampleTeam]);

    await act(async () => {
      await useTeamStore.getState().fetchTeams('ws');
    });

    expect(teamService.list).toHaveBeenCalledWith('ws');
    expect(useTeamStore.getState().teams).toEqual([sampleTeam]);
    expect(useTeamStore.getState().loading).toBe(false);
    expect(useTeamStore.getState().error).toBeNull();
  });

  it('fetchTeams sets error on failure', async () => {
    vi.mocked(teamService.list).mockRejectedValue(new Error('boom'));

    await act(async () => {
      await useTeamStore.getState().fetchTeams('ws');
    });

    expect(useTeamStore.getState().error).toBe('Impossible de charger les équipes');
    expect(useTeamStore.getState().loading).toBe(false);
  });

  it('createTeam prepends the new team', async () => {
    vi.mocked(teamService.create).mockResolvedValue(sampleTeam);

    let returned: Team | undefined;
    await act(async () => {
      returned = await useTeamStore.getState().createTeam('ws', { name: 'Core' });
    });

    expect(teamService.create).toHaveBeenCalledWith('ws', { name: 'Core' });
    expect(returned).toEqual(sampleTeam);
    expect(useTeamStore.getState().teams[0]).toEqual(sampleTeam);
  });

  it('updateTeam replaces the matching team', async () => {
    const updated: Team = { ...sampleTeam, name: 'Renamed' };
    vi.mocked(teamService.update).mockResolvedValue(updated);
    act(() => {
      useTeamStore.setState({ teams: [sampleTeam] });
    });

    await act(async () => {
      await useTeamStore.getState().updateTeam('ws', 1, { name: 'Renamed' });
    });

    expect(teamService.update).toHaveBeenCalledWith('ws', 1, { name: 'Renamed' });
    expect(useTeamStore.getState().teams[0].name).toBe('Renamed');
  });

  it('deleteTeam removes the team', async () => {
    vi.mocked(teamService.delete).mockResolvedValue(undefined);
    act(() => {
      useTeamStore.setState({ teams: [sampleTeam] });
    });

    await act(async () => {
      await useTeamStore.getState().deleteTeam('ws', 1);
    });

    expect(teamService.delete).toHaveBeenCalledWith('ws', 1);
    expect(useTeamStore.getState().teams).toHaveLength(0);
  });

  it('addMember appends a member to the target team', async () => {
    vi.mocked(teamService.addMember).mockResolvedValue(sampleMember);
    act(() => {
      useTeamStore.setState({ teams: [sampleTeam] });
    });

    let returned: TeamMember | undefined;
    await act(async () => {
      returned = await useTeamStore.getState().addMember('ws', 1, { userId: 100 });
    });

    expect(teamService.addMember).toHaveBeenCalledWith('ws', 1, { userId: 100 });
    expect(returned).toEqual(sampleMember);
    expect(useTeamStore.getState().teams[0].members).toEqual([sampleMember]);
  });

  it('removeMember removes a member from the target team', async () => {
    vi.mocked(teamService.removeMember).mockResolvedValue(undefined);
    act(() => {
      useTeamStore.setState({ teams: [{ ...sampleTeam, members: [sampleMember] }] });
    });

    await act(async () => {
      await useTeamStore.getState().removeMember('ws', 1, 100);
    });

    expect(teamService.removeMember).toHaveBeenCalledWith('ws', 1, 100);
    expect(useTeamStore.getState().teams[0].members).toHaveLength(0);
  });
});
