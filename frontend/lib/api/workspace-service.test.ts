import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listWorkspaces,
  createWorkspace,
  getWorkspaceBySlug,
  updateWorkspace,
  getWorkspaceMembers,
  inviteMember,
  getAuditLogs,
  updateMemberRole,
  removeMember,
  deleteWorkspace,
  downloadWorkspaceBundle,
  importWorkspaceBundle,
} from './workspace-service';
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
}));

const SLUG = 'acme';
const envelope = <T>(payload: T) => ({ data: { success: true, message: 'ok', data: payload } });

describe('workspace-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listWorkspaces', () => {
    it('GET la liste des workspaces', async () => {
      const payload = [{ id: 1, slug: SLUG }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(payload));

      const result = await listWorkspaces();

      expect(apiClient.get).toHaveBeenCalledWith(WORKSPACE_ROUTES.LIST);
      expect(result).toEqual(payload);
    });

    it('propage l’erreur', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('401'));
      await expect(listWorkspaces()).rejects.toThrow('401');
    });
  });

  describe('downloadWorkspaceBundle', () => {
    it("télécharge le zip de l'espace sous le nom donné par le serveur, avec la progression", async () => {
      const blob = new Blob(['PK']);
      vi.mocked(apiClient.get).mockImplementation(async (_url, config) => {
        config?.onDownloadProgress?.({ loaded: 3, total: 4 } as any);
        return { data: blob, headers: { 'content-disposition': 'attachment; filename="acme-2026-10-20.taskforce-workspace.zip"' } } as any;
      });
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:ws'), revokeObjectURL: vi.fn() });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const progress = vi.fn();

      await downloadWorkspaceBundle(SLUG, progress);

      expect(apiClient.get).toHaveBeenCalledWith(WORKSPACE_ROUTES.BUNDLE(SLUG),
        expect.objectContaining({ responseType: 'blob', timeout: 0 }));
      expect(progress).toHaveBeenCalledWith(75);
      expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('acme-2026-10-20.taskforce-workspace.zip');
      click.mockRestore();
    });

    it("prend un nom par défaut sans en-tête", async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob(['PK']), headers: {} } as any);
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:ws'), revokeObjectURL: vi.fn() });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      await downloadWorkspaceBundle(SLUG);

      expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(`${SLUG}.taskforce-workspace.zip`);
      click.mockRestore();
    });
  });

  describe('importWorkspaceBundle', () => {
    it('POST le fichier en application/zip et rend le nouvel espace', async () => {
      const file = new Blob(['PK'], { type: 'application/zip' });
      const workspace = { id: 9, slug: 'acme-copy', name: 'Acme' } as any;
      vi.mocked(apiClient.post).mockImplementation(async (_url, _body, config) => {
        config?.onUploadProgress?.({ loaded: 1, total: 2 } as any);
        return envelope(workspace) as any;
      });
      const progress = vi.fn();

      expect(await importWorkspaceBundle(file, progress)).toEqual(workspace);
      expect(apiClient.post).toHaveBeenCalledWith(WORKSPACE_ROUTES.IMPORT, file, expect.objectContaining({
        headers: { 'Content-Type': 'application/zip' },
        timeout: 0,
      }));
      expect(progress).toHaveBeenCalledWith(50);
    });
  });

  describe('createWorkspace', () => {
    it('POST le payload de création', async () => {
      const payload = { name: 'Acme', activity: 'We build a CRM' };
      const created = { id: 1, slug: SLUG, name: 'Acme' } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(created));

      const result = await createWorkspace(payload);

      expect(apiClient.post).toHaveBeenCalledWith(WORKSPACE_ROUTES.CREATE, payload);
      expect(result).toEqual(created);
    });
  });

  describe('getWorkspaceBySlug', () => {
    it('GET par slug', async () => {
      const ws = { id: 1, slug: SLUG } as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(ws));

      const result = await getWorkspaceBySlug(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(WORKSPACE_ROUTES.BY_SLUG(SLUG));
      expect(result).toEqual(ws);
    });
  });

  describe('updateWorkspace', () => {
    it('PATCH par slug', async () => {
      const payload = { name: 'Acme Corp' };
      const ws = { id: 1, slug: SLUG, name: 'Acme Corp' } as any;
      vi.mocked(apiClient.patch).mockResolvedValue(envelope(ws));

      const result = await updateWorkspace(SLUG, payload);

      expect(apiClient.patch).toHaveBeenCalledWith(WORKSPACE_ROUTES.BY_SLUG(SLUG), payload);
      expect(result).toEqual(ws);
    });
  });

  describe('getWorkspaceMembers', () => {
    it('GET les membres', async () => {
      const members = [{ id: 1, userId: 10 }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(members));

      const result = await getWorkspaceMembers(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(WORKSPACE_ROUTES.MEMBERS(SLUG));
      expect(result).toEqual(members);
    });
  });

  describe('inviteMember', () => {
    it('POST le payload d’invitation', async () => {
      const payload = { email: 'x@y.z', role: 'MEMBER' as const };
      const member = { id: 2, userId: 20, role: 'MEMBER' } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(member));

      const result = await inviteMember(SLUG, payload);

      expect(apiClient.post).toHaveBeenCalledWith(WORKSPACE_ROUTES.INVITE(SLUG), payload);
      expect(result).toEqual(member);
    });
  });

  describe('getAuditLogs', () => {
    it('GET le journal d’audit', async () => {
      const logs = [{ id: 1, action: 'LOGIN' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(logs));

      const result = await getAuditLogs(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(WORKSPACE_ROUTES.AUDIT(SLUG));
      expect(result).toEqual(logs);
    });
  });

  describe('updateMemberRole', () => {
    it('PATCH le rôle d’un membre', async () => {
      const payload = { role: 'ADMIN' as const };
      const member = { id: 2, userId: 20, role: 'ADMIN' } as any;
      vi.mocked(apiClient.patch).mockResolvedValue(envelope(member));

      const result = await updateMemberRole(SLUG, 2, payload);

      expect(apiClient.patch).toHaveBeenCalledWith(WORKSPACE_ROUTES.MEMBER_ROLE(SLUG, 2), payload);
      expect(result).toEqual(member);
    });
  });

  describe('removeMember', () => {
    it('DELETE le membre', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await removeMember(SLUG, 2);

      expect(apiClient.delete).toHaveBeenCalledWith(WORKSPACE_ROUTES.MEMBER(SLUG, 2));
    });
  });

  describe('deleteWorkspace', () => {
    it('DELETE le workspace par slug', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteWorkspace(SLUG);

      expect(apiClient.delete).toHaveBeenCalledWith(WORKSPACE_ROUTES.BY_SLUG(SLUG));
    });

    it('propage l’erreur', async () => {
      vi.mocked(apiClient.delete).mockRejectedValue(new Error('forbidden'));
      await expect(deleteWorkspace(SLUG)).rejects.toThrow('forbidden');
    });
  });

});
