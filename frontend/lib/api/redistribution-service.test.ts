import { describe, it, expect, beforeEach, vi } from 'vitest';
import { previewRedistribution, applyRedistribution } from './redistribution-service';
import { apiClient } from './client';
import { WORKSPACE_ROUTES } from '../config/api-routes';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  getErrorMessage: vi.fn((e: any) => e?.message || 'error'),
  // Requis : redistribution-service importe ce timeout (le back range les candidats via le LLM,
  // une passe par issue déplaçable, ce qui dépasse les 30 s par défaut).
  AI_TIMEOUT_MS: 200_000,
}));

const envelope = <T,>(data: T) => ({ data: { success: true, message: 'ok', data } });

/** Doit rester aligné sur la valeur exposée par le mock ci-dessus. */
const AI_TIMEOUT = { timeout: 200_000 };

describe('redistribution-service', () => {
  const slug = 'acme';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('previewRedistribution: POST preview route without userId query and returns plan', async () => {
    const plan = { threshold: 5, totalMoves: 0, moves: [], memberLoads: [] };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(plan));

    const result = await previewRedistribution(slug);

    expect(apiClient.post).toHaveBeenCalledWith(
      WORKSPACE_ROUTES.REDISTRIBUTE_PREVIEW(slug),
      {},
      AI_TIMEOUT,
    );
    expect(result).toEqual(plan);
  });

  it('previewRedistribution: appends userId query param when provided', async () => {
    const plan = { threshold: 5, totalMoves: 1, moves: [], memberLoads: [] };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(plan));

    const result = await previewRedistribution(slug, 12);

    expect(apiClient.post).toHaveBeenCalledWith(
      `${WORKSPACE_ROUTES.REDISTRIBUTE_PREVIEW(slug)}?userId=12`,
      {},
      AI_TIMEOUT,
    );
    expect(result).toEqual(plan);
  });

  it('applyRedistribution: POST apply route with { moves } and returns result', async () => {
    const applyResult = { applied: 2, skipped: 1 };
    const moves = [{ issueId: 1, toUserId: 3 }];
    vi.mocked(apiClient.post).mockResolvedValue(envelope(applyResult));

    const result = await applyRedistribution(slug, moves);

    expect(apiClient.post).toHaveBeenCalledWith(WORKSPACE_ROUTES.REDISTRIBUTE_APPLY(slug), { moves });
    expect(result).toEqual(applyResult);
  });

  it('previewRedistribution: propagates errors', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('boom'));
    await expect(previewRedistribution(slug)).rejects.toThrow('boom');
  });
});
