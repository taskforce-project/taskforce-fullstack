import { beforeEach, describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { useMessageStore } from './message-store';
import type { ApiChatMessage } from '../api/message-service';

const sampleMessage: ApiChatMessage = {
  id: 42,
  channelId: 7,
  authorId: 3,
  authorName: 'Alice Example',
  authorInitials: 'AE',
  content: 'Bonjour',
  isEdited: false,
  createdAt: '2026-05-31T10:00:00.000Z',
  updatedAt: '2026-05-31T10:00:00.000Z',
};

describe('message-store', () => {
  beforeEach(() => {
    act(() => {
      useMessageStore.setState({
        channels: [],
        activeChannelId: null,
        messagesByChannel: {},
        loadingChannels: false,
        loadingMessages: false,
        error: null,
      });
    });
  });

  it('adds a websocket message to the target channel', () => {
    act(() => {
      useMessageStore.getState().addMessage(sampleMessage.channelId, sampleMessage);
    });

    expect(useMessageStore.getState().messagesByChannel[sampleMessage.channelId]).toEqual([sampleMessage]);
  });

  it('ignores duplicate websocket messages by id', () => {
    act(() => {
      useMessageStore.getState().addMessage(sampleMessage.channelId, sampleMessage);
      useMessageStore.getState().addMessage(sampleMessage.channelId, sampleMessage);
    });

    expect(useMessageStore.getState().messagesByChannel[sampleMessage.channelId]).toHaveLength(1);
  });
});
