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
  getErrorMessage: vi.fn((e: any) => e?.message || 'error'),
}));

const envelope = <T,>(data: T) => ({ data: { success: true, message: 'ok', data } });

const buildAnswer = () => ({
  answer: 'Hello there',
  reasoning: null,
  mode: 'fast' as const,
  sources: [],
  steps: [],
  toolCalls: [],
});

describe('assistant-service', () => {
  const slug = 'acme';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendAgentMessage: POST chat route with { message } and returns full answer', async () => {
    const answer = buildAnswer();
    vi.mocked(apiClient.post).mockResolvedValue(envelope(answer));

    const result = await sendAgentMessage(slug, 'hi');

    expect(apiClient.post).toHaveBeenCalledWith(ASSISTANT_ROUTES.CHAT(slug), { message: 'hi' });
    expect(result).toEqual(answer);
  });

  it('sendAssistantMessage: returns only the answer markdown string', async () => {
    const answer = buildAnswer();
    vi.mocked(apiClient.post).mockResolvedValue(envelope(answer));

    const result = await sendAssistantMessage(slug, 'hi');

    expect(apiClient.post).toHaveBeenCalledWith(ASSISTANT_ROUTES.CHAT(slug), { message: 'hi' });
    expect(result).toBe('Hello there');
  });

  it('sendAgentMessage: propagates errors', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('boom'));
    await expect(sendAgentMessage(slug, 'hi')).rejects.toThrow('boom');
  });
});
