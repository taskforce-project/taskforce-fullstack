import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useBrainStore } from './brain-store';
import * as svc from '../api/brain-service';
import type { BrainOverview, KnowledgeNode } from '../api/brain-service';

vi.mock('../api/brain-service', () => ({
  getBrainOverview: vi.fn(),
  createNode: vi.fn(),
  updateNode: vi.fn(),
  deleteNode: vi.fn(),
  searchBrain: vi.fn(),
  createEdge: vi.fn(),
  deleteEdge: vi.fn(),
}));

const node = (id: number, title = `N${id}`): KnowledgeNode =>
  ({ id, uuid: `u${id}`, type: 'NOTE', domain: 'Produit', domainCode: 'PRD', title, content: null, contentUrl: null, status: 'ACTIVE', versionLabel: 'v1', refType: null, refId: null }) as KnowledgeNode;

const overview = (nodes: KnowledgeNode[]): BrainOverview =>
  ({ brainId: 1, workspaceId: 1, templateType: null, versionLabel: 'v1', totalNodes: nodes.length, nodesByDomain: {}, nodes, edges: [] }) as BrainOverview;

const reset = () =>
  act(() => {
    useBrainStore.setState({
      overview: null,
      loading: false,
      error: null,
      selectedNodeId: null,
      searchQuery: '',
      searchResults: null,
      searching: false,
    });
  });

