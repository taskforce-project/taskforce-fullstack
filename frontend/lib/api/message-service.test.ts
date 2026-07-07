import { describe, it, expect, beforeEach, vi } from 'vitest';
import { listChannels, createChannel, listMessages, editMessage, deleteMessage } from './message-service';
import { apiClient } from './client';
import { MESSAGE_ROUTES } from '../config/api-routes';

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

describe('message-service', () => {
  const slug = 'acme';
  const channelId = 11;
  const messageId = 55;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listChannels: GET channels route and returns channels', async () => {
    const channels = [{ id: 1, kind: 'CHANNEL' }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(channels));

    const result = await listChannels(slug);

    expect(apiClient.get).toHaveBeenCalledWith(MESSAGE_ROUTES.CHANNELS(slug));
    expect(result).toEqual(channels);
  });

  it('createChannel: POST channels route with payload and returns channel', async () => {
    const payload = { kind: 'CHANNEL' as const, name: 'general' };
    const created = { id: 2, kind: 'CHANNEL' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(created));

    const result = await createChannel(slug, payload);

    expect(apiClient.post).toHaveBeenCalledWith(MESSAGE_ROUTES.CHANNELS(slug), payload);
    expect(result).toEqual(created);
  });

  it('listMessages: GET messages route and returns messages', async () => {
    const messages = [{ id: 1, content: 'hi' }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(messages));

    const result = await listMessages(slug, channelId);

    expect(apiClient.get).toHaveBeenCalledWith(MESSAGE_ROUTES.MESSAGES(slug, channelId));
    expect(result).toEqual(messages);
  });

  it('editMessage: PATCH edit route with { content } and returns message', async () => {
    const updated = { id: messageId, content: 'edited' };
    vi.mocked(apiClient.patch).mockResolvedValue(envelope(updated));

    const result = await editMessage(slug, channelId, messageId, 'edited');

    expect(apiClient.patch).toHaveBeenCalledWith(
      MESSAGE_ROUTES.EDIT_MSG(slug, channelId, messageId),
      { content: 'edited' }
    );
    expect(result).toEqual(updated);
  });

  it('deleteMessage: DELETE message route', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(undefined));

    await deleteMessage(slug, channelId, messageId);

    expect(apiClient.delete).toHaveBeenCalledWith(MESSAGE_ROUTES.DELETE_MSG(slug, channelId, messageId));
  });

  it('listChannels: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(listChannels(slug)).rejects.toThrow('boom');
  });
});
