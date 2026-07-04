import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { usePageStore } from './page-store';
import { pageService, type PageDetail, type PageSummary } from '@/lib/api/page-service';

vi.mock('@/lib/api/page-service', () => ({
  pageService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const sampleSummary: PageSummary = {
  id: 1,
  title: 'Doc',
  emoji: '📄',
  excerpt: 'excerpt',
  createdByName: 'Alice',
  createdByInitials: 'AL',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleDetail: PageDetail = { ...sampleSummary, content: 'body' };

describe('page-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      usePageStore.setState({ pages: [], currentPage: null, loading: false, error: null });
    });
  });

  it('fetchPages loads pages and clears loading', async () => {
    vi.mocked(pageService.list).mockResolvedValue([sampleSummary]);

    await act(async () => {
      await usePageStore.getState().fetchPages('ws', 'proj1');
    });

    expect(pageService.list).toHaveBeenCalledWith('ws', 'proj1');
    expect(usePageStore.getState().pages).toEqual([sampleSummary]);
    expect(usePageStore.getState().loading).toBe(false);
    expect(usePageStore.getState().error).toBeNull();
  });

  it('fetchPages sets error on failure', async () => {
    vi.mocked(pageService.list).mockRejectedValue(new Error('boom'));

    await act(async () => {
      await usePageStore.getState().fetchPages('ws', 'proj1');
    });

    expect(usePageStore.getState().loading).toBe(false);
    expect(usePageStore.getState().error).toBe('Impossible de charger les pages');
  });

  it('fetchPage loads the current page', async () => {
    vi.mocked(pageService.get).mockResolvedValue(sampleDetail);

    await act(async () => {
      await usePageStore.getState().fetchPage('ws', 'proj1', '1');
    });

    expect(pageService.get).toHaveBeenCalledWith('ws', 'proj1', '1');
    expect(usePageStore.getState().currentPage).toEqual(sampleDetail);
    expect(usePageStore.getState().loading).toBe(false);
  });

  it('fetchPage sets error on failure', async () => {
    vi.mocked(pageService.get).mockRejectedValue(new Error('boom'));

    await act(async () => {
      await usePageStore.getState().fetchPage('ws', 'proj1', '1');
    });

    expect(usePageStore.getState().error).toBe('Impossible de charger la page');
    expect(usePageStore.getState().loading).toBe(false);
  });

  it('createPage prepends a summary and returns the detail', async () => {
    vi.mocked(pageService.create).mockResolvedValue(sampleDetail);

    let returned: PageDetail | undefined;
    await act(async () => {
      returned = await usePageStore.getState().createPage('ws', 'proj1', { title: 'Doc' });
    });

    expect(pageService.create).toHaveBeenCalledWith('ws', 'proj1', { title: 'Doc' });
    expect(returned).toEqual(sampleDetail);
    expect(usePageStore.getState().pages[0]).toEqual(sampleSummary);
  });

  it('updatePage updates the matching summary and current page', async () => {
    const updated: PageDetail = { ...sampleDetail, title: 'Updated', updatedAt: '2026-02-02T00:00:00.000Z' };
    vi.mocked(pageService.update).mockResolvedValue(updated);
    act(() => {
      usePageStore.setState({ pages: [sampleSummary], currentPage: sampleDetail });
    });

    await act(async () => {
      await usePageStore.getState().updatePage('ws', 'proj1', '1', { title: 'Updated' });
    });

    expect(pageService.update).toHaveBeenCalledWith('ws', 'proj1', '1', { title: 'Updated' });
    expect(usePageStore.getState().pages[0].title).toBe('Updated');
    expect(usePageStore.getState().currentPage?.title).toBe('Updated');
  });

  it('deletePage removes the page and clears current page when matching', async () => {
    vi.mocked(pageService.delete).mockResolvedValue(undefined);
    act(() => {
      usePageStore.setState({ pages: [sampleSummary], currentPage: sampleDetail });
    });

    await act(async () => {
      await usePageStore.getState().deletePage('ws', 'proj1', '1');
    });

    expect(pageService.delete).toHaveBeenCalledWith('ws', 'proj1', '1');
    expect(usePageStore.getState().pages).toHaveLength(0);
    expect(usePageStore.getState().currentPage).toBeNull();
  });

  it('clearCurrentPage resets currentPage', () => {
    act(() => {
      usePageStore.setState({ currentPage: sampleDetail });
      usePageStore.getState().clearCurrentPage();
    });
    expect(usePageStore.getState().currentPage).toBeNull();
  });
});
