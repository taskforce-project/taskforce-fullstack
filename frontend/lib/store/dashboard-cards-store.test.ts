import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useDashboardCardsStore } from './dashboard-cards-store';
import * as svc from '../api/dashboard-card-service';
import type { DashboardCard } from '../api/dashboard-card-service';

vi.mock('../api/dashboard-card-service', () => ({
  listDashboardCards: vi.fn(),
  createDashboardCard: vi.fn(),
  updateDashboardCard: vi.fn(),
  reorderDashboardCards: vi.fn(),
  deleteDashboardCard: vi.fn(),
}));

const card = (id: number, position: number, title = `Carte ${id}`): DashboardCard =>
  ({ id, cardType: 'KPI', title, config: {}, timeRange: null, position }) as DashboardCard;

const reset = () =>
  act(() => {
    useDashboardCardsStore.setState({ cards: [], isLoading: false, error: null });
  });

describe('dashboard-cards-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset();
  });

  describe('fetchCards', () => {
    it('trie les cartes par position et retombe l’état de chargement', async () => {
      vi.mocked(svc.listDashboardCards).mockResolvedValue([card(2, 1), card(1, 0)]);

      await act(async () => {
        await useDashboardCardsStore.getState().fetchCards('ws');
      });

      expect(svc.listDashboardCards).toHaveBeenCalledWith('ws');
      expect(useDashboardCardsStore.getState().cards.map((c) => c.id)).toEqual([1, 2]);
      expect(useDashboardCardsStore.getState().isLoading).toBe(false);
      expect(useDashboardCardsStore.getState().error).toBeNull();
    });

    it('pose le message d’erreur en cas d’échec', async () => {
      vi.mocked(svc.listDashboardCards).mockRejectedValue(new Error('boom'));

      await act(async () => {
        await useDashboardCardsStore.getState().fetchCards('ws');
      });

      expect(useDashboardCardsStore.getState().error).toBe('boom');
      expect(useDashboardCardsStore.getState().isLoading).toBe(false);
    });
  });

  describe('addCard', () => {
    it('insère la carte créée en respectant l’ordre des positions', async () => {
      act(() => useDashboardCardsStore.setState({ cards: [card(1, 0)] }));
      vi.mocked(svc.createDashboardCard).mockResolvedValue(card(2, 1));

      let created: DashboardCard | null = null;
      await act(async () => {
        created = await useDashboardCardsStore.getState().addCard('ws', { cardType: 'KPI' });
      });

      expect(svc.createDashboardCard).toHaveBeenCalledWith('ws', { cardType: 'KPI' });
      expect(created).not.toBeNull();
      expect(useDashboardCardsStore.getState().cards.map((c) => c.id)).toEqual([1, 2]);
    });

    it('renvoie null et laisse la grille intacte si la création échoue', async () => {
      act(() => useDashboardCardsStore.setState({ cards: [card(1, 0)] }));
      vi.mocked(svc.createDashboardCard).mockRejectedValue(new Error('refus'));

      let created: DashboardCard | null = null;
      await act(async () => {
        created = await useDashboardCardsStore.getState().addCard('ws', { cardType: 'KPI' });
      });

      expect(created).toBeNull();
      expect(useDashboardCardsStore.getState().cards).toHaveLength(1);
    });
  });

  describe('patchCard', () => {
    it('applique le changement immédiatement puis le remplace par la réponse serveur', async () => {
      act(() => useDashboardCardsStore.setState({ cards: [card(1, 0, 'Avant')] }));
      vi.mocked(svc.updateDashboardCard).mockResolvedValue(card(1, 0, 'Serveur'));

      await act(async () => {
        await useDashboardCardsStore.getState().patchCard('ws', 1, { title: 'Après' });
      });

      expect(svc.updateDashboardCard).toHaveBeenCalledWith('ws', 1, { title: 'Après' });
      expect(useDashboardCardsStore.getState().cards[0].title).toBe('Serveur');
    });

    it('restaure l’état précédent si le serveur refuse', async () => {
      act(() => useDashboardCardsStore.setState({ cards: [card(1, 0, 'Avant')] }));
      vi.mocked(svc.updateDashboardCard).mockRejectedValue(new Error('refus'));

      let result: DashboardCard | null = card(9, 9);
      await act(async () => {
        result = await useDashboardCardsStore.getState().patchCard('ws', 1, { title: 'Après' });
      });

      expect(result).toBeNull();
      expect(useDashboardCardsStore.getState().cards[0].title).toBe('Avant');
    });

    it('un champ absent du payload laisse la valeur en place', async () => {
      act(() => useDashboardCardsStore.setState({ cards: [card(1, 0, 'Titre')] }));
      // Le serveur ne répond jamais : on observe uniquement la mise à jour optimiste.
      vi.mocked(svc.updateDashboardCard).mockReturnValue(new Promise(() => {}) as never);

      act(() => {
        void useDashboardCardsStore.getState().patchCard('ws', 1, { timeRange: '30d' });
      });

      expect(useDashboardCardsStore.getState().cards[0].title).toBe('Titre');
      expect(useDashboardCardsStore.getState().cards[0].timeRange).toBe('30d');
    });
  });

  describe('removeCard', () => {
    it('retire la carte et confirme la suppression', async () => {
      act(() => useDashboardCardsStore.setState({ cards: [card(1, 0), card(2, 1)] }));
      vi.mocked(svc.deleteDashboardCard).mockResolvedValue(undefined);

      let ok = false;
      await act(async () => {
        ok = await useDashboardCardsStore.getState().removeCard('ws', 1);
      });

      expect(ok).toBe(true);
      expect(useDashboardCardsStore.getState().cards.map((c) => c.id)).toEqual([2]);
    });

    it('fait réapparaître la carte si le serveur refuse', async () => {
      act(() => useDashboardCardsStore.setState({ cards: [card(1, 0), card(2, 1)] }));
      vi.mocked(svc.deleteDashboardCard).mockRejectedValue(new Error('refus'));

      let ok = true;
      await act(async () => {
        ok = await useDashboardCardsStore.getState().removeCard('ws', 1);
      });

      expect(ok).toBe(false);
      expect(useDashboardCardsStore.getState().cards.map((c) => c.id)).toEqual([1, 2]);
    });
  });

  describe('reorderCards', () => {
    it('renumérote les positions selon l’ordre fourni', async () => {
      act(() => useDashboardCardsStore.setState({ cards: [card(1, 0), card(2, 1), card(3, 2)] }));
      vi.mocked(svc.reorderDashboardCards).mockResolvedValue(undefined);

      let ok = false;
      await act(async () => {
        ok = await useDashboardCardsStore.getState().reorderCards('ws', [3, 1, 2]);
      });

      expect(ok).toBe(true);
      expect(svc.reorderDashboardCards).toHaveBeenCalledWith('ws', [3, 1, 2]);
      expect(useDashboardCardsStore.getState().cards.map((c) => [c.id, c.position])).toEqual([
        [3, 0],
        [1, 1],
        [2, 2],
      ]);
    });

    it('ignore un identifiant inconnu au lieu de produire un trou', async () => {
      act(() => useDashboardCardsStore.setState({ cards: [card(1, 0), card(2, 1)] }));
      vi.mocked(svc.reorderDashboardCards).mockResolvedValue(undefined);

      await act(async () => {
        await useDashboardCardsStore.getState().reorderCards('ws', [2, 99, 1]);
      });

      expect(useDashboardCardsStore.getState().cards.map((c) => c.id)).toEqual([2, 1]);
    });

    it('revient à l’ordre précédent si le serveur refuse', async () => {
      act(() => useDashboardCardsStore.setState({ cards: [card(1, 0), card(2, 1)] }));
      vi.mocked(svc.reorderDashboardCards).mockRejectedValue(new Error('refus'));

      let ok = true;
      await act(async () => {
        ok = await useDashboardCardsStore.getState().reorderCards('ws', [2, 1]);
      });

      expect(ok).toBe(false);
      expect(useDashboardCardsStore.getState().cards.map((c) => c.id)).toEqual([1, 2]);
    });
  });

  it('clearCards vide la grille et l’erreur (changement de workspace)', () => {
    act(() => useDashboardCardsStore.setState({ cards: [card(1, 0)], error: 'boom' }));

    act(() => useDashboardCardsStore.getState().clearCards());

    expect(useDashboardCardsStore.getState().cards).toEqual([]);
    expect(useDashboardCardsStore.getState().error).toBeNull();
  });
});
