import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useLabelStore } from './label-store';
import * as svc from '../api/label-service';
import type { ProjectLabel } from '../api/label-service';

vi.mock('../api/label-service', () => ({
  listLabels: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
}));

const sampleLabel: ProjectLabel = {
  id: 1,
  name: 'Bug',
  color: '#f00',
  description: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('label-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      useLabelStore.setState({ labelsByProject: {} });
    });
  });

  it('fetchLabels stores labels under the projectId', async () => {
    vi.mocked(svc.listLabels).mockResolvedValue([sampleLabel]);

    await act(async () => {
      await useLabelStore.getState().fetchLabels('ws', 7);
    });

    expect(svc.listLabels).toHaveBeenCalledWith('ws', 7);
    expect(useLabelStore.getState().labelsByProject[7]).toEqual([sampleLabel]);
  });

  it('addLabel appends the created label and returns it', async () => {
    vi.mocked(svc.createLabel).mockResolvedValue(sampleLabel);

    let returned: ProjectLabel | undefined;
    await act(async () => {
      returned = await useLabelStore.getState().addLabel('ws', 7, { name: 'Bug' });
    });

    expect(svc.createLabel).toHaveBeenCalledWith('ws', 7, { name: 'Bug' });
    expect(returned).toEqual(sampleLabel);
    expect(useLabelStore.getState().labelsByProject[7]).toEqual([sampleLabel]);
  });

  it('editLabel replaces the matching label and returns it', async () => {
    const updated: ProjectLabel = { ...sampleLabel, name: 'Feature' };
    vi.mocked(svc.updateLabel).mockResolvedValue(updated);
    act(() => {
      useLabelStore.setState({ labelsByProject: { 7: [sampleLabel] } });
    });

    let returned: ProjectLabel | undefined;
    await act(async () => {
      returned = await useLabelStore.getState().editLabel('ws', 7, 1, { name: 'Feature' });
    });

    expect(svc.updateLabel).toHaveBeenCalledWith('ws', 7, 1, { name: 'Feature' });
    expect(returned).toEqual(updated);
    expect(useLabelStore.getState().labelsByProject[7][0].name).toBe('Feature');
  });

  it('removeLabel deletes the label from the project bucket', async () => {
    vi.mocked(svc.deleteLabel).mockResolvedValue(undefined);
    act(() => {
      useLabelStore.setState({ labelsByProject: { 7: [sampleLabel] } });
    });

    await act(async () => {
      await useLabelStore.getState().removeLabel('ws', 7, 1);
    });

    expect(svc.deleteLabel).toHaveBeenCalledWith('ws', 7, 1);
    expect(useLabelStore.getState().labelsByProject[7]).toHaveLength(0);
  });
});
