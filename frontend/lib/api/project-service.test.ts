import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  archiveProject,
  favoriteProject,
  unfavoriteProject,
  deleteProject,
  listProjectMembers,
  addProjectMember,
  removeProjectMember,
  listProjectTeams,
  attachProjectTeam,
  detachProjectTeam,
  getProjectActivity,
  listProjectLabels,
  createProjectLabel,
  deleteProjectLabel,
} from './project-service';
import { apiClient } from './client';
import { PROJECT_ROUTES } from '../config/api-routes';

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

const SLUG = 'my-workspace';
const PROJECT_ID = 42;

/** Enveloppe ApiResponse<T> renvoyée par le backend. */
const envelope = <T>(payload: T) => ({ data: { success: true, message: 'ok', data: payload } });

describe('project-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listProjects', () => {
    it('GET la liste des projets et retourne le payload', async () => {
      const payload = [{ id: 1, name: 'Alpha' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(payload));

      const result = await listProjects(SLUG);

      expect(apiClient.get).toHaveBeenCalledWith(PROJECT_ROUTES.LIST(SLUG));
      expect(result).toEqual(payload);
    });

    it('propage l’erreur du client', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('boom'));
      await expect(listProjects(SLUG)).rejects.toThrow('boom');
    });
  });

  describe('createProject', () => {
    it('POST le payload de création', async () => {
      const payload = { name: 'New', identifier: 'NEW' };
      const created = { id: 7, ...payload } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(created));

      const result = await createProject(SLUG, payload);

      expect(apiClient.post).toHaveBeenCalledWith(PROJECT_ROUTES.CREATE(SLUG), payload);
      expect(result).toEqual(created);
    });
  });

  describe('getProject', () => {
    it('GET un projet par id', async () => {
      const project = { id: PROJECT_ID, name: 'Alpha' } as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(project));

      const result = await getProject(SLUG, PROJECT_ID);

      expect(apiClient.get).toHaveBeenCalledWith(PROJECT_ROUTES.BY_ID(SLUG, PROJECT_ID));
      expect(result).toEqual(project);
    });
  });

  describe('updateProject', () => {
    it('PATCH le payload de mise à jour', async () => {
      const payload = { name: 'Renamed' };
      const updated = { id: PROJECT_ID, name: 'Renamed' } as any;
      vi.mocked(apiClient.patch).mockResolvedValue(envelope(updated));

      const result = await updateProject(SLUG, PROJECT_ID, payload);

      expect(apiClient.patch).toHaveBeenCalledWith(PROJECT_ROUTES.UPDATE(SLUG, PROJECT_ID), payload);
      expect(result).toEqual(updated);
    });
  });

  describe('archiveProject', () => {
    it('POST sur la route archive (sans body)', async () => {
      const project = { id: PROJECT_ID, status: 'ARCHIVED' } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(project));

      const result = await archiveProject(SLUG, PROJECT_ID);

      expect(apiClient.post).toHaveBeenCalledWith(PROJECT_ROUTES.ARCHIVE(SLUG, PROJECT_ID));
      expect(result).toEqual(project);
    });
  });

  describe('favoriteProject', () => {
    it('POST sur la route favorite', async () => {
      const project = { id: PROJECT_ID, isFavorite: true } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(project));

      const result = await favoriteProject(SLUG, PROJECT_ID);

      expect(apiClient.post).toHaveBeenCalledWith(PROJECT_ROUTES.FAVORITE(SLUG, PROJECT_ID));
      expect(result).toEqual(project);
    });
  });

  describe('unfavoriteProject', () => {
    it('DELETE sur la route favorite', async () => {
      const project = { id: PROJECT_ID, isFavorite: false } as any;
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(project));

      const result = await unfavoriteProject(SLUG, PROJECT_ID);

      expect(apiClient.delete).toHaveBeenCalledWith(PROJECT_ROUTES.FAVORITE(SLUG, PROJECT_ID));
      expect(result).toEqual(project);
    });
  });

  describe('deleteProject', () => {
    it('DELETE le projet', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteProject(SLUG, PROJECT_ID);

      expect(apiClient.delete).toHaveBeenCalledWith(PROJECT_ROUTES.DELETE(SLUG, PROJECT_ID));
    });

    it('propage l’erreur du client', async () => {
      vi.mocked(apiClient.delete).mockRejectedValue(new Error('forbidden'));
      await expect(deleteProject(SLUG, PROJECT_ID)).rejects.toThrow('forbidden');
    });
  });

  describe('listProjectMembers', () => {
    it('GET les membres', async () => {
      const members = [{ id: 1, userId: 10 }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(members));

      const result = await listProjectMembers(SLUG, PROJECT_ID);

      expect(apiClient.get).toHaveBeenCalledWith(PROJECT_ROUTES.MEMBERS(SLUG, PROJECT_ID));
      expect(result).toEqual(members);
    });
  });

  describe('addProjectMember', () => {
    it('POST le payload d’ajout de membre', async () => {
      const payload = { email: 'a@b.c', role: 'MEMBER' as const };
      const member = { id: 1, userId: 10, role: 'MEMBER' } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(member));

      const result = await addProjectMember(SLUG, PROJECT_ID, payload);

      expect(apiClient.post).toHaveBeenCalledWith(PROJECT_ROUTES.MEMBERS(SLUG, PROJECT_ID), payload);
      expect(result).toEqual(member);
    });
  });

  describe('removeProjectMember', () => {
    it('DELETE le membre', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await removeProjectMember(SLUG, PROJECT_ID, 99);

      expect(apiClient.delete).toHaveBeenCalledWith(PROJECT_ROUTES.MEMBER(SLUG, PROJECT_ID, 99));
    });
  });

  describe('listProjectTeams', () => {
    it('GET les équipes associées', async () => {
      const teams = [{ teamId: 3, name: 'Core' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(teams));

      const result = await listProjectTeams(SLUG, PROJECT_ID);

      expect(apiClient.get).toHaveBeenCalledWith(PROJECT_ROUTES.TEAMS(SLUG, PROJECT_ID));
      expect(result).toEqual(teams);
    });
  });

  describe('attachProjectTeam', () => {
    it('POST { teamId } sur la route teams', async () => {
      const team = { teamId: 3, name: 'Core' } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(team));

      const result = await attachProjectTeam(SLUG, PROJECT_ID, 3);

      expect(apiClient.post).toHaveBeenCalledWith(PROJECT_ROUTES.TEAMS(SLUG, PROJECT_ID), { teamId: 3 });
      expect(result).toEqual(team);
    });
  });

  describe('detachProjectTeam', () => {
    it('DELETE la route team', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await detachProjectTeam(SLUG, PROJECT_ID, 3);

      expect(apiClient.delete).toHaveBeenCalledWith(PROJECT_ROUTES.TEAM(SLUG, PROJECT_ID, 3));
    });
  });

  describe('getProjectActivity', () => {
    it('GET l’activité avec les params days par défaut (14)', async () => {
      const points = [{ date: '2026-07-01', count: 2 }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(points));

      const result = await getProjectActivity(SLUG, PROJECT_ID);

      expect(apiClient.get).toHaveBeenCalledWith(PROJECT_ROUTES.ACTIVITY(SLUG, PROJECT_ID), {
        params: { days: 14 },
      });
      expect(result).toEqual(points);
    });

    it('respecte un days personnalisé', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(envelope([]));

      await getProjectActivity(SLUG, PROJECT_ID, 30);

      expect(apiClient.get).toHaveBeenCalledWith(PROJECT_ROUTES.ACTIVITY(SLUG, PROJECT_ID), {
        params: { days: 30 },
      });
    });
  });

  describe('listProjectLabels', () => {
    it('GET les labels', async () => {
      const labels = [{ id: 1, name: 'bug' }] as any;
      vi.mocked(apiClient.get).mockResolvedValue(envelope(labels));

      const result = await listProjectLabels(SLUG, PROJECT_ID);

      expect(apiClient.get).toHaveBeenCalledWith(PROJECT_ROUTES.LABELS(SLUG, PROJECT_ID));
      expect(result).toEqual(labels);
    });
  });

  describe('createProjectLabel', () => {
    it('POST le payload de label', async () => {
      const payload = { name: 'bug', color: '#f00' };
      const label = { id: 1, ...payload } as any;
      vi.mocked(apiClient.post).mockResolvedValue(envelope(label));

      const result = await createProjectLabel(SLUG, PROJECT_ID, payload);

      expect(apiClient.post).toHaveBeenCalledWith(PROJECT_ROUTES.LABELS(SLUG, PROJECT_ID), payload);
      expect(result).toEqual(label);
    });
  });

  describe('deleteProjectLabel', () => {
    it('DELETE le label', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(envelope(null));

      await deleteProjectLabel(SLUG, PROJECT_ID, 5);

      expect(apiClient.delete).toHaveBeenCalledWith(PROJECT_ROUTES.LABEL(SLUG, PROJECT_ID, 5));
    });
  });
});
