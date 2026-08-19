import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useSkillStore } from './skill-store';
import * as svc from '../api/skill-service';
import type { MemberSkillProfile } from '../api/skill-service';

vi.mock('../api/skill-service', () => ({
  getMemberSkills: vi.fn(),
  updateMemberSkills: vi.fn(),
}));

const sampleProfile: MemberSkillProfile = {
  userId: 100,
  skills: ['java', 'react'],
  profileText: null,
  capacityHoursPerWeek: null,
  seniority: 'MID',
  growthEnabled: false,
  growthTargetSkills: [],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('skill-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useSkillStore.setState({ profilesByUser: {} });
    });
  });

  it('fetchMemberSkills stores the profile under the userId and returns it', async () => {
    vi.mocked(svc.getMemberSkills).mockResolvedValue(sampleProfile);

    let returned: MemberSkillProfile | undefined;
    await act(async () => {
      returned = await useSkillStore.getState().fetchMemberSkills('ws', 100);
    });

    expect(svc.getMemberSkills).toHaveBeenCalledWith('ws', 100);
    expect(returned).toEqual(sampleProfile);
    expect(useSkillStore.getState().profilesByUser[100]).toEqual(sampleProfile);
  });

  it('saveMemberSkills upserts the profile and returns it', async () => {
    const updated: MemberSkillProfile = { ...sampleProfile, skills: ['go'] };
    vi.mocked(svc.updateMemberSkills).mockResolvedValue(updated);

    let returned: MemberSkillProfile | undefined;
    await act(async () => {
      returned = await useSkillStore.getState().saveMemberSkills('ws', 100, { skills: ['go'] });
    });

    expect(svc.updateMemberSkills).toHaveBeenCalledWith('ws', 100, { skills: ['go'] });
    expect(returned).toEqual(updated);
    expect(useSkillStore.getState().profilesByUser[100]).toEqual(updated);
  });
});
