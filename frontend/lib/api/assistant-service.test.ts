import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sendAgentMessage, sendAssistantMessage, isApprovable, isDeletion, isMission, isPreparedIssue, isQuestion, approveAction, isUndoable,
  undoAction,
  type AssistantToolCall,
} from './assistant-service';
import { apiClient } from './client';
import { executeMcpAction } from './integration-service';
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

vi.mock('./integration-service', () => ({ executeMcpAction: vi.fn() }));

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

describe('assistant-service: the approval of a proposed action', () => {
  const slug = 'acme';
  const RECORD = '00000000-0000-0000-0000-0000000000aa';
  const call = (over: Partial<AssistantToolCall>): AssistantToolCall =>
    ({ name: 'create_note', status: 'pending', input: '{"title":"T"}', output: 'Proposed', ...over });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['an internal proposal with its record', call({ record: RECORD }), true],
    ['an external proposal with its record', call({ name: 'linear__save_issue', record: RECORD }), true],
    ['an external proposal from an answer without a record', call({ name: 'linear__save_issue' }), true],
    ['an internal proposal without a record', call({ record: null }), false],
    ['an action that already ran', call({ status: 'success', record: RECORD }), false],
    ['an action the rules refused', call({ status: 'refused', record: RECORD }), false],
  ])('isApprovable: %s -> %s', (_label, toolCall, expected) => {
    expect(isApprovable(toolCall)).toBe(expected);
  });

  it('approveAction: sends the tool, its input and the record of the answer', async () => {
    const result = { tool: 'create_note', status: 'success' as const, output: 'Note created' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(result));

    await expect(approveAction(slug, call({ record: RECORD }))).resolves.toEqual(result);

    expect(apiClient.post).toHaveBeenCalledWith(ASSISTANT_ROUTES.ACTION_EXECUTE(slug),
      { tool: 'create_note', input: '{"title":"T"}', record: RECORD });
    expect(executeMcpAction).not.toHaveBeenCalled();
  });

  it('approveAction: an action without input sends an empty object', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope({ tool: 'create_note', status: 'refused', output: 'Not run' }));

    const result = await approveAction(slug, call({ input: null, record: RECORD }));

    expect(result.status).toBe('refused');
    expect(apiClient.post).toHaveBeenCalledWith(ASSISTANT_ROUTES.ACTION_EXECUTE(slug),
      { tool: 'create_note', input: '{}', record: RECORD });
  });

  it.each([
    ['{"title":"T"}', { title: 'T' }],
    [null, {}],
  ])('approveAction: without a record, an external write goes through the MCP console route (input %s)', async (input, args) => {
    vi.mocked(executeMcpAction).mockResolvedValue('Issue saved');

    const result = await approveAction(slug, call({ name: 'linear__save_issue', input }));

    expect(executeMcpAction).toHaveBeenCalledWith(slug, 'linear__save_issue', args);
    expect(result).toEqual({ tool: 'linear__save_issue', status: 'success', output: 'Issue saved' });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('approveAction: propagates a refusal of the server', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('This action is no longer waiting for your approval.'));

    await expect(approveAction(slug, call({ record: RECORD }))).rejects.toThrow('no longer waiting');
  });
});

