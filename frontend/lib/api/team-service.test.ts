import { describe, it, expect, beforeEach, vi } from 'vitest';
import { teamService } from './team-service';
import { apiClient } from './client';
import { TEAM_ROUTES } from '../config/api-routes';

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

describe('teamService', () => {
  const slug = 'acme';
  const teamId = 3;
  const userId = 9;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list: GET route and returns teams', async () => {
    const teams = [{ id: 1, name: 'Core' }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(teams));

    const result = await teamService.list(slug);

    expect(apiClient.get).toHaveBeenCalledWith(TEAM_ROUTES.LIST(slug));
    expect(result).toEqual(teams);
  });

  it('get: GET by-id route and returns team', async () => {
    const team = { id: teamId, name: 'Core' };
    vi.mocked(apiClient.get).mockResolvedValue(envelope(team));

    const result = await teamService.get(slug, teamId);

    expect(apiClient.get).toHaveBeenCalledWith(TEAM_ROUTES.BY_ID(slug, teamId));
    expect(result).toEqual(team);
  });

  it('create: POST route with payload and returns team', async () => {
    const payload = { name: 'New Team' };
    const created = { id: 5, name: 'New Team' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(created));

    const result = await teamService.create(slug, payload);

    expect(apiClient.post).toHaveBeenCalledWith(TEAM_ROUTES.CREATE(slug), payload);
    expect(result).toEqual(created);
  });

  it('update: PATCH route with payload and returns team', async () => {
    const payload = { name: 'Renamed' };
    const updated = { id: teamId, name: 'Renamed' };
    vi.mocked(apiClient.patch).mockResolvedValue(envelope(updated));

    const result = await teamService.update(slug, teamId, payload);

    expect(apiClient.patch).toHaveBeenCalledWith(TEAM_ROUTES.UPDATE(slug, teamId), payload);
    expect(result).toEqual(updated);
  });

  it('delete: DELETE route', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(undefined));

    await teamService.delete(slug, teamId);

    expect(apiClient.delete).toHaveBeenCalledWith(TEAM_ROUTES.DELETE(slug, teamId));
  });

  it('listMembers: GET members route and returns members', async () => {
    const members = [{ id: 1, userId: 2 }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(members));

    const result = await teamService.listMembers(slug, teamId);

    expect(apiClient.get).toHaveBeenCalledWith(TEAM_ROUTES.MEMBERS(slug, teamId));
    expect(result).toEqual(members);
  });

  it('addMember: POST add-member route with payload and returns member', async () => {
    const payload = { userId, role: 'MEMBER' as const };
    const member = { id: 1, userId };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(member));

    const result = await teamService.addMember(slug, teamId, payload);

    expect(apiClient.post).toHaveBeenCalledWith(TEAM_ROUTES.ADD_MEMBER(slug, teamId), payload);
    expect(result).toEqual(member);
  });

  it('removeMember: DELETE remove-member route', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(undefined));

    await teamService.removeMember(slug, teamId, userId);

    expect(apiClient.delete).toHaveBeenCalledWith(TEAM_ROUTES.REMOVE_MEMBER(slug, teamId, userId));
  });

  it('list: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(teamService.list(slug)).rejects.toThrow('boom');
  });
});
