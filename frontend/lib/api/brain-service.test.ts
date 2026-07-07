import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getBrainOverview,
  listNodes,
  getNode,
  createNode,
  updateNode,
  deleteNode,
  uploadBrainFile,
  createEdge,
  deleteEdge,
  searchBrain,
} from './brain-service';
import { apiClient } from './client';
import { BRAIN_ROUTES } from '../config/api-routes';

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

const SLUG = 'acme';
const envelope = <T>(payload: T) => ({ data: { success: true, message: 'ok', data: payload } });

describe('brain-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBrainOverview', () => {
    it('GET la vue d’ensemble du brain', async () => {
      const overview = { brainId: 1, workspaceId: 2, totalNodes: 0, nodes: [], edges: [] } as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(overview));

      const result = await getBrainOverview(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(BRAIN_ROUTES.OVERVIEW(SLUG));
      expect(result).toEqual(overview);
    });

    it('propage l’erreur', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
      await expect(getBrainOverview(SLUG)).rejects.toThrow('boom');
    });
  });

  describe('listNodes', () => {
    it('GET les nodes sans params quand domain absent', async () => {
      const nodes = [{ id: 1, title: 'N1' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(nodes));

      const result = await listNodes(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(BRAIN_ROUTES.NODES(SLUG), { params: undefined });
      expect(result).toEqual(nodes);
    });

    it('GET les nodes filtrés par domain', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(envelope([]));

      await listNodes(SLUG, 'PRODUCT');

      expect(apiClient.get).toHaveBeenCalledWith(BRAIN_ROUTES.NODES(SLUG), { params: { domain: 'PRODUCT' } });
    });
  });

  describe('getNode', () => {
    it('GET un node par id', async () => {
      const node = { id: 5, title: 'N5' } as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(node));

      const result = await getNode(SLUG, 5);

      expect(apiClient.get).toHaveBeenCalledWith(BRAIN_ROUTES.NODE(SLUG, 5));
      expect(result).toEqual(node);
    });
  });

  describe('createNode', () => {
    it('POST l’input de création', async () => {
      const input = { type: 'DOC', domain: 'PRODUCT', title: 'New' };
      const node = { id: 9, ...input } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(node));

      const result = await createNode(SLUG, input);

      expect(apiClient.post).toHaveBeenCalledWith(BRAIN_ROUTES.NODES(SLUG), input);
      expect(result).toEqual(node);
    });
  });

  describe('updateNode', () => {
    it('PATCH l’input de mise à jour', async () => {
      const input = { title: 'Renamed' };
      const node = { id: 5, title: 'Renamed' } as any;
      vi.mocked(apiClient.patch).mockResolvedValue(envelope(node));

      const result = await updateNode(SLUG, 5, input);

      expect(apiClient.patch).toHaveBeenCalledWith(BRAIN_ROUTES.NODE(SLUG, 5), input);
      expect(result).toEqual(node);
    });
  });

  describe('deleteNode', () => {
    it('DELETE un node', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteNode(SLUG, 5);

      expect(apiClient.delete).toHaveBeenCalledWith(BRAIN_ROUTES.NODE(SLUG, 5));
    });
  });

  describe('uploadBrainFile', () => {
    it('POST FormData avec header multipart et préfixe l’URL relative', async () => {
      const uploaded = { url: '/api/files/brain/x.png', filename: 'x.png', contentType: 'image/png', size: 10, image: true };
      vi.mocked(apiClient.post).mockResolvedValue(envelope(uploaded));

      const file = new File(['abc'], 'x.png', { type: 'image/png' });
      const result = await uploadBrainFile(SLUG, file);

      expect(apiClient.post).toHaveBeenCalledTimes(1);
      const call = vi.mocked(apiClient.post).mock.calls[0];
      expect(call[0]).toBe(BRAIN_ROUTES.FILES(SLUG));
      expect(call[1]).toBeInstanceOf(FormData);
      expect((call[1] as FormData).get('file')).toBe(file);
      expect(call[2]).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });

      const base = process.env.NEXT_PUBLIC_API_URL ?? '';
      expect(result.url).toBe(`${base}/api/files/brain/x.png`);
      expect(result.filename).toBe('x.png');
    });

    it('conserve une URL déjà absolue', async () => {
      const uploaded = { url: 'https://cdn/x.png', filename: 'x.png', contentType: 'image/png', size: 10, image: true };
      vi.mocked(apiClient.post).mockResolvedValue(envelope(uploaded));

      const file = new File(['abc'], 'x.png', { type: 'image/png' });
      const result = await uploadBrainFile(SLUG, file);

      expect(result.url).toBe('https://cdn/x.png');
    });
  });

  describe('createEdge', () => {
    it('POST le corps { fromNodeId, toNodeId, relationType, weight }', async () => {
      const edge = { id: 1, fromNodeId: 1, toNodeId: 2, relationType: 'RELATES_TO', weight: 0.5, auto: false };
      vi.mocked(apiClient.post).mockResolvedValue(envelope(edge));

      const result = await createEdge(SLUG, 1, 2, 'RELATES_TO', 0.5);

      expect(apiClient.post).toHaveBeenCalledWith(BRAIN_ROUTES.EDGES(SLUG), {
        fromNodeId: 1,
        toNodeId: 2,
        relationType: 'RELATES_TO',
        weight: 0.5,
      });
      expect(result).toEqual(edge);
    });

    it('envoie weight undefined quand omis', async () => {
      vi.mocked(apiClient.post).mockResolvedValue(envelope({} as any));

      await createEdge(SLUG, 1, 2, 'BLOCKS');

      expect(apiClient.post).toHaveBeenCalledWith(BRAIN_ROUTES.EDGES(SLUG), {
        fromNodeId: 1,
        toNodeId: 2,
        relationType: 'BLOCKS',
        weight: undefined,
      });
    });
  });

  describe('deleteEdge', () => {
    it('DELETE une arête', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteEdge(SLUG, 3);

      expect(apiClient.delete).toHaveBeenCalledWith(BRAIN_ROUTES.EDGE(SLUG, 3));
    });
  });

  describe('searchBrain', () => {
    it('POST { query, topK, domain } avec topK par défaut 8', async () => {
      const hits = [{ node: { id: 1 }, score: 0.9 }] as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(hits));

      const result = await searchBrain(SLUG, 'hello');

      expect(apiClient.post).toHaveBeenCalledWith(BRAIN_ROUTES.SEARCH(SLUG), {
        query: 'hello',
        topK: 8,
        domain: undefined,
      });
      expect(result).toEqual(hits);
    });

    it('respecte topK et domain personnalisés', async () => {
      vi.mocked(apiClient.post).mockResolvedValue(envelope([]));

      await searchBrain(SLUG, 'hello', 3, 'PRODUCT');

      expect(apiClient.post).toHaveBeenCalledWith(BRAIN_ROUTES.SEARCH(SLUG), {
        query: 'hello',
        topK: 3,
        domain: 'PRODUCT',
      });
    });
  });
});
