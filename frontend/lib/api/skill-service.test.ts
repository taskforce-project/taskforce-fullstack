import { describe, it, expect, beforeEach, vi } from 'vitest';
import { listSkillProfiles, getMemberSkills, updateMemberSkills } from './skill-service';
import { apiClient } from './client';
import { SKILL_ROUTES } from '../config/api-routes';

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

describe('skill-service', () => {
  const slug = 'acme';
  const userId = 9;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listSkillProfiles: GET list route and returns profiles', async () => {
    const profiles = [{ userId, skills: ['java'] }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(profiles));

    const result = await listSkillProfiles(slug);

    expect(apiClient.get).toHaveBeenCalledWith(SKILL_ROUTES.LIST(slug));
    expect(result).toEqual(profiles);
  });

  it('getMemberSkills: GET member route and returns profile', async () => {
    const profile = { userId, skills: ['react'] };
    vi.mocked(apiClient.get).mockResolvedValue(envelope(profile));

    const result = await getMemberSkills(slug, userId);

    expect(apiClient.get).toHaveBeenCalledWith(SKILL_ROUTES.MEMBER(slug, userId));
    expect(result).toEqual(profile);
  });

  it('updateMemberSkills: PUT member route with payload and returns profile', async () => {
    const payload = { skills: ['go', 'rust'], seniority: 'SENIOR' as const };
    const updated = { userId, skills: ['go', 'rust'] };
    vi.mocked(apiClient.put).mockResolvedValue(envelope(updated));

    const result = await updateMemberSkills(slug, userId, payload);

    expect(apiClient.put).toHaveBeenCalledWith(SKILL_ROUTES.MEMBER(slug, userId), payload);
    expect(result).toEqual(updated);
  });

  it('listSkillProfiles: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(listSkillProfiles(slug)).rejects.toThrow('boom');
  });
});
