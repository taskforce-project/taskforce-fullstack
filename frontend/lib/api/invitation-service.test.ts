import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createInvitation,
  listPendingInvitations,
  revokeInvitation,
  previewInvitation,
  acceptInvitation,
} from './invitation-service';
import { apiClient } from './client';
import { WORKSPACE_ROUTES, INVITATION_ROUTES } from '../config/api-routes';

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

describe('invitation-service', () => {
  const slug = 'acme';
  const invitationId = 3;
  const token = '9f2c4e7a1b3d5f6e8a0c2e4f6a8b0d1c';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createInvitation: POST invitations route with payload and returns invitation', async () => {
    const payload = { email: 'x@y.com', role: 'MEMBER' as any };
    const created = { id: 1, email: 'x@y.com' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(created));

    const result = await createInvitation(slug, payload);

    expect(apiClient.post).toHaveBeenCalledWith(WORKSPACE_ROUTES.INVITATIONS(slug), payload);
    expect(result).toEqual(created);
  });

  it('listPendingInvitations: GET invitations route and returns invitations', async () => {
    const invitations = [{ id: 1, email: 'x@y.com' }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(invitations));

    const result = await listPendingInvitations(slug);

    expect(apiClient.get).toHaveBeenCalledWith(WORKSPACE_ROUTES.INVITATIONS(slug));
    expect(result).toEqual(invitations);
  });

  it('revokeInvitation: DELETE invitation route', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(undefined));

    await revokeInvitation(slug, invitationId);

    expect(apiClient.delete).toHaveBeenCalledWith(WORKSPACE_ROUTES.INVITATION(slug, invitationId));
  });

  it('previewInvitation: GET preview route and returns preview', async () => {
    const preview = { email: 'x@y.com', workspaceName: 'Acme', role: 'MEMBER', valid: true, accountExists: false };
    vi.mocked(apiClient.get).mockResolvedValue(envelope(preview));

    const result = await previewInvitation(token);

    expect(apiClient.get).toHaveBeenCalledWith(INVITATION_ROUTES.PREVIEW(token));
    expect(result).toEqual(preview);
  });

  it('acceptInvitation: POST accept route with empty body', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(envelope(undefined));

    await acceptInvitation(token);

    expect(apiClient.post).toHaveBeenCalledWith(INVITATION_ROUTES.ACCEPT(token), {});
  });

  it.each([
    ['a path change', '../../users/me'],
    ['a query string', '9f2c4e7a1b3d5f6e?role=OWNER'],
    ['a fragment', '9f2c4e7a1b3d5f6e#x'],
    ['an encoded slash', '9f2c4e7a1b3d5f6e%2F..'],
    ['a too short token', 'tok-123'],
    ['an empty token', ''],
  ])('refuses a token with %s before any request', async (_label, bad) => {
    await expect(previewInvitation(bad)).rejects.toThrow('This invitation link is not valid');
    await expect(acceptInvitation(bad)).rejects.toThrow('This invitation link is not valid');
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('listPendingInvitations: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(listPendingInvitations(slug)).rejects.toThrow('boom');
  });
});
