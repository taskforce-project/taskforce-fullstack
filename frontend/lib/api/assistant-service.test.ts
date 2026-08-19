import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendAgentMessage, sendAssistantMessage } from './assistant-service';
import { apiClient } from './client';
import { ASSISTANT_ROUTES } from '../config/api-routes';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  getErrorMessage: vi.fn((e: { message?: string }) => e?.message || 'error'),
  AI_TIMEOUT_MS: 180000, // requis : assistant-service importe ce timeout pour les appels agent
}));

const envelope = <T,>(data: T) => ({ data: { success: true, message: 'ok', data } });

const buildAnswer = () => ({
  answer: 'Hello there',
  reasoning: null,
  mode: 'fast' as const,
  sources: [],
  steps: [],
  toolCalls: [],
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
});

// L'endpoint renvoie désormais un tour : { conversationId, title, answer }.
const buildTurn = () => ({ conversationId: 1, title: 'Hello there', answer: buildAnswer() });

describe('assistant-service', () => {
  const slug = 'acme';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendAgentMessage: POST chat route with { message } and returns full answer', async () => {
    const turn = buildTurn();
    vi.mocked(apiClient.post).mockResolvedValue(envelope(turn));

    const result = await sendAgentMessage(slug, 'hi');

    expect(apiClient.post).toHaveBeenCalledWith(ASSISTANT_ROUTES.CHAT(slug), { message: 'hi', conversationId: null }, expect.anything());
    expect(result).toEqual(turn);
  });

  it('sendAssistantMessage: returns only the answer markdown string', async () => {
    const turn = buildTurn();
    vi.mocked(apiClient.post).mockResolvedValue(envelope(turn));

    const result = await sendAssistantMessage(slug, 'hi');

    expect(apiClient.post).toHaveBeenCalledWith(ASSISTANT_ROUTES.CHAT(slug), { message: 'hi', conversationId: null }, expect.anything());
    expect(result).toBe('Hello there');
  });

  it('sendAgentMessage: propagates errors', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('boom'));
    await expect(sendAgentMessage(slug, 'hi')).rejects.toThrow('boom');
  });
});
