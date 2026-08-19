import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  formatFileSize,
} from './attachment-service';
import { apiClient } from './client';
import { ATTACHMENT_ROUTES } from '../config/api-routes';

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

describe('attachment-service', () => {
  const slug = 'acme';
  const projectId = 42;
  const issueId = 7;
  const attachmentId = 3;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listAttachments: GET list route and returns attachments', async () => {
    const attachments = [{ id: 1, originalName: 'a.png' }];
    vi.mocked(apiClient.get).mockResolvedValue(envelope(attachments));

    const result = await listAttachments(slug, projectId, issueId);

    expect(apiClient.get).toHaveBeenCalledWith(ATTACHMENT_ROUTES.LIST(slug, projectId, issueId));
    expect(result).toEqual(attachments);
  });

  it('uploadAttachment: POST upload route with FormData and multipart header', async () => {
    const created = { id: 2, originalName: 'file.pdf' };
    vi.mocked(apiClient.post).mockResolvedValue(envelope(created));

    const file = new File(['content'], 'file.pdf', { type: 'application/pdf' });
    const result = await uploadAttachment(slug, projectId, issueId, file);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = vi.mocked(apiClient.post).mock.calls[0];
    expect(url).toBe(ATTACHMENT_ROUTES.UPLOAD(slug, projectId, issueId));
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
    expect(result).toEqual(created);
  });

  it('deleteAttachment: DELETE route', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(undefined));

    await deleteAttachment(slug, projectId, issueId, attachmentId);

    expect(apiClient.delete).toHaveBeenCalledWith(
      ATTACHMENT_ROUTES.DELETE(slug, projectId, issueId, attachmentId)
    );
  });

  it('formatFileSize: formats bytes, KB and MB', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('listAttachments: propagates errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
    await expect(listAttachments(slug, projectId, issueId)).rejects.toThrow('boom');
  });
});
