import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAnalyticsKpis,
  getAnalyticsThroughput,
  getAnalyticsBurndown,
  getAnalyticsCapacity,
  getAnalyticsWorkload,
  getAiInsights,
} from './analytics-service';
import { apiClient } from './client';
import { ANALYTICS_ROUTES } from '../config/api-routes';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  getErrorMessage: vi.fn((e: any) => e?.message || 'error'),
  // Requis : analytics-service importe ce timeout pour les appels IA. Le mock doit l'exposer,
  // sinon l'accès à la propriété lève « No export is defined on the mock ».
  AI_TIMEOUT_MS: 200_000,
}));

const SLUG = 'acme';
const envelope = <T>(payload: T) => ({ data: { success: true, message: 'ok', data: payload } });

/**
 * Les lectures analytiques passent `silentError` : ces appels alimentent des cartes qui affichent
 * leur propre état d'erreur, un toast global ferait doublon. L'option fait partie du contrat, elle
 * est donc assertée.
 */
const SILENT = { silentError: true };

/** Doit rester aligné sur la valeur exposée par le mock ci-dessus. */
const AI_TIMEOUT_MS = 200_000;

describe('analytics-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAnalyticsKpis', () => {
    it('GET les KPIs sans projectId (pas de query)', async () => {
      const kpis = { tasksResolved: 10 } as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(kpis));

      const result = await getAnalyticsKpis(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(ANALYTICS_ROUTES.KPIS(SLUG), SILENT);
      expect(result).toEqual(kpis);
    });

    it('ajoute ?projectId= quand fourni', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(envelope({} as any));

      await getAnalyticsKpis(SLUG, 7);

      expect(apiClient.get).toHaveBeenCalledWith(`${ANALYTICS_ROUTES.KPIS(SLUG)}?projectId=7`, SILENT);
    });

    it('propage l’erreur', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('500'));
      await expect(getAnalyticsKpis(SLUG)).rejects.toThrow('500');
    });
  });

  describe('getAnalyticsThroughput', () => {
    it('GET sans query par défaut', async () => {
      const points = [{ week: 'W1', opened: 3, resolved: 2 }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(points));

      const result = await getAnalyticsThroughput(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(ANALYTICS_ROUTES.THROUGHPUT(SLUG), SILENT);
      expect(result).toEqual(points);
    });

    it('ajoute projectId puis bucket avec &', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(envelope([]));

      await getAnalyticsThroughput(SLUG, 7, 'day');

      expect(apiClient.get).toHaveBeenCalledWith(
        `${ANALYTICS_ROUTES.THROUGHPUT(SLUG)}?projectId=7&bucket=DAY`,
        SILENT,
      );
    });

    it('ajoute bucket avec ? quand pas de projectId', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(envelope([]));

      await getAnalyticsThroughput(SLUG, null, 'week');

      expect(apiClient.get).toHaveBeenCalledWith(
        `${ANALYTICS_ROUTES.THROUGHPUT(SLUG)}?bucket=WEEK`,
        SILENT,
      );
    });
  });

  describe('getAnalyticsBurndown', () => {
    it('GET le burndown avec projectId', async () => {
      const points = [{ day: 'D1', remaining: 5, ideal: 4 }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(points));

      const result = await getAnalyticsBurndown(SLUG, 7);

      expect(apiClient.get).toHaveBeenCalledWith(`${ANALYTICS_ROUTES.BURNDOWN(SLUG)}?projectId=7`, SILENT);
      expect(result).toEqual(points);
    });
  });

  describe('getAnalyticsCapacity', () => {
    it('GET la capacité', async () => {
      const cap = [{ userId: 1, displayName: 'X', avatarUrl: null, openIssues: 3 }];
      vi.mocked(apiClient.get).mockResolvedValue(envelope(cap));

      const result = await getAnalyticsCapacity(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(ANALYTICS_ROUTES.CAPACITY(SLUG), SILENT);
      expect(result).toEqual(cap);
    });
  });

  describe('getAnalyticsWorkload', () => {
    it('GET la heatmap avec days par défaut (14)', async () => {
      const workload = { from: 'a', to: 'b', members: [] };
      vi.mocked(apiClient.get).mockResolvedValue(envelope(workload));

      const result = await getAnalyticsWorkload(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(`${ANALYTICS_ROUTES.WORKLOAD(SLUG)}?days=14`, SILENT);
      expect(result).toEqual(workload);
    });

    it('respecte un days personnalisé', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(envelope({ from: 'a', to: 'b', members: [] }));

      await getAnalyticsWorkload(SLUG, 30);

      expect(apiClient.get).toHaveBeenCalledWith(`${ANALYTICS_ROUTES.WORKLOAD(SLUG)}?days=30`, SILENT);
    });
  });

  describe('getAiInsights', () => {
    it('GET les insights IA', async () => {
      const insights = [{ agent: 'A', urgency: 'low', confidence: 0.9 }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(insights));

      const result = await getAiInsights(SLUG);

      // Les insights ajoutent le timeout IA long : la génération locale dépasse les 30 s par défaut.
      expect(apiClient.get).toHaveBeenCalledWith(ANALYTICS_ROUTES.INSIGHTS(SLUG), {
        silentError: true,
        timeout: AI_TIMEOUT_MS,
      });
      expect(result).toEqual(insights);
    });
  });
});
