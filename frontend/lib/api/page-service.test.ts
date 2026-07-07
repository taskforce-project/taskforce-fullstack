import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pageService } from './page-service';
import { apiClient } from './client';
import { PAGE_ROUTES } from '../config/api-routes';

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

describe('pageService', () => {
  const slug = 'acme';
  const projectId = '42';
  const pageId = '7';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list: GET list route and returns pages', async () => {
    const pages = [{ id: 1, title: 'Page' }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(pages));

    const result = await pageService.list(slug, projectId);

    expect(apiClient.get).toHaveBeenCalledWith(PAGE_ROUTES.LIST(slug, projectId));
    expect(result).toEqual(pages);
  });

  it('get: GET route and returns page detail', async () => {
    const page = { id: 7, title: 'Page', content: 'body' };
    vi.mocked(apiClient.get).mockResolvedValue(envelope(page));

    const result = await pageService.get(slug, projectId, pageId);

    expect(apiClient.get).toHaveBeenCalledWith(PAGE_ROUTES.GET(slug, projectId, pageId));
    expect(result).toEqual(page);
  });

  it('create: POST create route with payload and returns page', async () => {
    const payload = { title: 'New', content: 'c' };
    const created = { id: 8, title: 'New' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(created));

    const result = await pageService.create(slug, projectId, payload);

    expect(apiClient.post).toHaveBeenCalledWith(PAGE_ROUTES.CREATE(slug, projectId), payload);
    expect(result).toEqual(created);
  });

  it('update: PATCH update route with payload and returns page', async () => {
    const payload = { title: 'Renamed' };
    const updated = { id: 7, title: 'Renamed' };
    vi.mocked(apiClient.patch).mockResolvedValue(envelope(updated));

    const result = await pageService.update(slug, projectId, pageId, payload);

    expect(apiClient.patch).toHaveBeenCalledWith(PAGE_ROUTES.UPDATE(slug, projectId, pageId), payload);
    expect(result).toEqual(updated);
  });

  it('delete: DELETE route', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(undefined));

    await pageService.delete(slug, projectId, pageId);

    expect(apiClient.delete).toHaveBeenCalledWith(PAGE_ROUTES.DELETE(slug, projectId, pageId));
  });

  it('list: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(pageService.list(slug, projectId)).rejects.toThrow('boom');
  });
});
