import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useAvailabilityStore } from './availability-store';
import * as svc from '../api/availability-service';
import type { MemberLeave } from '../api/availability-service';

vi.mock('../api/availability-service', () => ({
  listLeaves: vi.fn(),
  createLeave: vi.fn(),
  deleteLeave: vi.fn(),
}));

const leaveA: MemberLeave = {
  id: 1,
  userId: 100,
  type: 'VACATION',
  startDate: '2026-01-10',
  endDate: '2026-01-12',
  note: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const leaveB: MemberLeave = {
  id: 2,
  userId: 100,
  type: 'SICK',
  startDate: '2026-03-01',
  endDate: '2026-03-02',
  note: null,
  createdAt: '2026-02-01T00:00:00.000Z',
};

describe('availability-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useAvailabilityStore.setState({ leavesByUser: {} });
    });
  });

  it('fetchLeaves stores leaves sorted by startDate desc and returns them', async () => {
    vi.mocked(svc.listLeaves).mockResolvedValue([leaveA, leaveB]);

    let returned: MemberLeave[] | undefined;
    await act(async () => {
      returned = await useAvailabilityStore.getState().fetchLeaves('ws', 100);
    });

    expect(svc.listLeaves).toHaveBeenCalledWith('ws', 100);
    // Le plus récent (leaveB, mars) doit passer devant leaveA (janvier)
    expect(useAvailabilityStore.getState().leavesByUser[100]).toEqual([leaveB, leaveA]);
    expect(returned).toEqual([leaveB, leaveA]);
  });

  it('addLeave inserts and keeps the list sorted, returning the created leave', async () => {
    vi.mocked(svc.createLeave).mockResolvedValue(leaveB);
    act(() => {
      useAvailabilityStore.setState({ leavesByUser: { 100: [leaveA] } });
    });

    let returned: MemberLeave | undefined;
    await act(async () => {
      returned = await useAvailabilityStore
        .getState()
        .addLeave('ws', 100, { type: 'SICK', startDate: '2026-03-01', endDate: '2026-03-02' });
    });

    expect(svc.createLeave).toHaveBeenCalledWith('ws', 100, {
      type: 'SICK',
      startDate: '2026-03-01',
      endDate: '2026-03-02',
    });
    expect(returned).toEqual(leaveB);
    expect(useAvailabilityStore.getState().leavesByUser[100]).toEqual([leaveB, leaveA]);
  });

  it('removeLeave deletes the leave from the user bucket', async () => {
    vi.mocked(svc.deleteLeave).mockResolvedValue(undefined);
    act(() => {
      useAvailabilityStore.setState({ leavesByUser: { 100: [leaveA, leaveB] } });
    });

    await act(async () => {
      await useAvailabilityStore.getState().removeLeave('ws', 100, 1);
    });

    expect(svc.deleteLeave).toHaveBeenCalledWith('ws', 100, 1);
    expect(useAvailabilityStore.getState().leavesByUser[100]).toEqual([leaveB]);
  });
});