describe('brain-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset();
  });

  describe('fetchOverview', () => {
    it('charge le graphe et retombe le drapeau de chargement', async () => {
      vi.mocked(svc.getBrainOverview).mockResolvedValue(overview([node(1)]));

      await act(async () => {
        await useBrainStore.getState().fetchOverview('ws');
      });

      expect(svc.getBrainOverview).toHaveBeenCalledWith('ws');
      expect(useBrainStore.getState().overview?.totalNodes).toBe(1);
      expect(useBrainStore.getState().loading).toBe(false);
      expect(useBrainStore.getState().error).toBeNull();
    });

    it('pose un message lisible en cas d’échec', async () => {
      vi.mocked(svc.getBrainOverview).mockRejectedValue(new Error('boom'));

      await act(async () => {
        await useBrainStore.getState().fetchOverview('ws');
      });

      expect(useBrainStore.getState().error).toBe('Impossible de charger le Brain OS');
      expect(useBrainStore.getState().loading).toBe(false);
    });
  });

  it('selectNode retient le nœud courant', () => {
    act(() => useBrainStore.getState().selectNode(7));
    expect(useBrainStore.getState().selectedNodeId).toBe(7);

    act(() => useBrainStore.getState().selectNode(null));
    expect(useBrainStore.getState().selectedNodeId).toBeNull();
  });

  it('addNode recharge le graphe et sélectionne le nœud créé', async () => {
    vi.mocked(svc.createNode).mockResolvedValue(node(9));
    vi.mocked(svc.getBrainOverview).mockResolvedValue(overview([node(9)]));

    let created: KnowledgeNode | undefined;
    await act(async () => {
      created = await useBrainStore.getState().addNode('ws', { type: 'NOTE', domain: 'Produit', title: 'N9' });
    });

    expect(created?.id).toBe(9);
    expect(svc.getBrainOverview).toHaveBeenCalledWith('ws');
    expect(useBrainStore.getState().selectedNodeId).toBe(9);
  });

  it('editNode recharge le graphe', async () => {
    vi.mocked(svc.updateNode).mockResolvedValue(node(1, 'renommé'));
    vi.mocked(svc.getBrainOverview).mockResolvedValue(overview([node(1, 'renommé')]));

    await act(async () => {
      await useBrainStore.getState().editNode('ws', 1, { title: 'renommé' });
    });

    expect(svc.updateNode).toHaveBeenCalledWith('ws', 1, { title: 'renommé' });
    expect(useBrainStore.getState().overview?.nodes[0].title).toBe('renommé');
  });

  describe('removeNode', () => {
    it('désélectionne le nœud supprimé s’il était actif', async () => {
      act(() => useBrainStore.setState({ selectedNodeId: 3 }));
      vi.mocked(svc.deleteNode).mockResolvedValue(undefined);
      vi.mocked(svc.getBrainOverview).mockResolvedValue(overview([]));

      await act(async () => {
        await useBrainStore.getState().removeNode('ws', 3);
      });

      expect(useBrainStore.getState().selectedNodeId).toBeNull();
    });

    it('conserve la sélection si un autre nœud est supprimé', async () => {
      act(() => useBrainStore.setState({ selectedNodeId: 3 }));
      vi.mocked(svc.deleteNode).mockResolvedValue(undefined);
      vi.mocked(svc.getBrainOverview).mockResolvedValue(overview([node(3)]));

      await act(async () => {
        await useBrainStore.getState().removeNode('ws', 8);
      });

      expect(useBrainStore.getState().selectedNodeId).toBe(3);
    });
  });

  describe('search', () => {
    it('renvoie les résultats et retombe le drapeau de recherche', async () => {
      vi.mocked(svc.searchBrain).mockResolvedValue([{ node: node(1), score: 0.9 }]);

      await act(async () => {
        await useBrainStore.getState().search('ws', 'archi');
      });

      expect(svc.searchBrain).toHaveBeenCalledWith('ws', 'archi');
      expect(useBrainStore.getState().searchResults).toHaveLength(1);
      expect(useBrainStore.getState().searchQuery).toBe('archi');
      expect(useBrainStore.getState().searching).toBe(false);
    });

    it('une requête vide ou blanche réinitialise sans appeler l’API', async () => {
      act(() => useBrainStore.setState({ searchQuery: 'ancien', searchResults: [] }));

      await act(async () => {
        await useBrainStore.getState().search('ws', '   ');
      });

      expect(svc.searchBrain).not.toHaveBeenCalled();
      expect(useBrainStore.getState().searchQuery).toBe('');
      expect(useBrainStore.getState().searchResults).toBeNull();
    });

    it('un échec donne une liste vide plutôt qu’un écran cassé', async () => {
      vi.mocked(svc.searchBrain).mockRejectedValue(new Error('pgvector down'));

      await act(async () => {
        await useBrainStore.getState().search('ws', 'archi');
      });

      expect(useBrainStore.getState().searchResults).toEqual([]);
      expect(useBrainStore.getState().searching).toBe(false);
      expect(useBrainStore.getState().error).toBe('Recherche indisponible');
    });
  });

  it('clearSearch remet la recherche à zéro', () => {
    act(() => useBrainStore.setState({ searchQuery: 'archi', searchResults: [], searching: true }));

    act(() => useBrainStore.getState().clearSearch());

    expect(useBrainStore.getState().searchQuery).toBe('');
    expect(useBrainStore.getState().searchResults).toBeNull();
    expect(useBrainStore.getState().searching).toBe(false);
  });

  it('linkNodes crée l’arête puis recharge le graphe', async () => {
    vi.mocked(svc.createEdge).mockResolvedValue(undefined as never);
    vi.mocked(svc.getBrainOverview).mockResolvedValue(overview([node(1), node(2)]));

    await act(async () => {
      await useBrainStore.getState().linkNodes('ws', 1, 2, 'RELATES_TO');
    });

    expect(svc.createEdge).toHaveBeenCalledWith('ws', 1, 2, 'RELATES_TO');
    expect(svc.getBrainOverview).toHaveBeenCalledWith('ws');
  });

  it('unlink supprime l’arête puis recharge le graphe', async () => {
    vi.mocked(svc.deleteEdge).mockResolvedValue(undefined);
    vi.mocked(svc.getBrainOverview).mockResolvedValue(overview([]));

    await act(async () => {
      await useBrainStore.getState().unlink('ws', 5);
    });

    expect(svc.deleteEdge).toHaveBeenCalledWith('ws', 5);
    expect(svc.getBrainOverview).toHaveBeenCalledWith('ws');
  });
});