describe('assistant-service: undoing what Cortex created (R77)', () => {
  const slug = 'acme';
  const RECORD = '00000000-0000-0000-0000-0000000000aa';
  const call = (over: Partial<AssistantToolCall>): AssistantToolCall =>
    ({ name: 'create_project', status: 'success', input: '{"name":"Pricing"}', output: 'Project created', record: RECORD, ...over });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['a project Cortex created', call({}), true],
    ['an issue Cortex created', call({ name: 'create_issue' }), true],
    ['a note Cortex created', call({ name: 'create_note' }), true],
    ['an issue Cortex changed, moved or assigned', call({ name: 'update_issue' }), true],
    ['a comment Cortex wrote', call({ name: 'add_comment' }), true],
    ['an issue handed to an agent, which does not undo', call({ name: 'delegate_issue' }), false],
    ['a mission Cortex read', call({ name: 'get_mission' }), false],
    ['a creation that failed', call({ status: 'error' }), false],
    ['a proposal still waiting', call({ status: 'pending' }), false],
    ['an answer without a record', call({ record: null }), false],
  ])('isUndoable: %s -> %s', (_label, toolCall, expected) => {
    expect(isUndoable(toolCall)).toBe(expected);
  });

  it.each([
    ['an issue Cortex prepared', call({ name: 'create_issue', status: 'pending' }), true],
    ['an issue already created', call({ name: 'create_issue' }), false],
    ['a prepared issue without a record', call({ name: 'create_issue', status: 'pending', record: null }), false],
    ['another proposal', call({ name: 'create_note', status: 'pending' }), false],
  ])('isPreparedIssue: %s -> %s', (_label, toolCall, expected) => {
    expect(isPreparedIssue(toolCall)).toBe(expected);
  });

  it.each([
    ['an issue Cortex asks about first', call({ name: 'create_issue', status: 'question' }), true],
    ['an issue Cortex prepared', call({ name: 'create_issue', status: 'pending' }), false],
    ['a creation', call({}), false],
  ])('isQuestion: %s -> %s', (_label, toolCall, expected) => {
    expect(isQuestion(toolCall)).toBe(expected);
    // Une question n'est ni une carte, ni une action à accorder, ni une création à défaire.
    if (expected) {
      expect(isPreparedIssue(toolCall)).toBe(false);
      expect(isApprovable(toolCall)).toBe(false);
      expect(isUndoable(toolCall)).toBe(false);
    }
  });

  it('undoAction: sends the tool and the record of the answer', async () => {
    const result = { tool: 'create_project', status: 'success' as const, output: 'Removed the project PRICING "Pricing".' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(result));

    await expect(undoAction(slug, call({}))).resolves.toEqual(result);
    expect(apiClient.post).toHaveBeenCalledWith(ASSISTANT_ROUTES.ACTION_UNDO(slug), { tool: 'create_project', record: RECORD });
  });

  it('undoAction: names the gesture to undo when the answer has several of the same tool', async () => {
    const result = { tool: 'update_issue', status: 'success' as const, output: 'Put back the column of TF-12 "Fix login".' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(result));

    await undoAction(slug, call({ name: 'update_issue', ref: 'sha256:r1' }));

    expect(apiClient.post).toHaveBeenCalledWith(ASSISTANT_ROUTES.ACTION_UNDO(slug),
      { tool: 'update_issue', record: RECORD, ref: 'sha256:r1' });
  });
});

describe('assistant-service: the mission of an issue in the conversation (TF-J1-5)', () => {
  const target = { issueId: 28, projectId: 3, key: 'TF-28', title: 'Fix the footer links', runId: 100 };
  const call = (over: Partial<AssistantToolCall>): AssistantToolCall =>
    ({ name: 'get_mission', status: 'success', input: '{"issue":"TF-28"}', output: 'The mission on TF-28', target, ...over });

  it.each([
    ['a mission Cortex read', call({}), true],
    ['an issue handed to an agent', call({ name: 'delegate_issue' }), true],
    ['a delegation still waiting for the person', call({ name: 'delegate_issue', status: 'pending', target: null }), false],
    ['a mission read that failed', call({ status: 'error', target: null }), false],
    ['a change of an issue', call({ name: 'update_issue' }), false],
    ['an answer from before the gestures', call({ target: undefined }), false],
  ])('isMission: %s -> %s', (_label, toolCall, expected) => {
    expect(isMission(toolCall)).toBe(expected);
  });

  it.each([
    ['a deletion Cortex asks for, with what goes with the issue', call({ name: 'delete_issue', status: 'pending', record: 'r' }), true],
    ['a deletion without the record of its answer', call({ name: 'delete_issue', status: 'pending', record: null }), false],
    ['a deletion already done', call({ name: 'delete_issue', status: 'success', record: 'r' }), false],
    ['another proposal', call({ name: 'delegate_issue', status: 'pending', record: 'r' }), false],
    ['a deletion whose issue the server did not find', call({ name: 'delete_issue', status: 'pending', record: 'r', target: null }), false],
  ])('isDeletion: %s -> %s', (_label, toolCall, expected) => {
    expect(isDeletion(toolCall)).toBe(expected);
  });
});
