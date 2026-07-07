import { describe, it, expect, beforeEach, vi } from 'vitest';
import { listLabels, createLabel, updateLabel, deleteLabel } from './label-service';
import { apiClient } from './client';
import { PROJECT_ROUTES } from '../config/api-routes';

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

describe('label-service', () => {
  const slug = 'acme';
  const projectId = 42;
  const labelId = 3;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listLabels: GET labels route and returns labels', async () => {
    const labels = [{ id: 1, name: 'bug', color: '#f00' }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(labels));

    const result = await listLabels(slug, projectId);

    expect(apiClient.get).toHaveBeenCalledWith(PROJECT_ROUTES.LABELS(slug, projectId));
    expect(result).toEqual(labels);
  });

  it('createLabel: POST labels route with payload and returns label', async () => {
    const payload = { name: 'feature', color: '#0f0' };
    const created = { id: 2, name: 'feature' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(created));

    const result = await createLabel(slug, projectId, payload);

    expect(apiClient.post).toHaveBeenCalledWith(PROJECT_ROUTES.LABELS(slug, projectId), payload);
    expect(result).toEqual(created);
  });

  it('updateLabel: PUT label route with payload and returns label', async () => {
    const payload = { name: 'renamed' };
    const updated = { id: labelId, name: 'renamed' };
    vi.mocked(apiClient.put).mockResolvedValue(envelope(updated));

    const result = await updateLabel(slug, projectId, labelId, payload);

    expect(apiClient.put).toHaveBeenCalledWith(PROJECT_ROUTES.LABEL(slug, projectId, labelId), payload);
    expect(result).toEqual(updated);
  });

  it('deleteLabel: DELETE label route', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(undefined));

    await deleteLabel(slug, projectId, labelId);

    expect(apiClient.delete).toHaveBeenCalledWith(PROJECT_ROUTES.LABEL(slug, projectId, labelId));
  });

  it('listLabels: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(listLabels(slug, projectId)).rejects.toThrow('boom');
  });
});
